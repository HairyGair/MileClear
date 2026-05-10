# GraphHopper self-hosted on Pixelish — operations guide

**Status:** Live in production as of 10 May 2026. This document is now reference for operations + redeployment, not first-time setup.

## What's running

- GraphHopper 8.0 standalone JAR at `~/graphhopper/graphhopper-web.jar`
- Portable Java 21 (Adoptium Temurin) at `~/java/jdk/`
- Managed by PM2 as process `graphhopper`
- Config at `~/graphhopper/config/config.yml`
- Graph data + OSM extract at `~/graphhopper/data/`
- Listens on `127.0.0.1:8989` (admin: `127.0.0.1:8990`) — both bound to localhost only
- ~4.2 GB RAM at idle
- API wires to it via `GRAPHHOPPER_URL=http://localhost:8989` in `.env`

## Why not Docker

Pixelish is cPanel-hosted with no Docker access. We use the GraphHopper standalone JAR + a portable JDK installed under `~/java/` (no root needed). Same engine, same accuracy, just runs as a plain Java process.

## One-time setup

SSH to Pixelish:

```bash
ssh mileclear@85.234.151.224
```

### 1. Create the working directory

```bash
mkdir -p ~/graphhopper/data ~/graphhopper/config
cd ~/graphhopper
```

### 2. Download the latest UK OSM extract

```bash
cd ~/graphhopper/data
curl -L -o great-britain-latest.osm.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

That's about 1.6 GB. Takes 1-3 minutes depending on Pixelish's outbound bandwidth.

### 3. Drop in the GraphHopper config

```bash
cat > ~/graphhopper/config/config.yml <<'EOF'
graphhopper:
  datareader.file: /data/great-britain-latest.osm.pbf
  graph.location: /data/graph-cache

  profiles:
    - name: car
      vehicle: car
      weighting: fastest

  profiles_ch:
    - profile: car

server:
  application_connectors:
    - type: http
      port: 8989
      bind_host: 0.0.0.0
  admin_connectors:
    - type: http
      port: 8990
      bind_host: 127.0.0.1
EOF
```

### 4. Run GraphHopper

```bash
docker run -d \
  --name graphhopper \
  --restart unless-stopped \
  -p 127.0.0.1:8989:8989 \
  -v ~/graphhopper/data:/data \
  -v ~/graphhopper/config:/config \
  -m 4g \
  israelhikingmap/graphhopper:latest \
  --host 0.0.0.0 \
  --url http://localhost:8989 \
  config /config/config.yml
```

The first run does a one-off graph build from the OSM extract — takes 30-60 minutes. The container looks like it's hanging during that phase; that's expected. Subsequent restarts skip the build and come up in ~30 seconds.

### 5. Verify it's responding

```bash
# Should return paths/[].distance for any UK route
curl 'http://localhost:8989/route?point=51.5074,-0.1278&point=53.4808,-2.2426&profile=car&calc_points=false&instructions=false'
```

That's a London-to-Manchester route. Distance should come back at roughly 320,000 metres.

### 6. Wire up MileClear's API

Add to `/home/mileclear/mileclear-app/.env`:

```
GRAPHHOPPER_URL=http://localhost:8989
```

Restart the API:

```bash
pm2 restart mileclear-api
```

The next time a manual trip is created, the routing service will use GraphHopper instead of falling back to Google.

## Weekly map refresh

OSM data ages. Set up a weekly cron to pull a fresh extract and rebuild:

```bash
crontab -e
```

Add:

```
# Every Sunday 04:00 UTC: pull latest UK OSM extract + rebuild GraphHopper graph
0 4 * * 0 cd /home/mileclear/graphhopper/data && curl -fsSL -o great-britain-latest.osm.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf.tmp && mv great-britain-latest.osm.pbf.tmp great-britain-latest.osm.pbf && rm -rf graph-cache && docker restart graphhopper
```

The graph rebuild takes 30-60 minutes during which routing requests fall through to Google (still works, just slower than cache hits). All cached routes continue to serve from the database, so users never see an outage.

## Monitoring

Quick health check:

```bash
docker ps | grep graphhopper       # Should show "Up X minutes"
docker logs --tail 20 graphhopper  # Look for "Started server" lines
curl -fs http://localhost:8989/health || echo "DOWN"
```

If GraphHopper is down, the routing service falls back to Google Maps automatically — no user-visible breakage. But long-term outages mean every cache miss bills against the Google free tier, so worth fixing within a day or two.

## Resource footprint on Pixelish

- RAM: ~3.5-4 GB resident
- CPU: idle apart from graph builds and active routing requests (~5-15ms per route)
- Disk: ~5 GB in `~/graphhopper/data`

If James needs the RAM back: stop the container (`docker stop graphhopper`), MileClear automatically uses Google for everything until it's restarted. No code change needed. Long-term we can move GraphHopper to a small dedicated VPS (~£4.50/mo Hetzner) if Pixelish gets crowded.

## Troubleshooting

**"Out of memory" during initial graph build.** Increase the `-m 4g` flag to `-m 5g` and rerun. If Pixelish doesn't have 5 GB free, edit `config.yml` to drop `profiles_ch` (skips the contraction-hierarchy preprocessing — slower routing but ~30% less RAM).

**Routes look wrong.** Check the OSM extract is current — `ls -la ~/graphhopper/data/*.osm.pbf` should show a date within the last 14 days. If not, the weekly cron has stopped running or stalled.

**`/route` returns 400 with "PointNotFoundException".** The coordinates you sent aren't on a road in the OSM data. Check both points are within the UK; Geofabrik's `great-britain-latest` doesn't include Northern Ireland (use `great-britain-and-ireland-latest.osm.pbf` if NI coverage is needed).

**Container restarts in a loop.** `docker logs graphhopper` to see the failure. Most common cause: the OSM extract was downloaded incompletely (curl interrupted). Re-download it.
