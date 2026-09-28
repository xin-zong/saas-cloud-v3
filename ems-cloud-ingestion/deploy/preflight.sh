#!/bin/bash
set -euo pipefail
# Read-only checks. No secrets or EnvironmentFile contents are emitted.
[[ $EUID == 0 && $# == 1 ]] || { echo 'Usage (root): preflight.sh RELEASE_PATH' >&2; exit 1; }
release=$(realpath -e "$1")
[[ $release =~ ^/opt/ems-cloud-v3/releases/[a-z0-9][a-z0-9-]{7,63}$ ]] || { echo 'Invalid managed release path' >&2; exit 1; }
fail() { echo "FAIL: $1" >&2; exit 1; }
verify_mosquitto_version() {
    [[ $1 =~ ^mosquitto\ version\ 2\.0\.18($|[[:space:]]) ]] || fail 'Unmeasured Mosquitto version; remeasure full packet boundaries before deployment'
}
check_mosquitto_binary() {
    local broker_banner help_status=0
    # Installed 2.0.18 emits valid help with status3; capture without errexit.
    broker_banner=$("$1" -h 2>&1) || help_status=$?
    [[ $help_status == 0 || $help_status == 3 ]] || fail 'Cannot identify installed Mosquitto version: unexpected help status'
    verify_mosquitto_version "$broker_banner"
}
check_mosquitto_binary /usr/sbin/mosquitto
for tool in ss openssl runuser systemd-analyze sha256sum; do command -v "$tool" >/dev/null || fail "missing tool $tool"; done
[[ -x /usr/lib/jvm/java-21-openjdk-amd64/bin/java ]] || fail 'Java21 missing'
[[ -z $(ss -H -ltn 'sport = :8884') ]] || fail '8884 already listening; investigate without stopping legacy services'
for file in database.env clickhouse.env ingestion.env kafka-client.properties kafka.secrets.properties kafka-ca.crt; do
    path=/etc/ems-cloud-v3/$file
    [[ -f $path && $(stat -c %U:%G:%a "$path") == root:ems-cloud-v3:640 ]] || fail "managed owner/mode for $file"
    runuser -u ems-cloud-v3 -- test -r "$path" || fail "worker cannot read $file"
done
for file in client-tls/ca.crt client-tls/client.crt client-tls/client.key; do
    path=/etc/ems-cloud-v3/$file
    [[ -f $path && $(stat -c %U:%G:%a "$path") == root:ems-cloud-v3:640 ]] || fail "managed owner/mode for $file"
    runuser -u ems-cloud-v3 -- test -r "$path" || fail "worker cannot read $file"
done
for file in broker-tls/client-ca.crt broker-tls/server.crt broker-tls/server.key mqtt.acl mqtt.conf; do
    path=/etc/ems-cloud-v3/$file
    [[ -f $path && $(stat -c %U:%G:%a "$path") == root:mosquitto:640 ]] || fail "managed owner/mode for $file"
    runuser -u mosquitto -- test -r "$path" || fail "broker cannot read $file"
done
[[ $(stat -c %U:%G:%a /etc/ems-cloud-v3) == root:root:755 ]] || fail 'managed directory must permit both service identities to traverse'
cmp -s "$release/deploy/mqtt/strict.conf" /etc/ems-cloud-v3/mqtt.conf || fail 'broker configuration differs from reviewed template'
openssl verify -purpose sslserver -CAfile /etc/ems-cloud-v3/client-tls/ca.crt /etc/ems-cloud-v3/broker-tls/server.crt >/dev/null || fail 'server CA verification'
openssl x509 -in /etc/ems-cloud-v3/broker-tls/server.crt -noout -checkip 120.27.23.229 | grep -q 'does match' || fail 'server SAN mismatch'
openssl verify -purpose sslclient -CAfile /etc/ems-cloud-v3/broker-tls/client-ca.crt /etc/ems-cloud-v3/client-tls/client.crt >/dev/null || fail 'client CA verification'
for cert in broker-tls/server.crt client-tls/client.crt; do
    openssl x509 -in "/etc/ems-cloud-v3/$cert" -noout -checkend 86400 >/dev/null || fail 'certificate expires within 24h'
done
for pair in broker-tls/server client-tls/client; do
    cert_hash=$(openssl x509 -in "/etc/ems-cloud-v3/$pair.crt" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum)
    key_hash=$(openssl pkey -in "/etc/ems-cloud-v3/$pair.key" -pubout -outform DER 2>/dev/null | sha256sum)
    [[ $cert_hash == "$key_hash" ]] || fail 'certificate/private key mismatch'
done
(cd "$release"; sha256sum --check SHA256SUMS >/dev/null) || fail 'frozen artifact hash mismatch'
systemd-analyze verify "$release"/deploy/systemd/*.service
echo 'PASS: files, permissions, dedicated port, TLS and unit validation; DB/Kafka/live acceptance still required'
