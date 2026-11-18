# Deploying Râșnov Trains on a Raspberry Pi 5

This runs the real, shared system: one database for everyone, so a ticket bought on a phone shows up
in the staff seat map and can be scanned by the conductor on another phone.

Result: **https://trains.hymemory.xyz** (any subdomain works; your main site on `hymemory.xyz` is not touched).

## Quickest: one command over Tailscale

If the Pi is in your Tailscale network, this does everything (installs Docker and Tailscale if missing,
builds, starts, and serves the site over HTTPS with a certificate from Tailscale):

```bash
git clone https://github.com/JohnBenson00/ProiectPA.git   # GitHub token as password (private repo, see step 2)
cd ProiectPA && git checkout ccr-6a3246be-n0ixbk
./deploy/pi-tailscale.sh            # only devices in your tailnet can open it
./deploy/pi-tailscale.sh funnel     # or: public on the internet via Tailscale Funnel
```

It prints the address (`https://<pi-name>.<tailnet>.ts.net`) and the first admin password.
Run it again after `git pull` to update; the data in `deploy/data` is kept.

Once, in the Tailscale admin console:
- **DNS** page: enable **MagicDNS** and **HTTPS Certificates** (needed for the `https://…ts.net` address and the camera scanner).
- For `funnel` only: allow Funnel for the Pi (the command prints a link if it is not allowed yet).

Notes:
- `tailnet` mode is ideal for testing with the team and the client: only people you invite to the tailnet can open it.
  Passengers need a public site: `funnel`, or one of the options below with your own domain (`trains.hymemory.xyz`).
- Funnel always uses the `ts.net` address; a custom domain like `hymemory.xyz` needs option A, B or C below.

## What you need

- Raspberry Pi 5 with **Raspberry Pi OS 64-bit** (Bookworm). An SSD/NVMe instead of the SD card is strongly recommended for a database.
- Access to the DNS settings of `hymemory.xyz`.
- About 15 minutes.

## 1. Install Docker (once)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out and back in
docker compose version             # check it works
```

## 2. Get the code

The repository is private, so use a GitHub **personal access token** (GitHub → Settings → Developer settings →
Fine-grained tokens → read-only access to `ProiectPA` → "Contents: Read") as the password when git asks.

```bash
cd ~
git clone https://github.com/JohnBenson00/ProiectPA.git
cd ProiectPA
# until the work is merged into main, use the development branch:
git checkout ccr-6a3246be-n0ixbk
```

## 3. Settings

```bash
cd deploy
cp .env.example .env
nano .env
```

Check at least `DOMAIN` and `PUBLIC_URL`. Everything else has sensible defaults. Optional: `SMTP_URL`/`MAIL_FROM` for
confirmation emails (without them, customers open their tickets with booking code + email).

## 4. Make it reachable from the internet – choose ONE option

### Option A – Caddy with automatic HTTPS (router port forwarding)

1. DNS: add an **A record** `trains` → your home's public IP (find it with `curl -4 ifconfig.me`).
   If your IP changes, use your DNS provider's dynamic-DNS feature or `ddclient`.
2. Router: forward **TCP 80, TCP 443 and UDP 443** to the Pi's local IP (give the Pi a fixed IP in the router).
3. Start:
   ```bash
   docker compose --profile caddy up -d --build
   ```
   Caddy gets the HTTPS certificate by itself within a minute.

Does not work if your provider uses CGNAT (no real public IP) – then use option B.

### Option B – Cloudflare Tunnel (no open ports, works behind any router)

Needs the DNS of `hymemory.xyz` to be managed by Cloudflare (free plan is enough).

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*), name it `rasnov-trains`.
2. Copy the **token** shown in the install command and put it in `.env` as `CLOUDFLARE_TUNNEL_TOKEN=...`.
3. In the tunnel, add a **Public hostname**: subdomain `trains`, domain `hymemory.xyz`, service **HTTP** `app:3001`.
4. Start:
   ```bash
   docker compose --profile tunnel up -d --build
   ```

### Option C – the Pi already runs nginx/Caddy for hymemory.xyz

Start only the app (it listens on `127.0.0.1:3001`):
```bash
docker compose up -d --build
```
and add a site to your existing proxy, e.g. nginx:
```nginx
server {
    server_name trains.hymemory.xyz;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # listen 443 ssl; + certificates (e.g. certbot --nginx -d trains.hymemory.xyz)
}
```

The first build on the Pi takes a few minutes.

## 5. First login

```bash
cat data/initial-admin-password.txt
```
Open `https://trains.hymemory.xyz/admin`, log in as `admin` with that password, then:
- **Conturi personal / Staff accounts** → change your password and create an account for each conductor
  (role *controlor*: scanner + seat maps only).
- **Program / Schedule** → the timetable rules. Departures are generated 60 days ahead and extended every hour.
- **Flotă / Fleet** → trains and wagons.

Delete `data/initial-admin-password.txt` afterwards.

## Everyday operation

| Task | Command (in `ProiectPA/deploy`) |
|---|---|
| Status / logs | `docker compose ps` · `docker compose logs -f app` |
| Update to the latest code | `git pull && docker compose --profile caddy up -d --build` (same profile you started with) |
| Restart | `docker compose restart app` |
| Stop | `docker compose --profile caddy down` (data is kept in `deploy/data`) |
| List staff accounts | `docker compose exec -u node app npm run -s cli -w apps/api -- user:list` |
| Reset a password | `docker compose exec -u node app npm run -s cli -w apps/api -- user:passwd admin NewPassword123` |
| Backup now | `docker compose exec -u node app npm run -s cli -w apps/api -- backup` |

The containers restart automatically after a power cut or reboot.

### Backups

- A consistent copy of the database is made **every day** in `deploy/data/backups/` (the last 14 are kept).
- Also copy them off the Pi, e.g. to one of your servers, with a nightly cron job (`crontab -e`):
  ```
  15 4 * * * rsync -a ~/ProiectPA/deploy/data/backups/ user@your-server:/backups/rasnov-trains/
  ```
- Restore: stop the app, copy a backup over `deploy/data/trains.db` (and delete `trains.db-wal`, `trains.db-shm`), start again.

### Security notes

- Only the proxy (Caddy/Cloudflare/nginx) is exposed; the app listens on `127.0.0.1` on the Pi.
- Ticket QR codes and staff sessions are signed with a secret generated on first start (`data/secret.key`).
  Keep it with your backups – without it existing tickets can no longer be validated.
- Login and booking requests are rate-limited; staff passwords are stored with scrypt.
- Payment is still simulated. Real card payments need a payment provider (e.g. Stripe, Netopia) – a separate step.

## Troubleshooting

| Symptom | Check |
|---|---|
| Site not reachable (option A) | Port forwarding, `curl -I http://<public-ip>` from outside, DNS: `dig trains.hymemory.xyz` |
| Certificate errors (option A) | `docker compose logs caddy` – ports 80 and 443 must reach the Pi |
| Tunnel down (option B) | `docker compose logs tunnel`, token in `.env`, hostname service = `http://app:3001` |
| Camera does not start in the scanner | The site must be opened over **https** |
| Health | `curl http://127.0.0.1:3001/api/health` on the Pi |
