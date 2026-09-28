"""Controlled broker-only checks; worker must be stopped, temporary ACL explicitly installed.
No registration, Kafka write, retained publication, database write or private-key output.
"""
import json, socket, ssl, struct, uuid
from pathlib import Path

ROOT = Path('/etc/ems-cloud-v3')
DEVICE = (ROOT / 'mqtt-test/identity').read_text().strip()
assert str(uuid.UUID(DEVICE, version=4)) == DEVICE
CLOUD = 'ems-cloud-v3-ingestion'
HOST = '120.27.23.229'
PORT = 8884
results = []

def utf(value):
    raw = value.encode() if isinstance(value, str) else value
    assert len(raw) <= 65535
    return struct.pack('!H', len(raw)) + raw

def length(value):
    result = bytearray()
    while True:
        digit = value % 128
        value //= 128
        result.append(digit | (128 if value else 0))
        if not value:
            return bytes(result)

def packet(kind, body):
    return bytes([kind]) + length(len(body)) + body

class Client:
    def __init__(self, identity, kind='device', host='127.0.0.1', no_cert=False):
        context = ssl.create_default_context(cafile=str(ROOT / 'client-tls/ca.crt'))
        if not no_cert:
            base = ROOT / {'cloud': 'client-tls', 'device': 'mqtt-test', 'invalid': 'mqtt-negative-cn'}[kind]
            context.load_cert_chain(str(base / 'client.crt'), str(base / 'client.key'))
        self.sock = context.wrap_socket(socket.create_connection((host, PORT), timeout=3), server_hostname=HOST)
        self.identity = identity
        self.pid = 0

    def connect(self, username=None, version=4, giant=None):
        flags = 2 | (128 if username is not None else 0)
        payload = utf(self.identity)
        if giant:
            flags = 198  # username, password, clean session, QoS0 will
            payload += utf(f'ems/v1/{DEVICE}/up/heartbeat') + utf(b'w' * 65535)
            base = utf('MQTT') + bytes([version, flags]) + b'\x00\x1e' + payload + utf(b'') + utf(b'p' * 65535)
            padding = giant - 4 - len(base)
            assert 0 <= padding <= 65535
            body = utf('MQTT') + bytes([version, flags]) + b'\x00\x1e' + payload + utf(b'u' * padding) + utf(b'p' * 65535)
        else:
            if username is not None:
                payload += utf(username)
            body = utf('MQTT') + bytes([version, flags]) + b'\x00\x1e' + (b'\x00' if version == 5 else b'') + payload
        data = packet(16, body)
        if giant:
            assert len(data) == giant
        self.sock.sendall(data)
        kind, response = self.receive()
        assert kind == 32 and len(response) >= 2
        return response[1]

    def take(self, count):
        chunks = bytearray()
        while len(chunks) < count:
            part = self.sock.recv(count - len(chunks))
            if not part:
                raise ConnectionError('broker closed connection')
            chunks.extend(part)
        return bytes(chunks)

    def receive(self, timeout=3):
        self.sock.settimeout(timeout)
        kind = self.take(1)[0]
        size, factor = 0, 1
        for _ in range(4):
            digit = self.take(1)[0]
            size += (digit & 127) * factor
            if digit < 128:
                break
            factor *= 128
        assert size <= 200000
        return kind, self.take(size)

    def subscribe(self, topic):
        self.pid += 1
        self.sock.sendall(packet(130, struct.pack('!H', self.pid) + utf(topic) + b'\x00'))
        kind, body = self.receive()
        assert kind == 144 and body[:2] == struct.pack('!H', self.pid)
        return body[2]

    def publish(self, topic, payload):
        self.pid += 1
        self.sock.sendall(packet(50, utf(topic) + struct.pack('!H', self.pid) + payload))
        kind, body = self.receive()
        assert kind == 64 and body == struct.pack('!H', self.pid)

    def message(self):
        kind, body = self.receive()
        assert kind >> 4 == 3
        size = struct.unpack('!H', body[:2])[0]
        return body[2:2 + size].decode(), body[2 + size:]

    def no_message(self):
        try:
            self.receive(timeout=0.7)
        except socket.timeout:
            return
        raise AssertionError('unexpected subscriber delivery')

    def close(self):
        try:
            self.sock.sendall(b'\xe0\x00')
        except OSError:
            pass
        self.sock.close()

def check(name, action):
    try:
        action()
        results.append({'check': name, 'passed': True})
    except Exception as error:
        results.append({'check': name, 'passed': False, 'error': type(error).__name__, 'detail': str(error)[:180]})

def denied(identity, **options):
    client = None
    try:
        no_cert = options.pop('no_cert', False)
        client = Client(identity, kind=options.pop('kind', 'device'), no_cert=no_cert)
        assert client.connect(**options) != 0, 'unexpected authorized CONNACK'
    except (ssl.SSLError, ConnectionError, socket.timeout):
        pass
    finally:
        if client:
            client.close()

def hairpin():
    client = Client(CLOUD, kind='cloud', host=HOST)
    try:
        assert client.connect() == 0
    finally:
        client.close()

check('public_ip_hairpin_tls_hostname_and_cloud_identity', hairpin)
check('original_client_id_must_match_certificate', lambda: denied('wrong-client-id'))
check('mqtt5_rejected', lambda: denied(DEVICE, version=5))
check('client_certificate_required', lambda: denied(DEVICE, no_cert=True))
check('unsupported_certificate_cn_rejected', lambda: denied('invalid-ems-test-identity', kind='invalid'))

cloud = Client(CLOUD, kind='cloud')
device = Client(DEVICE)
try:
    assert cloud.connect() == 0 and device.connect(username=CLOUD) == 0
    telemetry = f'ems/v1/{DEVICE}/up/telemetry'
    request = f'ems/v1/{DEVICE}/down/request'
    assert cloud.subscribe(telemetry) == 0 and device.subscribe(request) == 0

    def exact_payload():
        payload = b'x' * 131072
        device.publish(telemetry, payload)
        assert cloud.message() == (telemetry, payload)
    check('payload_131072_delivered_exactly', exact_payload)

    def down_positive():
        cloud.publish(request, b'isolated-down-probe')
        assert device.message() == (request, b'isolated-down-probe')
    check('cloud_down_to_explicit_device_allowed', down_positive)

    def spoof_denied():
        device.publish(request, b'isolated-spoof-probe')
        device.no_message()
    check('spoofed_connect_username_cannot_publish_down', spoof_denied)

    def other_device_denied():
        other = '11111111-1111-4111-8111-111111111111'
        topic = f'ems/v1/{other}/down/request'
        grant = device.subscribe(topic)
        assert grant in (0, 128)
        cloud.publish(topic, b'isolated-other-device-probe')
        device.no_message()
    check('device_cannot_read_other_identity', other_device_denied)

    def oversized_payload():
        device.publish(telemetry, b'x' * 131073)
        cloud.no_message()
    check('payload_131073_not_delivered', oversized_payload)

    def cloud_cannot_publish_up():
        cloud.publish(telemetry, b'isolated-cloud-up-probe')
        cloud.no_message()
    check('cloud_cannot_publish_device_up', cloud_cannot_publish_up)
finally:
    device.close()
    cloud.close()

def packet_boundary(size, expected):
    client = Client(DEVICE)
    try:
        assert client.connect() == 0
        # Use a legal-sized payload and a long non-authorized topic. A transport
        # PUBACK proves packet acceptance, not ACL delivery or a business ACK.
        topic = f'ems/v1/{DEVICE}/up/telemetry/'
        topic += 'x' * (size - 131072 - 8 - len(topic))
        data = packet(50, utf(topic) + b'\x00\x01' + b'p' * 131072)
        assert len(data) == size
        try:
            client.sock.sendall(data)
            kind, body = client.receive()
            assert expected and kind == 64 and body == b'\x00\x01'
        except (ConnectionError, ssl.SSLError, socket.timeout):
            if expected:
                raise
    finally:
        client.close()

check('packet_147456_accepted', lambda: packet_boundary(147456, True))
check('packet_147457_rejected', lambda: packet_boundary(147457, False))
print(json.dumps({'scope': 'controlled broker checks only; no real EMS binding', 'results': results}, indent=2))
raise SystemExit(0 if all(item['passed'] for item in results) else 1)
