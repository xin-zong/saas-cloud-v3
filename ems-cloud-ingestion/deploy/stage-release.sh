#!/bin/bash
set -euo pipefail
# Input bundle is already reviewed, built, and checksummed by the controller.
# Only stages immutable files. Does NOT change current, units, config or services.
[[ $EUID == 0 && $# == 2 ]] || { echo 'Usage (root): stage-release.sh BUNDLE RELEASE_ID' >&2; exit 1; }
bundle=$(realpath -e "$1")
id=$2
[[ $id =~ ^[a-z0-9][a-z0-9-]{7,63}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
release=/opt/ems-cloud-v3/releases/$id
[[ ! -e $release ]] || { echo 'Release already exists; refusing overwrite' >&2; exit 1; }
cd "$bundle"
# A fixed allowlist prevents a crafted checksum file from reading other paths.
for item in ems-cloud-api.jar ems-cloud-ingestion.jar ems_identity.so; do
    [[ -f $item && ! -L $item ]] || { echo 'Required regular artifact missing' >&2; exit 1; }
    expected=$(awk -v name="$item" '$2 == name {print $1}' SHA256SUMS)
    [[ $expected =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid artifact manifest' >&2; exit 1; }
    actual=$(sha256sum "$item"); actual=${actual%% *}
    [[ $actual == "$expected" ]] || { echo 'Artifact hash mismatch' >&2; exit 1; }
done
[[ -d deploy && ! -L deploy ]] || { echo 'Deployment source missing' >&2; exit 1; }
[[ -z $(find deploy -type l -print -quit) ]] || { echo 'Deployment source must not contain symlinks' >&2; exit 1; }
install -d -o root -g root -m 0755 /opt/ems-cloud-v3/releases "$release"
for item in ems-cloud-api.jar ems-cloud-ingestion.jar ems_identity.so SHA256SUMS; do
    install -o root -g root -m 0644 "$item" "$release/$item"
done
cp -R deploy "$release/deploy"
chown -R root:root "$release/deploy"
find "$release/deploy" -type d -exec chmod 0755 {} +
find "$release/deploy" -type f -exec chmod 0644 {} +
find "$release/deploy" -type f -name '*.sh' -exec chmod 0755 {} +
echo "Staged $release; activation remains a separate reviewed action"
