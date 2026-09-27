# Task4 server-only transport check

Frozen artifact: `ems-cloud-ingestion/target/task4-live.zip` (classes, test-classes, live-lib; no credentials).
Extract to `/tmp/ems-task4-live`. Execute with server Java21:

```sh
/usr/lib/jvm/java-21-openjdk-amd64/bin/java -cp '/tmp/ems-task4-live/classes:/tmp/ems-task4-live/test-classes:/tmp/ems-task4-live/live-lib/*' com.enerlution.ems.ingestion.TransportLiveCheck
```

Load credentials from managed server env without printing them. Required environment:

| Variable | Value/source |
|---|---|
| EMS_DATABASE_URL | jdbc:postgresql://127.0.0.1:5432/ems_cloud_v2_proto?currentSchema=ems_ingestion_tests |
| EMS_DATABASE_USER | EMS_TEST_DB_USER from server ingestion-test.env |
| EMS_DATABASE_PASSWORD | EMS_TEST_DB_PASSWORD from server ingestion-test.env |
| EMS_MQTT_URI | ssl://127.0.0.1:18885 |
| EMS_MQTT_CLIENT_ID | ems-cloud-v3-ingestion |
| EMS_MQTT_CA | /etc/ems-cloud-v3/mqtt/ca.crt |
| EMS_MQTT_CERT | /etc/ems-cloud-v3/mqtt/client.crt |
| EMS_MQTT_KEY | /etc/ems-cloud-v3/mqtt/client.key |
| EMS_TEST_MQTT_CA | /etc/ems-cloud-v3/mqtt-test/ca.crt |
| EMS_TEST_MQTT_CERT | /etc/ems-cloud-v3/mqtt-test/client.crt |
| EMS_TEST_MQTT_KEY | /etc/ems-cloud-v3/mqtt-test/client.key |
| EMS_KAFKA_CONFIG | /etc/ems-cloud-v3/kafka-client.properties |
| EMS_KAFKA_FAST_TOPIC | ems-cloud-v3.test.task4-20260928.fast.v1 |
| EMS_KAFKA_STATE_TOPIC | ems-cloud-v3.test.task4-20260928.state.v1 |
| EMS_KAFKA_RELIABLE_TOPIC | ems-cloud-v3.test.task4-20260928.reliable.v1 |

Optional EMS_QUEUE_CAPACITY=256, EMS_LEASE_SECONDS=30. Managed Kafka properties use FileConfigProvider. Disable verbose Kafka logging (WARN) if the standalone logging default differs; no command echoes credentials.

Fixture in independent `ems_ingestion_tests` schema: device/gateway755facdc-9bdf-43d0-9412-c94f860a01ec with current binding; second device/gateway c75fa8ae-bb83-49a2-8f72-bc83db7f4267 without active binding. Run using restricted test worker role. Test touches only connection_state and reads gateway/binding; never modifies V11 or real business schema.

Checks: unknown and unbound registration rejection; competing lease owner rejection; lease expiry increases numeric fence and rejects stale owner; actual mTLS MQTT3.1.1 sends heartbeat, cell voltage and important history; consumer validates all three dedicated Kafka lanes, key, raw body, arrival time, epoch/order/fence; subscribes device down channel and sees zero business ACK. Close shuts down callback client, pumps and producer.

Expected single success marker `TASK4_LIVE_PASS ...`. Root owns topic/ACL/group deletion, broker stop, independent schema removal and archive removal after evidence capture. This does not validate production listener or strict ClientID/CN admission (Task10).
