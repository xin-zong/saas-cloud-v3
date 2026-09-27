#!/bin/bash
set -euo pipefail
# systemd reads managed EnvironmentFiles; never source them as executable shell.
for key in EMS_DB_URL EMS_DB_USERNAME EMS_DB_PASSWORD EMS_CH_HTTP_URL EMS_CH_USER EMS_CH_PASSWORD EMS_MQTT_URI EMS_MQTT_CA EMS_MQTT_CERT EMS_MQTT_KEY; do
    [[ -n ${!key:-} ]] || { echo "Missing managed environment: $key" >&2; exit 1; }
done
[[ $EMS_MQTT_URI == ssl://120.27.23.229:8884 ]] || { echo 'Strict MQTT URI must match reviewed certificate SAN and dedicated port' >&2; exit 1; }
export EMS_DATABASE_URL="$EMS_DB_URL"
export EMS_DATABASE_USER="$EMS_DB_USERNAME"
export EMS_DATABASE_PASSWORD="$EMS_DB_PASSWORD"
exec /usr/lib/jvm/java-21-openjdk-amd64/bin/java -Xms128m -Xmx768m -jar /opt/ems-cloud-v3/current/ems-cloud-ingestion.jar
