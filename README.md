# GANE NAV

> The next generation of worldwide navigation and location.
> Built to compete with — and surpass — Waze and Google Maps.

GANE NAV is an open, world-scale navigation platform: multi-modal routing, live
search, voice guidance, eco-aware ETAs, dark/light themes, and a fully offline-
capable progressive web app. The reference client is a single-page web app that
runs anywhere — phone, tablet, desktop, or in-vehicle browser.

## Quick start

No build step is required. Serve the directory and open it in any modern
browser.

```bash
# from the project root
python3 -m http.server 8080
# then open http://localhost:8080
```

Or open `index.html` directly. (For geolocation and the service worker, a real
HTTP server or HTTPS deployment is recommended.)

## Highlights

- **Worldwide map coverage** via OpenStreetMap, Esri imagery, OpenTopoMap and
  CartoDB dark — switch styles with one tap.
- **Multi-modal routing** — drive, bike, walk, transit. Powered by OSRM (swap
  to Valhalla / GraphHopper for production).
- **Smart search** — autocompleting geocoder via Nominatim with localized
  results.
- **Nearby chips** — fuel, food, coffee, hotels, hospitals, ATMs, parking, EV
  charging — pulled live from OpenStreetMap via Overpass.
- **Live ETA & alternates** — three route alternatives with eco / fastest tags.
- **Voice guidance** — turn-by-turn with the Web Speech API.
- **Live GPS tracking** — real-time speedometer with continuous geolocation.
- **Offline-ready** — installable PWA with a service-worker shell cache.
- **Themes** — built-in dark mode, light mode, satellite, terrain, streets.
- **Accessibility** — keyboard friendly, ARIA-labeled controls, reduced motion
  ready.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a deep dive. In short:

```
┌───────────────────────────────────────────────────────────┐
│                       GANE NAV Client                     │
│  Leaflet + Custom UI + Service Worker (offline shell)     │
└──────────┬─────────────────┬───────────────┬──────────────┘
           │                 │               │
       ┌───▼────┐       ┌────▼─────┐   ┌─────▼──────┐
       │ Tiles  │       │ Routing  │   │  Geocode   │
       │ OSM /  │       │ OSRM /   │   │ Nominatim /│
       │ Esri / │       │ Valhalla │   │ Photon     │
       │ Carto  │       │          │   │            │
       └────────┘       └──────────┘   └────────────┘
```

For production, swap the public demo endpoints for self-hosted services.

## Roadmap

- [x] Worldwide map with multiple basemaps
- [x] Geocoding + autocomplete
- [x] Multi-modal routing (driving, cycling, walking)
- [x] Turn-by-turn steps with voice
- [x] Live GPS tracking + speedometer
- [x] Nearby POI search (8 categories)
- [x] PWA + offline shell
- [ ] Live traffic ingestion (HERE / TomTom / OSM live feeds)
- [ ] Crowdsourced incident reports (Waze-style)
- [ ] 3D buildings & terrain (MapLibre + Mapbox vector tiles)
- [ ] CarPlay / Android Auto bridge
- [ ] Native shells (iOS, Android, Desktop) via Tauri / Capacitor
- [ ] Account sync, favorites, trip history

## Stack

- **Map**: [Leaflet](https://leafletjs.com) (drop-in replacement: MapLibre GL JS)
- **Routing**: [OSRM](https://project-osrm.org) public demo (replaceable)
- **Geocoding**: [Nominatim](https://nominatim.org) (replaceable)
- **POI**: [Overpass API](https://overpass-api.de)
- **PWA**: vanilla service worker, Web App Manifest

## License

MIT — see `LICENSE`. Map data © OpenStreetMap contributors.
Imagery © Esri. Tiles © CARTO. Routing © OSRM.
