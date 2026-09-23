#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || {
    printf 'ERROR: sudo is required. Run this script as root.\n' >&2
    exit 1
  }
  exec sudo -E bash "$0" "$@"
fi

if [[ ! -r /etc/os-release ]]; then
  printf 'ERROR: This installer supports Ubuntu only.\n' >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  printf 'ERROR: This installer supports Ubuntu only. Detected: %s\n' "${ID:-unknown}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  printf 'Installing Docker Engine and Docker Compose...\n'
  apt-get update
  apt-get install -y ca-certificates curl
  installer="$(mktemp)"
  trap 'rm -f "$installer"' EXIT
  curl -fsSL https://get.docker.com -o "$installer"
  sh "$installer"
fi

systemctl enable --now docker
docker compose version >/dev/null 2>&1 || {
  printf 'ERROR: Docker Compose v2 was not installed successfully.\n' >&2
  exit 1
}

bash "$SCRIPT_DIR/deploy.sh"
