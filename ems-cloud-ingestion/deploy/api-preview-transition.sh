#!/bin/bash
set -euo pipefail
verify_api_cors() {
    local origin headers allowed
    for origin in http://localhost:8443 http://127.0.0.1:8443; do
        headers=$(curl --silent --fail --max-time 2 --dump-header - --output /dev/null \
          --header "Origin: $origin" http://127.0.0.1:18090/api/health) || return 1
        allowed=$(printf '%s\n' "$headers" | awk 'tolower($1)=="access-control-allow-origin:" {gsub("\r", "", $2); print $2}')
        [[ $allowed == "$origin" ]] || { echo "API CORS response does not permit $origin" >&2; return 1; }
    done
}
# No legacy API unit is touched. Original preview jar/runtime env remain in place.
[[ $EUID == 0 && $# == 1 ]] || { echo 'Usage (root): api-preview-transition.sh promote|restore-preview' >&2; exit 1; }
case "$1" in
promote)
    command -v curl >/dev/null
    systemctl is-active --quiet ems-cloud-v3-api-preview.service || { echo 'Expected preview is not active; investigate port owner' >&2; exit 1; }
    [[ -f /opt/ems-cloud-v3/current/ems-cloud-api.jar ]] || exit 1
    trap 'echo "API promotion failed; restoring original preview" >&2; /bin/bash "$0" restore-preview' ERR
    systemctl stop ems-cloud-v3-api-preview.service
    systemctl start ems-cloud-v3-api.service
    ready=false
    for attempt in {1..30}; do
        if curl --silent --fail --max-time 2 http://127.0.0.1:18090/api/health >/dev/null; then ready=true; break; fi
        sleep 1
    done
    [[ $ready == true ]]
    systemctl is-active --quiet ems-cloud-v3-api.service
    verify_api_cors
    trap - ERR
    # Enable only after root verifies HTTP readiness and authenticated acceptance.
    ;;
restore-preview)
    systemctl disable --now ems-cloud-v3-api.service
    if ! systemctl start ems-cloud-v3-api-preview.service 2>/dev/null; then
        # Transient units can disappear on stop. Recreate only the known preview.
        [[ -z $(ss -H -ltn 'sport = :18090') ]] || { echo '18090 occupied; refusing preview recreation' >&2; exit 1; }
        [[ $(sha256sum /var/lib/ems-cloud-v3/api-preview/ems-cloud-api.jar | cut -d' ' -f1) == 47f2952443b430edf13daeb59bad66b41f15f0b198108b6cc100662fdaca833d ]] || { echo 'Original preview artifact mismatch' >&2; exit 1; }
        systemd-run --unit=ems-cloud-v3-api-preview --property=User=ems-cloud-v3 --property=Group=ems-cloud-v3 \
          --property=EnvironmentFile=/etc/ems-cloud-v2-proto/runtime.env \
          --setenv=EMS_BIND_ADDRESS=127.0.0.1 --setenv=EMS_PORT=18090 \
          --setenv=EMS_CORS_ORIGINS=http://localhost:8443,http://127.0.0.1:8443 \
          /usr/lib/jvm/java-21-openjdk-amd64/bin/java -Xmx512m -jar /var/lib/ems-cloud-v3/api-preview/ems-cloud-api.jar
    fi
    ready=false
    for attempt in {1..30}; do
        if verify_api_cors; then ready=true; break; fi
        sleep 1
    done
    [[ $ready == true ]]
    ;;
*) echo 'Unknown action' >&2; exit 1;;
esac
