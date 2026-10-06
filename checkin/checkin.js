// The private check-in page (checkin/index.html), out of the page for a strict Content-Security-Policy.

// Private check-in page — no key: locally only this computer can reach it; online it sits behind
// Cloudflare Access (email code). Lookups go to OpenStreetMap's Nominatim (free; max 1 request/s, so
// calls are spaced); the check-in itself goes only to our own /api/checkin.
const $ = (id) => document.getElementById(id);
const AREA = { lonMin: 59.5, lonMax: 75.5, latMin: 29.0, latMax: 39.0 }; // same as js/checkin/core.js RULES.area
const inArea = (lat, lon) => lon >= AREA.lonMin && lon <= AREA.lonMax && lat >= AREA.latMin && lat <= AREA.latMax;

const status = (msg, kind = '') => { $('status').textContent = msg; $('status').className = `status ${kind}`; };

// ---- Nominatim, politely spaced ----
let lastCall = 0;
async function osm(path) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const r = await fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&accept-language=en`);
  if (!r.ok) throw new Error(`lookup failed (${r.status})`);
  return r.json();
}
const placeName = (a = {}) => a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state_district || '';

// ---- coordinates in many shapes ----
function parseCoords(s) {
  const u = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll)=(-?\d+\.\d+)[, ]+(-?\d+\.\d+)/) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (u) return [+u[1], +u[2]];
  const dms = [...s.matchAll(/(\d+)[°\s]+(\d+)['′\s]+(\d+(?:\.\d+)?)["″]?\s*([NSEW])/gi)];
  if (dms.length === 2) {
    const v = dms.map((m) => (+m[1] + m[2] / 60 + m[3] / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1));
    return /[EW]/i.test(dms[0][4]) ? [v[1], v[0]] : v;
  }
  const d = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  return d ? [+d[1], +d[2]] : null;
}

// ---- preview map (real streets, so the pin can be placed precisely) ----
let map, marker, picked = null;
function preview(lat, lon) {
  $('map').hidden = false;
  if (!map) {
    map = L.map('map', { zoomControl: true, attributionControl: true });
    // English labels (OpenStreetMap's own tiles show local-script names); free with attribution
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles © Esri' }).addTo(map);
    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
    marker.on('dragend', () => { const p = marker.getLatLng(); resolve(p.lat, p.lng); });
  }
  marker.setLatLng([lat, lon]);
  map.setView([lat, lon], 13);
}

// a chosen point → town + province names and centres (what the public map may show)
async function resolve(lat, lon, exactName = '') {
  $('go').disabled = true;
  if (!inArea(lat, lon)) { picked = null; $('near').textContent = ''; return status('That point is outside Afghanistan — check the numbers (latitude first, ~29–39; longitude ~60–75).', 'err'); }
  picked = { exact: { lat, lon, name: exactName } };
  $('near').innerHTML = '<small>finding the town…</small>';
  status('');
  try {
    const t = await osm(`reverse?lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
    const p = await osm(`reverse?lat=${lat}&lon=${lon}&zoom=5&addressdetails=1`);
    if (!picked || picked.exact.lat !== lat || picked.exact.lon !== lon) return; // moved again meanwhile
    const town = placeName(t.address), prov = p.address?.state || t.address?.state || '';
    picked.town = { lat: +t.lat || lat, lon: +t.lon || lon, name: town };
    picked.region = { lat: +p.lat || lat, lon: +p.lon || lon, name: prov };
    $('near').innerHTML = '';
    $('near').append(`near ${town || '?'}${prov ? `, ${prov}` : ''}`, Object.assign(document.createElement('small'), { textContent: `  ${lat.toFixed(5)}, ${lon.toFixed(5)}` }));
  } catch (e) {
    // lookups down: still allow checking in; the public map then uses the rounded position
    picked.town = picked.region = null;
    $('near').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} (couldn't look up the town)`;
  }
  $('go').disabled = false;
}

async function find() {
  const q = $('where').value.trim();
  $('cands').innerHTML = '';
  if (!q) return;
  let c = parseCoords(q);
  if (c) {
    let [lat, lon] = c;
    if (!inArea(lat, lon) && inArea(lon, lat)) { [lat, lon] = [lon, lat]; status('Swapped them — latitude comes first.', ''); } // a common slip
    preview(lat, lon);
    return resolve(lat, lon);
  }
  status('looking it up…');
  try {
    const res = (await osm(`search?q=${encodeURIComponent(q)}&countrycodes=af&limit=5&addressdetails=1`)).filter((r) => inArea(+r.lat, +r.lon));
    if (!res.length) return status('Not found — try the town name, add the province, or paste coordinates.', 'err');
    status(res.length > 1 ? 'Pick the right one:' : '');
    const choose = (r) => { $('cands').innerHTML = ''; preview(+r.lat, +r.lon); resolve(+r.lat, +r.lon, r.name || ''); };
    if (res.length === 1) return choose(res[0]);
    for (const r of res) {
      const b = document.createElement('button');
      b.type = 'button';
      b.append(r.name || r.display_name.split(',')[0], Object.assign(document.createElement('small'), { textContent: r.display_name }));
      b.onclick = () => choose(r);
      $('cands').append(b);
    }
  } catch (e) { status(`${e.message} — paste coordinates instead.`, 'err'); }
}
$('find').onclick = find;
$('where').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });

// ---- send ----
async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, ...j };
}
const describe = (pub) => (pub?.checkin ? `Public map now shows: ${pub.checkin.name || 'a pin'} (${pub.checkin.precision}), ${pub.checkin.date}.` : 'Public map shows no check-in.');

async function send(confirm = false) {
  if (!picked) return;
  $('go').disabled = true;
  status('sending…');
  const show = new FormData($('form')).get('show');
  const r = await api('POST', '/api/checkin', { ...picked, note: $('note').value, show, confirm }).catch(() => ({ ok: false, error: 'no connection — try again when you have signal' }));
  if (r.needsConfirm) {
    $('go').disabled = false;
    if (window.confirm(`${r.error}.\n\nCheck in anyway?`)) return send(true);
    return status('Not sent.', 'err');
  }
  if (!r.ok) { $('go').disabled = false; return status(r.error || 'something went wrong', 'err'); }
  status(`Checked in. ${describe(r.public)}`, 'ok');
  $('note').value = '';
}
$('form').addEventListener('submit', (e) => { e.preventDefault(); send(); });

$('undo').onclick = async () => {
  if (!window.confirm('Remove your last check-in?')) return;
  const r = await api('DELETE', '/api/checkin/last').catch(() => ({ ok: false, error: 'no connection' }));
  status(r.ok ? `Removed. ${describe(r.public)}` : r.error, r.ok ? 'ok' : 'err');
};

async function refreshLast() {
  const r = await api('GET', '/api/checkin/last').catch(() => null);
  if (r?.ok) status(r.last ? `Last check-in: ${r.last.name || 'a pin'}, ${new Date(r.last.ts).toLocaleString('en-GB', { timeZone: 'Asia/Kabul', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} (Kabul). ${describe(r.public)}` : describe(r.public));
}
refreshLast();
