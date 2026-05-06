# GANE NAV — Architecture

GANE NAV is designed as a **provider-agnostic navigation platform**: every
external service (tiles, routing, geocoding, traffic, POI) is a swappable
adapter. The reference web client uses free public services so it runs without
any API keys; for production, point each adapter at a self-hosted service or a
commercial provider.

## Layers

```
+--------------------------------------------------------------+
|                       Presentation                           |
|  - Leaflet map, custom UI, voice guidance                    |
|  - PWA shell (service worker, manifest)                      |
+--------------------------------------------------------------+
|                       Domain logic                           |
|  - Trip planner, route comparator, ETA model                 |
|  - Speedometer, live tracking, geofencing hooks              |
+--------------------------------------------------------------+
|                       Provider adapters                      |
|  - tiles.ts (OSM, Esri, OpenTopoMap, MapLibre vector)        |
|  - routing.ts (OSRM, Valhalla, GraphHopper)                  |
|  - geocoding.ts (Nominatim, Photon, Pelias, Mapbox)          |
|  - poi.ts (Overpass, Foursquare, Google Places)              |
|  - traffic.ts (HERE, TomTom, OSM live feed)                  |
+--------------------------------------------------------------+
|                       Storage                                |
|  - LocalStorage / IndexedDB (favorites, trip history)        |
|  - Service-worker cache (tiles + shell)                      |
|  - Optional cloud sync (account, devices)                    |
+--------------------------------------------------------------+
```

## Data flow — planning a trip

```
user types -> Geocoding adapter -> {lat,lon}
            -> Trip planner -> Routing adapter -> {routes[]}
            -> Route comparator -> selected route
            -> Renderer (Leaflet polyline)
            -> Voice & step list (turn-by-turn)
```

## Data flow — live navigation

```
GPS watchPosition -> Tracker
                   -> SpeedEstimator -> UI badge
                   -> ManeuverMatcher -> next-step prompt
                   -> ETA recomputer (every 30s)
                   -> Off-route detector -> reroute
```

## Provider matrix

| Concern   | Free default                 | Production option           |
| --------- | ---------------------------- | --------------------------- |
| Tiles     | OpenStreetMap raster         | MapLibre + your vector tiles|
| Imagery   | Esri World Imagery           | Mapbox Satellite, Maxar     |
| Routing   | OSRM public demo             | Self-hosted Valhalla        |
| Geocoding | Nominatim                    | Self-hosted Photon / Pelias |
| POI       | Overpass                     | Foursquare / Google Places  |
| Traffic   | (none)                       | HERE / TomTom / INRIX       |
| Voice     | Web Speech API               | Polly / ElevenLabs / Azure  |

## Backend services (planned)

- **Trip API** — saves favorites, recents, last-mile preferences.
- **Live traffic ingest** — OSM live + commercial feeds, Kafka stream.
- **Crowdsourced incidents** — Waze-style reports, signed by device.
- **Map matching** — for telemetry & route recovery (Valhalla `trace_route`).
- **Tile cache** — Cloudflare R2 + CDN for vector tiles.

## Security & privacy

- All requests over HTTPS.
- GPS data never leaves the device unless the user opts in.
- Account data encrypted at rest, scoped to device pairs.
- Optional anonymous mode (no identifiers, no history).

## Performance budgets

- Time to interactive: < 1.5s on 4G mid-tier mobile.
- Route compute: < 500ms for trips up to 500 km.
- Tile cache hit ratio: > 90% on second view.

## Testing strategy

- Unit: pure functions (formatters, geometry helpers).
- Integration: mocked adapters, end-to-end trip plan.
- E2E: Playwright on real public endpoints with retries.
- Map regression: snapshot rendering at fixed view boxes.
