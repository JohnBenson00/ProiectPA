# Deployment handoff: Râșnov Trains on the Raspberry Pi (Tailscale)

**Audience:** a Claude Code instance running *on the Raspberry Pi* (or on a machine in the same Tailscale network that can run commands on the Pi).
**Goal:** get Râșnov Trains running on the Pi, reachable over HTTPS at `https://<pi-name>.<tailnet>.ts.net`, verify it works, and report back to the user.

Read this whole file before running anything.

---

## 1. Context

- Repository: `https://github.com/JohnBenson00/ProiectPA` (private). Working branch: **`ccr-6a3246be-n0ixbk`** (not merged into `main` yet).
- The app is a train ticket booking system (React web app + Node.js API with SQLite) for a student project. Prices and payment are fictional/simulated.
- Everything needed for deployment already exists and was tested in a cloud sandbox (Docker image built and run, script tested with stand-in `docker`/`tailscale`). It was **never run on real Pi hardware or real Tailscale**. That is your job.
- Relevant files:
  - `deploy/pi-tailscale.sh`: one-command install/update (Docker + Tailscale + build + start + HTTPS via `tailscale serve`/`funnel`).
  - `deploy/docker-compose.yml`: service `app` (binds **127.0.0.1:3001** only). Profiles `caddy` / `tunnel` are for other setups; **do not use them here**.
  - `deploy/.env.example` → copied to `deploy/.env` by the script (`DOMAIN`, `PUBLIC_URL`, `TRUST_PROXY` are filled in automatically).
  - `Dockerfile`: multi-arch (works on arm64), runs as the unprivileged `node` user via `deploy/entrypoint.sh`.
  - `docs/DEPLOY-RASPBERRY-PI.md`: human guide with all options and troubleshooting.
- Production behaviour (`NODE_ENV=production`, default in Docker):
  - First start creates user `admin` with a random password in `deploy/data/initial-admin-password.txt`. There are **no** demo accounts (`admin/admin123` does not exist in production).
  - No fake bookings. The timetable is generated from rules, 60 days ahead, extended hourly.
  - Data lives in `deploy/data/` (database `trains.db`, signing key `secret.key`, daily backups in `backups/`).

## 2. Rules: what you must and must not do

**Ask the user before:**
- making the site public (`./deploy/pi-tailscale.sh funnel`). The default is tailnet-only; only use `funnel` if the user explicitly asks for it.
- installing Docker or Tailscale if they are missing (the script would do it with `sudo`; confirm first).
- changing any application code. Deployment should not need code changes; if something fails, diagnose and report before editing.
- anything that restarts or reconfigures other services on the Pi (it also manages the user's other servers).

**Never:**
- delete or overwrite `deploy/data/` (database, `secret.key`, backups). Losing `secret.key` invalidates every issued ticket.
- run `npm run seed -- --reset` or anything that resets the database on the Pi.
- commit or push `deploy/.env`, `deploy/data/`, passwords, tokens or keys. Do not paste the admin password into commits or files other than where the script put it.
- publish port 3001 to the network (it must stay bound to `127.0.0.1`; Tailscale serves it over HTTPS).
- disable TLS verification, or run `tailscale up` with flags that change the Pi's existing Tailscale settings (`--reset`, `--advertise-*`, `--accept-routes`, etc.). If Tailscale is already logged in, leave its configuration alone.
- push to any branch other than `ccr-6a3246be-n0ixbk`, and only if you made a needed fix and the user agreed.

## 3. Pre-flight checks (read-only, run first and report anything unexpected)

```bash
uname -m                                   # expect aarch64
cat /etc/os-release | head -3              # Raspberry Pi OS / Debian Bookworm expected
df -h / | tail -1                          # need ~3 GB free for images + build
free -h | head -2
docker --version; docker compose version   # may be missing → ask before installing
docker info >/dev/null 2>&1 && echo "docker ok without sudo" || echo "docker needs sudo or is not installed"
tailscale version                          # need 1.52 or newer for the serve/funnel syntax used
tailscale status | head -5                 # is the Pi logged in?
tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"])'
sudo ss -ltnp | grep -E ':(3001|443)\b' || echo "ports 3001/443 free"
```

Stop and ask the user if:
- port **3001** is already in use by something else, or Tailscale already serves something on **443** (`tailscale serve status`); we would replace it.
- `tailscale version` is older than 1.52 → suggest `sudo tailscale update` (ask first).
- the `DNSName` is empty → MagicDNS is off (see §6).

## 4. Deploy

```bash
cd ~                                         # or wherever the user wants it
git clone https://github.com/JohnBenson00/ProiectPA.git   # private: user must provide a GitHub token / credentials
cd ProiectPA
git checkout ccr-6a3246be-n0ixbk
git log --oneline -1                         # report the commit you deployed
./deploy/pi-tailscale.sh                     # tailnet-only HTTPS (default)
```

If the repository is already cloned, update instead: `cd ProiectPA && git pull && ./deploy/pi-tailscale.sh`.

- The first build on a Pi 5 takes several minutes (npm install + Vite build inside Docker). Use a long timeout or run it in the background and watch `docker compose -f deploy/docker-compose.yml logs -f app`.
- The script prints the site URL and the first admin login. Give both to the user **in your reply only**.
- If the script stops, read the error, check §6, and report. Do not work around it by editing the script without telling the user.

## 5. Verify (all must pass before you report success)

Run on the Pi (`cd ProiectPA/deploy`):

```bash
docker compose ps                                              # app: running (healthy) after ~30 s
curl -fsS http://127.0.0.1:3001/api/health                     # {"ok":true,...,"trips":N} with N > 0
tailscale serve status                                         # https://<name>.ts.net → http://127.0.0.1:3001
URL=$(grep '^PUBLIC_URL=' .env | cut -d= -f2-); echo "$URL"
curl -fsS "$URL/api/health"                                    # same JSON, through Tailscale HTTPS (valid certificate)
curl -fsS "$URL/" | grep -o '<title>[^<]*'                     # the web app's title
curl -fsS "$URL/api/meta" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("demo:", d["demo"], "routes:", len(d["routes"]))'   # demo: False
```

End-to-end smoke test through the API (creates one booking, then cancels it so no seat stays taken):

```bash
B="$URL/api"; J='content-type: application/json'
D=$(date -d tomorrow +%F)
TRIP=$(curl -fsS "$B/trips?route=3&date=$D" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
SEAT=$(curl -fsS "$B/trips/$TRIP/auto-pick" -X POST -H "$J" -d '{"count":1,"prefs":[],"session":"deploy-check"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["seatKeys"][0])')
curl -fsS -X PUT "$B/trips/$TRIP/hold" -H "$J" -d "{\"session\":\"deploy-check\",\"seatKeys\":[\"$SEAT\"]}"; echo
CODE=$(curl -fsS -X POST "$B/bookings" -H "$J" -d "{\"session\":\"deploy-check\",\"tripId\":$TRIP,\"seats\":[{\"seatKey\":\"$SEAT\",\"type\":\"ADULT\"}],\"contact\":{\"name\":\"Deploy check\",\"email\":\"deploy-check@example.com\"}}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')
echo "booking $CODE"
curl -fsS "$B/bookings/$CODE?email=deploy-check@example.com" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["status"], len(d["tickets"]), "ticket(s)")'   # PAID 1 ticket(s)
curl -fsS -X POST "$B/bookings/$CODE/cancel" -H "$J" -d '{"email":"deploy-check@example.com"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])'   # CANCELLED
```

Also confirm the restart behaviour once: `docker compose restart app`, wait ~20 s, health check again. The admin password must **not** change (the data persisted).

Ask the user to open the URL on a phone that is logged in to the tailnet, log in at `/admin`, and try the scanner (camera access requires the HTTPS address, which is what Tailscale provides).

## 6. Known pitfalls

| Symptom | Cause / fix |
|---|---|
| `tailscale serve` says HTTPS is not enabled | Tailscale admin console → **DNS**: enable **MagicDNS** and **HTTPS Certificates**. Then re-run the script. Only the user can do this. |
| `DNSName` empty / script says it cannot read the tailnet name | MagicDNS disabled (same place). |
| `tailscale serve`: unknown flag `--bg` | Tailscale older than 1.52 → `sudo tailscale update` (ask first). |
| `permission denied ... docker.sock` | User not in the `docker` group yet; the script falls back to `sudo docker`. Logging out/in fixes it permanently. |
| Build fails with `429 Too Many Requests` from Docker Hub | Rate limit; wait and retry, or `docker login`. |
| `npm ci` fails during the build | Usually no internet/DNS inside Docker; check `docker run --rm alpine ping -c1 registry.npmjs.org`. |
| App container restarts in a loop | `docker compose logs app`. "EACCES" on `/data` → `deploy/data` ownership; the entrypoint fixes it as long as the container starts as root (do not add `user:` to compose). |
| Port 3001 already in use | Another service owns it. Ask the user; changing it requires editing `ports` in `deploy/docker-compose.yml` and the `tailscale serve` target. |
| Funnel: "Funnel not available" | The tailnet policy must allow Funnel for this node; the command prints a link for the user to approve. Only relevant if the user asked for `funnel`. |
| Site works on the Pi but not on another device | That device is not logged in to the same tailnet (tailnet mode is private by design). |

## 7. Report back to the user

Reply with:
1. The URL (`https://….ts.net`) and whether it is tailnet-only or public (Funnel).
2. The first admin login (username + password from the script output). Remind them to change it under **Staff accounts** and to delete `deploy/data/initial-admin-password.txt`.
3. The deployed commit (`git log --oneline -1`).
4. Results of every check in §5 (pass/fail, with the output of anything that failed).
5. Anything you changed outside the normal script run, and anything you could not do.

Useful follow-ups to mention: backups are in `deploy/data/backups/` (suggest copying them to another server with the `rsync` cron line in `docs/DEPLOY-RASPBERRY-PI.md`), and updates are `git pull && ./deploy/pi-tailscale.sh`.
