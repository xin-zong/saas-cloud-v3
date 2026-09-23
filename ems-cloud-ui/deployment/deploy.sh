#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 ||
  fail "Docker is not installed. On Ubuntu, run: sudo bash install-and-deploy-ubuntu.sh"

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose v2 is not available. Install the docker-compose-plugin package."

docker info >/dev/null 2>&1 ||
  fail "Docker is not running or the current user cannot access it. Try: sudo bash deploy.sh"

[[ -f dist/index.html ]] ||
  fail "dist/index.html is missing. Upload the complete deployment package."

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

printf 'Pulling the web server image...\n'
docker compose pull

printf 'Starting Enerlution...\n'
docker compose up -d --remove-orphans --force-recreate

container_id="$(docker compose ps -q web)"
[[ -n "$container_id" ]] || fail "The web container was not created."

printf 'Waiting for the health check'
for _ in $(seq 1 30); do
  health="$(
    docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id" 2>/dev/null || true
  )"
  if [[ "$health" == "healthy" || "$health" == "running" ]]; then
    printf '\n'
    break
  fi
  if [[ "$health" == "unhealthy" || "$health" == "exited" || "$health" == "dead" ]]; then
    printf '\n'
    docker compose logs --tail=100 web
    fail "The web container failed its health check."
  fi
  printf '.'
  sleep 2
done

health="$(
  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$container_id" 2>/dev/null || true
)"
[[ "$health" == "healthy" || "$health" == "running" ]] || {
  docker compose logs --tail=100 web
  fail "Timed out while waiting for the web container."
}

app_port="$(
  sed -nE 's/^[[:space:]]*APP_PORT[[:space:]]*=[[:space:]]*([^#[:space:]]+).*/\1/p' .env |
    tail -n 1
)"
public_host="$(
  sed -nE 's/^[[:space:]]*PUBLIC_HOST[[:space:]]*=[[:space:]]*([^#[:space:]]+).*/\1/p' .env |
    tail -n 1
)"
app_port="${app_port:-80}"
public_host="${public_host:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
public_host="${public_host:-SERVER_PUBLIC_IP}"

if [[ "$app_port" == "80" ]]; then
  url="http://${public_host}"
else
  url="http://${public_host}:${app_port}"
fi

printf '\nEnerlution is running.\n'
printf 'URL: %s\n' "$url"
printf 'Health: %s/healthz\n' "$url"
printf 'Logs: bash logs.sh\n'
