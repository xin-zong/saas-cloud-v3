#!/bin/bash
set -euo pipefail
# Validate the entire list before emitting anything. No synthetic default device.
declare -A seen=()
for id in "$@"; do
    [[ $id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || { echo 'Invalid device UUIDv4' >&2; exit 1; }
    [[ ! ${seen[$id]+present} ]] || { echo 'Duplicate device UUID' >&2; exit 1; }
    seen[$id]=1
done
up=(heartbeat status response telemetry important alarm)
down=(request ack)
echo 'user ems-cloud-v3-ingestion'
for channel in "${up[@]}"; do echo "topic read ems/v1/+/up/$channel"; done
for channel in "${down[@]}"; do echo "topic write ems/v1/+/down/$channel"; done
for id in "$@"; do
    printf '\nuser %s\n' "$id"
    for channel in "${up[@]}"; do echo "topic write ems/v1/$id/up/$channel"; done
    for channel in "${down[@]}"; do echo "topic read ems/v1/$id/down/$channel"; done
done
