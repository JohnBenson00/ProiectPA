#!/usr/bin/env bash
# Install or update Râșnov Trains on a Raspberry Pi (or any Linux box) in your Tailscale network.
#
#   ./pi-tailscale.sh            # reachable only inside your tailnet:  https://<pi-name>.<tailnet>.ts.net
#   ./pi-tailscale.sh funnel     # also public on the internet via Tailscale Funnel (same address)
#
# Safe to run again: it updates the app and keeps the data in deploy/data.
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-tailnet}"
if [[ "$MODE" != "tailnet" && "$MODE" != "funnel" ]]; then
  echo "usage: $0 [tailnet|funnel]" >&2
  exit 1
fi

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
SUDO=""
[[ "$(id -u)" -ne 0 ]] && SUDO="sudo"

# ---- 1. Docker ----
if ! have docker; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO usermod -aG docker "${SUDO_USER:-$USER}" || true
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="$SUDO docker"
$DOCKER compose version >/dev/null

# ---- 2. Tailscale ----
if ! have tailscale; then
  say "Installing Tailscale"
  curl -fsSL https://tailscale.com/install.sh | $SUDO sh
fi
if ! $SUDO tailscale status >/dev/null 2>&1; then
  say "Log this Pi in to your tailnet (open the link that appears)"
  $SUDO tailscale up
fi
TS_NAME="$($SUDO tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
if [[ -z "$TS_NAME" || "$TS_NAME" != *.ts.net ]]; then
  echo "Could not read this machine's tailnet name. Enable MagicDNS in the Tailscale admin console (DNS page)." >&2
  exit 1
fi
URL="https://$TS_NAME"

# ---- 3. Settings (.env) ----
[[ -f .env ]] || cp .env.example .env
set_env() {
  if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
set_env DOMAIN "$TS_NAME"
set_env PUBLIC_URL "$URL"
set_env TRUST_PROXY 1

# ---- 4. Build and start the app (listens on 127.0.0.1:3001 only) ----
say "Building and starting the app (the first build takes a few minutes on a Pi)"
$DOCKER compose up -d --build app
for _ in $(seq 1 90); do
  curl -fs http://127.0.0.1:3001/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fs http://127.0.0.1:3001/api/health >/dev/null || { echo "The app did not start. See: $DOCKER compose logs app" >&2; exit 1; }

# ---- 5. HTTPS through Tailscale (certificate for $TS_NAME is automatic) ----
if [[ "$MODE" == "funnel" ]]; then
  say "Publishing $URL on the internet (Tailscale Funnel)"
  $SUDO tailscale funnel --bg 3001
else
  say "Serving $URL inside your tailnet"
  $SUDO tailscale serve --bg 3001
fi

# ---- 6. Done ----
say "Râșnov Trains is running"
echo "  Site:   $URL"
echo "  Staff:  $URL/admin"
PW_FILE="data/initial-admin-password.txt"
if [[ -f "$PW_FILE" ]]; then
  echo "  First login:"
  { cat "$PW_FILE" 2>/dev/null || $SUDO cat "$PW_FILE"; } | sed 's/^/    /'
  echo "  Change this password after logging in, then delete $PW_FILE."
fi
[[ "$MODE" == "tailnet" ]] && echo "  Only devices logged in to your tailnet can open it. Use '$0 funnel' to make it public."
echo "  Logs: $DOCKER compose logs -f app    Update: git pull && $0 $MODE"
