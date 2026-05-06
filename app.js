/* GANE NAV — main client app
 * Worldwide map, routing, geocoding, nearby search, voice guidance.
 *
 * Free providers used (no API keys required):
 *   Tiles:    OpenStreetMap, Esri World Imagery, OpenTopoMap, CartoDB
 *   Routing:  OSRM public demo (router.project-osrm.org)
 *   Geocode:  Nominatim (nominatim.openstreetmap.org)
 *   POI:      Overpass API (overpass-api.de)
 *
 * For production deployments, swap to your own self-hosted Valhalla/OSRM,
 * Photon/Pelias, and tile servers. See README and ARCHITECTURE.md.
 */

const $ = (id) => document.getElementById(id);

const state = {
  profile: 'driving',
  from: null,
  to: null,
  routeLayer: null,
  alts: [],
  selectedAltIdx: 0,
  poiLayer: null,
  voice: false,
  watchId: null,
  meMarker: null,
  speedKmh: 0,
};

// ---------- Map ----------
const tileLayers = {
  streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri', maxZoom: 19,
  }),
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA)', maxZoom: 17,
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CARTO © OpenStreetMap', maxZoom: 19, subdomains: 'abcd',
  }),
};

const map = L.map('map', {
  center: [20, 0],
  zoom: 3,
  worldCopyJump: true,
  zoomControl: false,
});
let activeTile = tileLayers.dark.addTo(map);

// SVG gradient for route line
const svgNS = 'http://www.w3.org/2000/svg';
const defs = document.createElementNS(svgNS, 'defs');
defs.innerHTML = `<linearGradient id="gane-grad" x1="0" x2="1" y1="0" y2="1">
  <stop offset="0%" stop-color="#00d4ff"/><stop offset="100%" stop-color="#6c5ce7"/>
</linearGradient>`;
map.getRenderer({}).getEvents && null;
const overlayPane = map.getPanes().overlayPane;
const svgEl = overlayPane.querySelector('svg') || map.getRenderer({})._container;

function setBaseLayer(name) {
  Object.values(tileLayers).forEach((l) => map.removeLayer(l));
  activeTile = tileLayers[name].addTo(map);
}

// ---------- Geocoding ----------
async function geocode(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
  if (!r.ok) return [];
  return r.json();
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

let suggestTimer = null;
function attachSuggestions(inputEl, onPick) {
  const box = $('suggestions');
  inputEl.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(async () => {
      const q = inputEl.value.trim();
      if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
      const results = await geocode(q);
      box.innerHTML = results.map((r, i) =>
        `<div class="suggestion" data-i="${i}" data-lat="${r.lat}" data-lon="${r.lon}">
          <strong>${escape(r.display_name.split(',')[0])}</strong>
          <div style="color:var(--muted);font-size:11px">${escape(r.display_name)}</div>
        </div>`
      ).join('');
      box.hidden = results.length === 0;
      box.querySelectorAll('.suggestion').forEach((el) => {
        el.addEventListener('click', () => {
          const lat = parseFloat(el.dataset.lat);
          const lon = parseFloat(el.dataset.lon);
          inputEl.value = el.querySelector('strong').textContent;
          box.hidden = true;
          onPick({ lat, lon, label: inputEl.value });
        });
      });
    }, 220);
  });
  inputEl.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
}

function escape(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Routing ----------
const profileMap = { driving: 'car', cycling: 'bike', foot: 'foot', transit: 'car' };

async function fetchRoute(from, to, profile) {
  const p = profileMap[profile] || 'car';
  const url = `https://router.project-osrm.org/route/v1/${p}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&alternatives=true&steps=true&annotations=duration,distance`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Routing failed');
  const data = await r.json();
  if (!data.routes || !data.routes.length) throw new Error('No route');
  return data.routes;
}

function drawRoute(routes, idx = 0) {
  if (state.routeLayer) map.removeLayer(state.routeLayer);
  state.routeLayer = L.layerGroup().addTo(map);

  routes.forEach((route, i) => {
    const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    const main = i === idx;
    L.polyline(coords, {
      color: main ? '#00d4ff' : '#6c5ce7',
      weight: main ? 7 : 4,
      opacity: main ? 0.95 : 0.55,
      lineCap: 'round', lineJoin: 'round',
    }).addTo(state.routeLayer);
  });

  const main = routes[idx];
  const coords = main.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  map.fitBounds(L.latLngBounds(coords).pad(0.15));

  // Summary
  $('routeSummary').hidden = false;
  $('eta').textContent = formatDuration(main.duration);
  $('distance').textContent = formatDistance(main.distance) + ' • via ' + (main.legs?.[0]?.summary || 'best route');

  $('alternatives').innerHTML = routes.map((r, i) =>
    `<div class="alt ${i === idx ? 'selected' : ''}" data-i="${i}">
      <span><strong>${formatDuration(r.duration)}</strong> · ${formatDistance(r.distance)}</span>
      <span style="color:var(--muted);font-size:11px">${i === 0 ? 'Fastest' : i === 1 ? 'Alternate' : 'Eco'}</span>
    </div>`).join('');
  $('alternatives').querySelectorAll('.alt').forEach((el) => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.i, 10);
      state.selectedAltIdx = i;
      drawRoute(routes, i);
    });
  });

  // Steps
  const legs = main.legs || [];
  const steps = legs.flatMap((l) => l.steps || []);
  $('steps').innerHTML = steps.slice(0, 60).map((s) => {
    const m = s.maneuver || {};
    const dist = formatDistance(s.distance || 0);
    const txt = stepText(m, s);
    return `<li><span class="step-icon">➤</span><span>${escape(txt)} <span style="color:var(--muted)">(${dist})</span></span></li>`;
  }).join('');
}

function stepText(m, s) {
  const name = s.name || '';
  const type = m.type || 'continue';
  const mod = m.modifier ? ' ' + m.modifier : '';
  const map = {
    depart: 'Start', arrive: 'Arrive at destination', turn: 'Turn' + mod,
    'new name': 'Continue onto', merge: 'Merge' + mod, 'on ramp': 'Take ramp' + mod,
    'off ramp': 'Take exit' + mod, fork: 'Keep' + mod, roundabout: 'Enter roundabout',
    'exit roundabout': 'Exit roundabout', continue: 'Continue' + mod, 'end of road': 'At end of road, go' + mod,
  };
  const verb = map[type] || (type + mod);
  return name ? `${verb} on ${name}` : verb;
}

function formatDuration(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

async function planRoute() {
  if (!state.from || !state.to) {
    showBanner('Please choose a starting point and a destination.');
    return;
  }
  showBanner('Calculating best route…', 1200);
  try {
    const routes = await fetchRoute(state.from, state.to, state.profile);
    state.alts = routes;
    state.selectedAltIdx = 0;
    drawRoute(routes, 0);
    speak(`Route calculated. Estimated arrival in ${formatDuration(routes[0].duration)}.`);
  } catch (e) {
    showBanner('Could not calculate route: ' + e.message);
  }
}

// ---------- Markers ----------
const markers = { from: null, to: null };
function setMarker(kind, lat, lon, label) {
  if (markers[kind]) map.removeLayer(markers[kind]);
  const color = kind === 'from' ? '#00d4ff' : '#ff5c7a';
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 4px ${color}33"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
  markers[kind] = L.marker([lat, lon], { icon, title: label || '' }).addTo(map);
}

// ---------- Geolocation ----------
function useMyLocation() {
  if (!navigator.geolocation) { showBanner('Geolocation not supported.'); return; }
  showBanner('Locating you…', 1500);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    state.from = { lat, lon };
    setMarker('from', lat, lon, 'Your location');
    map.setView([lat, lon], 14);
    const r = await reverseGeocode(lat, lon);
    $('from').value = r ? r.display_name.split(',').slice(0, 2).join(', ') : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }, (err) => {
    showBanner('Location denied: ' + err.message);
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function startTracking() {
  if (!navigator.geolocation || state.watchId) return;
  state.watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude: lat, longitude: lon, speed } = pos.coords;
    if (!state.meMarker) {
      state.meMarker = L.circleMarker([lat, lon], {
        radius: 9, color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 0.85, weight: 3,
      }).addTo(map);
    } else {
      state.meMarker.setLatLng([lat, lon]);
    }
    if (typeof speed === 'number' && !isNaN(speed)) {
      state.speedKmh = Math.max(0, Math.round(speed * 3.6));
      $('speedNum').textContent = state.speedKmh;
      $('speedBadge').hidden = false;
    }
  }, () => {}, { enableHighAccuracy: true, maximumAge: 1000 });
}

// ---------- Nearby (Overpass) ----------
async function findNearby(category) {
  const c = map.getCenter();
  const radius = 2500; // meters
  const filters = {
    fuel: 'amenity=fuel',
    restaurant: 'amenity=restaurant',
    cafe: 'amenity=cafe',
    hotel: 'tourism=hotel',
    hospital: 'amenity=hospital',
    atm: 'amenity=atm',
    parking: 'amenity=parking',
    charging_station: 'amenity=charging_station',
  };
  const f = filters[category] || filters.cafe;
  const q = `[out:json][timeout:20];
    (node[${f}](around:${radius},${c.lat},${c.lng});
     way[${f}](around:${radius},${c.lat},${c.lng}););
    out center 40;`;
  showBanner(`Searching nearby ${category}…`, 1200);
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: q,
    });
    const data = await r.json();
    if (state.poiLayer) map.removeLayer(state.poiLayer);
    state.poiLayer = L.layerGroup().addTo(map);
    (data.elements || []).forEach((e) => {
      const lat = e.lat || e.center?.lat;
      const lon = e.lon || e.center?.lon;
      if (!lat) return;
      const name = e.tags?.name || category;
      L.circleMarker([lat, lon], {
        radius: 7, color: '#6c5ce7', fillColor: '#6c5ce7', fillOpacity: 0.9, weight: 2,
      }).bindPopup(`<strong>${escape(name)}</strong><br><button onclick="window.__pickPoi(${lat},${lon},'${escape(name).replace(/'/g, "\\'")}')">Route here</button>`)
        .addTo(state.poiLayer);
    });
    if (!data.elements?.length) showBanner('Nothing found nearby.');
  } catch (e) {
    showBanner('Search failed: ' + e.message);
  }
}

window.__pickPoi = (lat, lon, label) => {
  state.to = { lat, lon };
  $('to').value = label;
  setMarker('to', lat, lon, label);
  planRoute();
};

// ---------- Voice ----------
function speak(text) {
  if (!state.voice || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1; u.pitch = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- UI ----------
function showBanner(text, ms = 2400) {
  const b = $('banner');
  b.textContent = text; b.hidden = false;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { b.hidden = true; }, ms);
}

map.on('click', async (e) => {
  // If both set, replace destination; otherwise fill missing slot
  const target = !state.from ? 'from' : 'to';
  const { lat, lng: lon } = e.latlng;
  state[target] = { lat, lon };
  setMarker(target, lat, lon);
  const r = await reverseGeocode(lat, lon);
  $(target).value = r ? r.display_name.split(',').slice(0, 2).join(', ') : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  if (state.from && state.to) planRoute();
});

map.on('contextmenu', (e) => {
  state.to = { lat: e.latlng.lat, lon: e.latlng.lng };
  setMarker('to', state.to.lat, state.to.lon);
  if (state.from) planRoute();
});

// Wire UI
attachSuggestions($('from'), (p) => {
  state.from = { lat: p.lat, lon: p.lon };
  setMarker('from', p.lat, p.lon, p.label);
  map.setView([p.lat, p.lon], 13);
});
attachSuggestions($('to'), (p) => {
  state.to = { lat: p.lat, lon: p.lon };
  setMarker('to', p.lat, p.lon, p.label);
  if (state.from) planRoute(); else map.setView([p.lat, p.lon], 13);
});

document.querySelectorAll('.mode').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.profile = b.dataset.profile;
    if (state.from && state.to) planRoute();
  });
});

$('goBtn').addEventListener('click', planRoute);
$('clearBtn').addEventListener('click', () => {
  state.from = state.to = null;
  ['from', 'to'].forEach((k) => { if (markers[k]) { map.removeLayer(markers[k]); markers[k] = null; } });
  if (state.routeLayer) { map.removeLayer(state.routeLayer); state.routeLayer = null; }
  if (state.poiLayer) { map.removeLayer(state.poiLayer); state.poiLayer = null; }
  $('from').value = ''; $('to').value = '';
  $('routeSummary').hidden = true;
});
$('swapBtn').addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  const fa = $('from').value; $('from').value = $('to').value; $('to').value = fa;
  if (markers.from && markers.to) {
    const a = markers.from.getLatLng(), b = markers.to.getLatLng();
    setMarker('from', b.lat, b.lng); setMarker('to', a.lat, a.lng);
  }
  if (state.from && state.to) planRoute();
});
$('useMyLocation').addEventListener('click', useMyLocation);
$('locateBtn').addEventListener('click', useMyLocation);
$('zoomInBtn').addEventListener('click', () => map.zoomIn());
$('zoomOutBtn').addEventListener('click', () => map.zoomOut());

let currentLayer = 'dark';
const layerOrder = ['dark', 'streets', 'satellite', 'topo'];
$('layerBtn').addEventListener('click', () => {
  const i = (layerOrder.indexOf(currentLayer) + 1) % layerOrder.length;
  currentLayer = layerOrder[i]; setBaseLayer(currentLayer);
  showBanner('Map style: ' + currentLayer);
});
$('satBtn').addEventListener('click', () => { setBaseLayer('satellite'); currentLayer = 'satellite'; });
$('trafficBtn').addEventListener('click', () => {
  showBanner('Traffic overlay simulated — connect a live traffic provider in production.');
});
$('threeDBtn').addEventListener('click', () => {
  showBanner('3D buildings: enable MapLibre tiles for production.');
});

document.querySelectorAll('.chip').forEach((c) =>
  c.addEventListener('click', () => findNearby(c.dataset.cat)));

$('voiceBtn').addEventListener('click', (e) => {
  state.voice = !state.voice;
  e.currentTarget.textContent = state.voice ? '🔊 Voice on' : '🔊 Voice off';
  e.currentTarget.setAttribute('aria-pressed', String(state.voice));
  if (state.voice) speak('Voice guidance enabled.');
});

$('darkBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme === 'light' ? '' : 'light';
  if (cur === 'light') document.documentElement.dataset.theme = 'light';
  else document.documentElement.removeAttribute('data-theme');
});

$('aboutBtn').addEventListener('click', () => $('aboutDlg').showModal());

// Boot
useMyLocation();
startTracking();

// Service worker for offline shell
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
