# MQTT certificate identity prerequisite

The C plugin in `ems-cloud-ingestion/deploy/mqtt` was compiled and tested on the server's Mosquitto 2.0.18 headers with `-Wall -Wextra -Werror`. The initial missing-implementation test failed; the implemented certificate identity tests and shared-library build passed.

An isolated loopback listener on port 18886 verified the six checks in `live-result.json`. The denied spoofed username down-channel publication was verified from the broker's `Denied PUBLISH` log, not the MQTT 3.1.1 publisher exit code (which can acknowledge a rejected publication). A later isolated boundary check delivered exactly131072 bytes unchanged and rejected131073 bytes, checking both absent subscriber delivery and the broker's oversized-message log (`boundary-result.json`). Both test listeners were stopped afterward. Production port 8883 and the Task4 listener on 18885 were unchanged.

The plugin requires broker certificate-chain validation (`require_certificate true`), `use_identity_as_username false`, and `use_username_as_clientid false`. It verifies the original ClientID against the single certificate CN, accepts lowercase UUIDv4 device identities or the configured cloud identity, and sets the internal ACL username from that certificate. Mosquitto's built-in certificate username shortcut skips BASIC_AUTH callbacks, so it must remain disabled for this plugin. MQTT version is restricted to 3.1.1.

The first isolated service launch failed because it used a Linux user without access to the existing test ACL. Reusing the test broker's `mosquitto` service identity corrected the failure without expanding filesystem permissions.

This is a Task10 prerequisite, not production rollout or hardware acceptance. Production deployment still needs independent review, exact-topic ACLs, packet-limit validation, old bridge/preflight replacement, and rollback verification.
