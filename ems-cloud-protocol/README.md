# EMS v1 wire protocol library

`new WireDecoder().decode(topic, payload)` accepts the six `ems/v1/{lowercase UUIDv4}/up/{channel}` channels and returns `WireMessage`. For heartbeat, status and response (which do not carry a wire `type`), the type discriminator is the channel name.

The library validates strict UTF-8/JSON, duplicate keys, trailing tokens, Unicode scalar strings/keys (including JSON escapes), topic/identity/type routing, required envelope fields, shapes and explicitly defined ranges. Unknown extension fields remain in the returned body and hash. JSON integers and decimal values retain exact precision; canonical SHA-256 sorts object keys, preserves array order and nulls, and normalizes mathematically equal numeric spellings. Payload caps apply to received UTF-8 bytes: 6 KiB normally, 64 KiB for structure/response, 128 KiB for alarm_data; an alarm_current response retains its whole-envelope 6 KiB cap.

This is a normal Java 21 library using Spring Boot 3.5.15 dependency management, with no executable repackage plugin. Parsing limits are depth 64, number token length 1024 and string length 131072, in addition to payload size limits. Errors expose safe fixed messages without raw input or parser causes.

Envelope acceptance does not verify point catalog completeness or semantics, physical units, four-word point bitmaps, matching cell/structure layouts, assigned cabinet/device identity, current connection, snapshot order, quality freshness, alarm lifecycle, historical identity conflicts, durable storage or ACK timing. Those belong to downstream handlers. This module creates no transport, persistence, API or control behavior.

## Source fixtures

The nine JSON files under `src/test/resources/wire` are byte-for-byte copies of the independent reference files alongside `05_EMS与云端MQTT交互协议.md` in the supplied `20260917` materials. The protocol is SS-EMS-CLOUD-05 V0.5, SHA-256 `C00D096A3D4E418A5FCC411C51B03801132F657695E5DB5ECAE5540EC1D93E0D`. All examples are synthetic format references. The cell and structure examples describe different layouts; tests accept them independently and do not represent them as one consistent deployment.

Tests additionally use the document's heartbeat/status/response and alarm_current forms, including legacy `communication.status.get` response shape. No down/request or down/ack decoding is supported by this interface.

Run from the repository root: `mvn -pl ems-cloud-protocol test` or `mvn test` for the complete reactor.
