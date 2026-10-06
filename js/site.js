// The site: the sketch map page (index.html). Moved out of the page so a strict Content-Security-Policy
// can forbid inline scripts. Imports are relative to js/; fetches stay relative to the page.

import { createGeo } from './map/geo.js';
import { textures } from './textures.js';
import { rng } from './engine.js';
import { brush } from './map/pencil.js';
import { addPhotoPrints } from './map/photos.js';
import { mountAlmanac } from './map/almanac.js';
import { createOpening } from './map/opening.js';
import { addCheckinPin } from './map/checkin-pin.js';
// where the public check-in view lives: locally written by tools/dev-server.mjs; in production the R2 public bucket
const CHECKIN_URL = './local-r2/public/checkin/latest.json';
const html = document.documentElement;
html.style.setProperty('--tex-paper', textures.paper());
const qs = new URLSearchParams(location.search);
// ?still=1 (used by screenshot tooling): no animations — headless Chrome never finishes Leaflet's tile fades
const still = qs.has('still');
if (still) html.classList.add('still');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || still;
// The opening drawing plays at the whole-map view (the default view). ?t=2.5 holds it at
// that moment for screenshots; deep links (?f=) and reduced motion go straight to the map.
const holdAt = qs.has('t') ? +qs.get('t') : null;
// Data Saver on: skip the opening (and its images) and show the finished map straight away
const saveData = navigator.connection?.saveData === true;
let withOpening = !qs.get('f') && (holdAt !== null || (!reduced && !saveData));
if (withOpening) html.classList.add('opening', 'op-drawing');

// ---- preloader: a pencil line grows as each piece arrives ----
const started = performance.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const preload = document.getElementById('preload');
if (still) preload.hidden = true;
Promise.race([document.fonts.load('30px "Architects Daughter"'), sleep(500)]).then(() => preload.classList.add('fonts-in'));
const TOTAL = withOpening ? 5 : 2; // map.json, fonts (+ intro.json, the outline plate, the first tiles)
let loaded = 0;
const track = (p) => Promise.resolve(p).finally(() => preload.querySelector('.lead').style.setProperty('--left', (1 - ++loaded / TOTAL).toFixed(3)));
const PLATES = ['outline', 'water', 'relief', 'marks'];
// The opening needs only the outline plate to start (it's drawn first); the other three stream in while it
// plays — opening.js reveals a plate once its image has arrived. A connection too slow to fetch the outline
// within OPENING_BUDGET gets the finished map instead of a stalled preloader.
const OPENING_BUDGET = 6000;
const plateImgs = withOpening ? Object.fromEntries(PLATES.map((n) => { const im = new Image(); im.decoding = 'async'; return [n, im]; })) : null;
if (plateImgs) {
  // the outline gets the bandwidth to itself; the later plates start once it has landed
  const rest = () => PLATES.slice(1).forEach((n) => { plateImgs[n].src ||= `./tiles/intro/${n}.webp`; });
  plateImgs.outline.fetchPriority = 'high';
  plateImgs.outline.addEventListener('load', rest, { once: true });
  plateImgs.outline.addEventListener('error', rest, { once: true });
  plateImgs.outline.src = './tiles/intro/outline.webp';
}
const openingAssets = withOpening && Promise.all([
  track(fetch('./tiles/intro.json').then((r) => r.json())),
  track(new Promise((ok, no) => { const im = plateImgs.outline; if (im.complete && im.naturalWidth) ok(); else { im.onload = ok; im.onerror = no; } })),
]);

const stacksReq = fetch('./data/photos.json').then((r) => r.json()); // in parallel — it was waiting behind the fonts
const meta = await track(fetch('./tiles/map.json').then((r) => r.json()));
const { frame, tiers, labels } = meta;
const geo = createGeo({ seed: meta.seed, flaws: true }); // same coordinate system the drawing used

// ---- map in plain pixel space: 1 unit = 1 px of the drawing at zoom 0 ----
const ll = (x, y) => L.latLng(-y, x);
const bounds = L.latLngBounds(ll(0, frame.h), ll(frame.w, 0));
const fitZoom = () => Math.log2(Math.min(innerWidth / frame.w, innerHeight / frame.h) * 0.96);
let Z0 = fitZoom();
const MAXF = 3;

const map = L.map('map', {
  crs: L.CRS.Simple, zoomControl: false, attributionControl: false,
  minZoom: Z0, maxZoom: Z0 + Math.log2(MAXF), zoomSnap: 0, zoomDelta: Math.log2(MAXF), // one step = straight to 3×
  scrollWheelZoom: false, // replaced below: one flick = one jump
  wheelPxPerZoomLevel: 110, wheelDebounceTime: 25,
  maxBounds: bounds.pad(0.08), maxBoundsViscosity: 0.85, bounceAtZoomLimits: false,
  zoomAnimation: !reduced, fadeAnimation: !reduced, inertia: !reduced, inertiaDeceleration: 2600,
  doubleClickZoom: false, // a single click already leans in; a double click would fight it
});
map.setView(bounds.getCenter(), Z0, { animate: false }); // exactly the 'whole map' state
// ?f=2.5&at=1500,300 opens zoomed in at a map point (for testing / deep links)
if (qs.get('f')) { const [ax, ay] = (qs.get('at') || `${frame.w / 2},${frame.h / 2}`).split(',').map(Number); map.setView(ll(ax, ay), Z0 + Math.log2(+qs.get('f')), { animate: false }); }

const f = (z = map.getZoom()) => 2 ** (z - Z0); // 1 = whole map, 3 = closest
const ramp = (x, [a, b]) => (b <= a ? 1 : Math.max(0, Math.min(1, (x - a) / (b - a))));

// ---- one tile layer per tier; a tier only starts loading just before it reveals ----
const HI = devicePixelRatio >= 1.5 ? 1 : 0; // retina: one baked zoom sharper, tiles shown at 128 css px
const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const tierLayers = tiers.map((t) => ({
  t, on: false,
  layer: L.tileLayer(`./tiles/${t.id}/{z}/{x}/{y}.webp`, {
    tileSize: 256 >> HI, zoomOffset: HI, noWrap: true, bounds, minNativeZoom: t.native[0] - HI, maxNativeZoom: t.native[1] - HI,
    minZoom: -10, maxZoom: 10, errorTileUrl: EMPTY, keepBuffer: 3, updateWhenZooming: false, className: `tier-${t.id}`,
  }),
}));

// ---- labels: live text, hand-lettered, constant-ish screen size ----
const FONT = {
  't-place': ['AD', 15, '.12em'], 't-place--big': ['AD', 19, '.12em'], 't-place--small': ['RB', 20, '0'],
  't-region': ['AD', 17, '.45em'], 't-region--soft': ['RB', 22, '.08em'], 't-region--wakhan': ['AD', 14, '.28em'],
  't-river': ['RB', 19, '0'], 't-note': ['RB', 21, '0'], 't-note--small': ['RB', 18, '0'], 't-landmark': ['RB', 17, '0'],
  't-trip': ['RB', 18, '0'], 't-country': ['AD', 14, '.55em'], 't-compass': ['AD', 20, '0'], 't-scale': ['RB', 16, '0'], 't-town': ['AD', 11, '.06em'], 't-pass': ['RB', 15, '0'],
  'w-place': ['AD', 12, '.06em'], 'w-small': ['RB', 15, '0'], 'w-note': ['RB', 16, '0'], 'w-peak': ['AD', 12, '.08em'],
  'w-region': ['AD', 11, '.5em'], 'w-country': ['AD', 12, '.6em'], 'w-river': ['RB', 15, '0'],
};
const labelPane = map.createPane('labels'); labelPane.style.zIndex = 450; labelPane.style.pointerEvents = 'none';
const LBL = labels.map((l, i) => {
  const classes = l.cls.split(/\s+/);
  const key = [...classes].reverse().find((c) => FONT[c]) || 't-place';
  const [fam, size, spacing] = FONT[key];
  const r = rng(`${l.text}|${i}`), squeeze = classes.includes('t-squeeze');
  const chars = [...l.text].map((ch, k, arr) => {
    if (ch === ' ') return '<i></i>';
    const s = squeeze ? 1 - (k / arr.length) ** 1.6 * 0.45 : 1;
    return `<span style="--i:${k};transform:translateY(${((r() - 0.5) * 2.4).toFixed(1)}px) rotate(${((r() - 0.5) * 8).toFixed(1)}deg);${s !== 1 ? `font-size:${s.toFixed(2)}em;` : ''}">${ch.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</span>`; // label text is data
  }).join('');
  const red = classes.includes('t-trip') ? 'color:var(--red);' : '';
  const faint = classes.includes('w-region') ? 'opacity:.55;' : classes.includes('w-country') ? 'opacity:.35;' : classes.includes('t-country') ? 'opacity:.45;' : '';
  const heavy = classes.includes('t-place--big') ? ' heavy big' : (classes.includes('t-place') && !classes.includes('t-place--small')) ? ' heavy' : '';
  const shift = l.anchor === 'middle' ? 'translateX(-50%) ' : l.anchor === 'end' ? 'translateX(-100%) ' : '';
  const html = `<div class="lbl ${fam}${heavy}${l.anchor === 'middle' ? ' mid' : l.anchor === 'end' ? ' end' : ''}" style="--fs:${size}px;letter-spacing:${spacing};${red}${faint}transform:${shift}rotate(${l.rot.toFixed(1)}deg)">${chars}</div>`;
  const marker = L.marker(ll(l.x, l.y), { icon: L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }), pane: 'labels', interactive: false, keyboard: false });
  marker.addTo(map);
  return { l, marker, el: null, base: faint ? parseFloat(faint.split(':')[1]) : 1 };
});

// ---- reveal: tiers + labels follow the zoom continuously ----
function reveal(z) {
  const k = f(z);
  document.documentElement.style.setProperty('--lz', (0.9 + 0.1 * k).toFixed(3));
  for (const tl of tierLayers) {
    const op = ramp(k, tl.t.reveal);
    const want = op > 0 || k >= tl.t.reveal[0] - 0.15; // warm up just before
    if (want && !tl.on) { tl.layer.addTo(map); tl.on = true; }
    if (!want && tl.on) { map.removeLayer(tl.layer); tl.on = false; }
    if (tl.on) tl.layer.setOpacity(op);
  }
  for (const L_ of LBL) {
    L_.el ??= L_.marker.getElement()?.firstElementChild;
    const out = L_.l.hide ? 1 - ramp(k, L_.l.hide) : 1;
    if (L_.el) L_.el.style.opacity = (ramp(k, L_.l.reveal) * out * L_.base).toFixed(2);
  }
}

// collisions: most important label wins; runs when the zoom settles, not per frame
// Each label is approximated by a chain of circles along its (possibly tilted)
// baseline, so a slanted label only blocks the ground it actually covers.
function declutter() {
  const placed = [];
  const shown = (x) => ramp(f(), x.l.reveal) * (x.l.hide ? 1 - ramp(f(), x.l.hide) : 1);
  const vis = LBL.filter((x) => x.el && shown(x) > 0.05).sort((a, b) => a.l.priority - b.l.priority);
  for (const x of LBL) x.el?.classList.remove('is-hidden');
  for (const x of vis) {
    const p = map.latLngToContainerPoint(ll(x.l.x, x.l.y));
    const w = x.el.scrollWidth, h = x.el.offsetHeight || 14, a = (x.l.rot * Math.PI) / 180;
    const start = x.l.anchor === 'middle' ? -w / 2 : x.l.anchor === 'end' ? -w : 0, rad = Math.max(h, parseFloat(getComputedStyle(x.el).fontSize)) * 0.5; // letters' own height: close neighbours may sit side by side
    const circles = [];
    for (let d = start + rad * 0.6; d <= start + w; d += rad) circles.push([p.x + Math.cos(a) * d + Math.sin(a) * rad, p.y + Math.sin(a) * d - Math.cos(a) * rad]);
    if (placed.some(([cx, cy, cr]) => circles.some(([qx, qy]) => (cx - qx) ** 2 + (cy - qy) ** 2 < (cr + rad) ** 2))) x.el.classList.add('is-hidden');
    else placed.push(...circles.map(([cx, cy]) => [cx, cy, rad]));
  }
}

const zoomedState = (z) => document.documentElement.classList.toggle('zoomed', f(z) > 1.05);
map.on('zoomanim', (e) => { reveal(e.zoom); zoomedState(e.zoom); });
map.on('zoom', () => reveal(map.getZoom()));
// Two states only: whole map ↔ 3×. Anything that ends in between (a pinch)
// carries on to the end it was heading for.
const isIn = () => map.getZoom() > map.getMinZoom() + 0.02;
let settled = map.getMinZoom();
map.on('zoomend', () => { reveal(map.getZoom()); declutter(); zoomedState(map.getZoom()); });
// only a pinch can stop in between — when the fingers lift, finish the jump it was making
map.getContainer().addEventListener('touchend', (e) => {
  if (e.touches.length) return;
  setTimeout(() => {
    const z = map.getZoom(), lo = map.getMinZoom(), hi = map.getMaxZoom();
    if (z > lo + 0.02 && z < hi - 0.02) map.setZoom(z > settled ? hi : lo, { animate: !reduced });
    settled = z > (lo + hi) / 2 ? hi : lo;
  }, 60);
});
// wheel / trackpad: one gesture = one jump, towards the pointer; trackpad momentum is swallowed
let wheelLock = 0, wheelAcc = 0;
map.getContainer().addEventListener('wheel', (e) => {
  e.preventDefault();
  if (html.classList.contains('op-drawing')) return; // this flick only skips the opening
  const now = performance.now();
  if (now < wheelLock) return;
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) < 30) return;
  const inward = wheelAcc < 0; wheelAcc = 0; wheelLock = now + 700;
  if (inward && !isIn()) map.setZoomAround(map.mouseEventToContainerPoint(e), map.getMaxZoom(), { animate: !reduced });
  else if (!inward && isIn()) map.setView(bounds.getCenter(), map.getMinZoom(), { animate: !reduced });
}, { passive: false });
map.on('zoomstart', () => { document.getElementById('hint').style.opacity = 0; });
addEventListener('resize', () => { const wasIn = isIn(); Z0 = fitZoom(); map.setMinZoom(Z0); map.setMaxZoom(Z0 + Math.log2(MAXF)); map.setZoom(wasIn ? map.getMaxZoom() : Z0, { animate: false }); settled = map.getZoom(); reveal(map.getZoom()); });

// controls
document.getElementById('zin').onclick = () => map.setZoom(map.getMaxZoom(), { animate: !reduced });
document.getElementById('zout').onclick = () => map.setView(bounds.getCenter(), map.getMinZoom(), { animate: !reduced });
document.getElementById('zfit').onclick = () => map.setView(bounds.getCenter(), map.getMinZoom(), { animate: !reduced });
addEventListener('keydown', (e) => { if (e.key === '0') map.setView(bounds.getCenter(), map.getMinZoom(), { animate: !reduced }); });

// ---- affordances: what can be zoomed, and how ----
// the pencil magnifier cursor (drawn, not the system one), with a paper halo so it reads on graphite too
const lensCursor = (sign) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'><g fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='#ebe7dd' stroke-width='4.5'><path d='M11.5 3.6c4.6-.3 8.2 3.3 8 7.8-.1 4.4-3.8 7.9-8.2 7.7-4.3-.1-7.6-3.7-7.4-8 .2-4.1 3.5-7.4 7.6-7.5z'/><path d='M17.6 17.8l7.6 7.9'/></g><g stroke='#37332e'><path stroke-width='1.8' d='M11.5 3.6c4.6-.3 8.2 3.3 8 7.8-.1 4.4-3.8 7.9-8.2 7.7-4.3-.1-7.6-3.7-7.4-8 .2-4.1 3.5-7.4 7.6-7.5z'/><path stroke-width='3' d='M17.6 17.8l7.6 7.9'/><path stroke-width='1.7' d='M7.9 11.3h7.3${sign === '+' ? 'M11.6 7.7v7.2' : ''}'/></g></g></svg>`)}") 11 11`;
html.style.setProperty('--cur-in', lensCursor('+'));

// the lens ring: one wobbly pencil circle (drawn once), easing after the pointer
const lens = document.getElementById('lens'), lensR = rng('lens'), tip = lens.querySelector('.lens-tip');
{
  const pts = Array.from({ length: 34 }, (_, i) => { const a = (i / 33) * Math.PI * 2.08 - 0.9, rr = 31 + (lensR() - 0.5) * 2.2 + i * 0.05; return `${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`; });
  lens.querySelector('svg').innerHTML = `<path class="rim" d="M${pts.join(' L')}"/><path class="glint" d="M-20 -14 Q-16 -21 -8 -24"/>`;
}
let lx = -999, ly = -999, tx = 0, ty = 0, raf = 0;
const follow = () => {
  lx += (tx - lx) * 0.22; ly += (ty - ly) * 0.22; // a soft lag: the motion is what draws the eye
  lens.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
  raf = Math.hypot(tx - lx, ty - ly) > 0.3 ? requestAnimationFrame(follow) : 0;
};
// the tip shows on a first visit only, for a few seconds of hovering
let tipSeen = false; try { tipSeen = localStorage.getItem('fieldnotes-lens-tip') === '1'; } catch {}
let tipTimer = 0;
const showTip = () => {
  if (tipSeen || tipTimer) return;
  tip.classList.add('on');
  tipTimer = setTimeout(() => { tip.classList.remove('on'); tipSeen = true; try { localStorage.setItem('fieldnotes-lens-tip', '1'); } catch {} }, 4500);
};
const mapEl = map.getContainer();
mapEl.addEventListener('pointermove', (e) => {
  const off = e.target.closest?.('.ps, .ui, .almanac');
  if (isIn() || off || e.pointerType !== 'mouse') { lens.classList.remove('on'); return; }
  tx = e.clientX; ty = e.clientY;
  if (lx < -900) { lx = tx; ly = ty; }
  if (!raf) raf = requestAnimationFrame(follow);
  lens.classList.add('on');
  if (!html.classList.contains('opening')) showTip();
});
mapEl.addEventListener('pointerleave', () => lens.classList.remove('on'));
map.on('zoomstart', () => { lens.classList.remove('on'); tip.classList.remove('on'); });

// at the whole map, a click leans in right there (what the magnifier promises)
let leanedInAt = 0;
map.on('click', (e) => {
  if (html.classList.contains('opening') || isIn()) return;
  leanedInAt = performance.now();
  map.setZoomAround(e.containerPoint, map.getMaxZoom(), { animate: !reduced });
});
// zoomed in, a double tap / double click steps back to the whole map (Leaflet turns a double tap into dblclick).
// Ignore the one that ends a double click at the overview — its first click just leaned in.
map.on('dblclick', () => {
  if (!isIn() || performance.now() - leanedInAt < 700 || html.classList.contains('opening')) return;
  if (!document.querySelector('.pp-lightbox[hidden]')) return; // a print is held up close
  map.setView(bounds.getCenter(), map.getMinZoom(), { animate: !reduced });
});
// Esc steps back out — unless a pile is open or a print is held up (those close first)
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !isIn() || document.querySelector('.ps.open') || document.querySelector('.pp-lightbox:not([hidden])')) return;
  map.setView(bounds.getCenter(), map.getMinZoom(), { animate: !reduced });
}, true);

// ?debug: a click reads back real coordinates through the drawing's own warp (pin-readiness check)
const readout = document.getElementById('readout');
if (qs.has('debug')) map.on('click', (e) => {
  const [lon, lat] = geo.fromMap([e.latlng.lng, -e.latlng.lat]);
  readout.textContent = `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
  readout.classList.add('on'); clearTimeout(readout._t); readout._t = setTimeout(() => readout.classList.remove('on'), 2500);
});

const t0Loaded = new Promise((res) => tierLayers[0].layer.once('load', res));
await track(document.fonts.ready);
reveal(map.getZoom());
zoomedState(map.getZoom()); // opened via a ?f=3 deep link → start with details stepped aside
requestAnimationFrame(declutter);
// photo prints pinned to their places (placeholders until the real trip photos)
const { stacks } = await stacksReq;
const stackLayers = addPhotoPrints({ map, geo, stacks, toLatLng: ll, reduced });

mountAlmanac(document.getElementById('almanac'));
{ // the title block's rules, pencil-drawn: a light one under the kicker, a heavy pressed one under the title
  const tr = rng('title-block');
  document.querySelector('.tb-rule.thin').innerHTML = brush([[1, 3], [80, 2.4], [160, 3.6], [228, 2.8]], tr, { w: 1.1, o: 0.6, taperIn: 0.05, taperOut: 0.3 });
  document.querySelector('.tb-rule.heavy').innerHTML = brush([[1, 5], [120, 4], [240, 6], [358, 4.6]], tr, { w: 3.4, o: 0.85, taperIn: 0.04, taperOut: 0.18 }) + brush([[6, 7.5], [150, 6.6], [300, 8]], tr, { w: 1.4, o: 0.4, taperIn: 0.1, taperOut: 0.4 });
}

let guides;
if (withOpening) {
  const left = Math.max(1000, OPENING_BUDGET - (performance.now() - started));
  const ready = await Promise.race([openingAssets.then(([g]) => g, () => null), sleep(left).then(() => null)]);
  if (ready) { guides = ready; await Promise.race([track(t0Loaded), sleep(8000)]); } // the real tiles must be ready to take over
  else { withOpening = false; html.classList.remove('opening', 'op-drawing'); await Promise.race([t0Loaded, sleep(4000)]); } // too slow: just the map
}
await sleep(Math.max(0, 900 - (performance.now() - started))); // never just flash the title page
preload.classList.add('out');
for (const ly of stackLayers) ly.loadThumbs(); // the prints only appear late in the opening: they waited for the sheet
setTimeout(() => { preload.hidden = true; }, 600);
const startCheckin = () => addCheckinPin({ map, geo, toLatLng: ll, url: CHECKIN_URL, stops: stacks.filter((s) => s.precision !== 'hidden').map((s) => [s.lon, s.lat]) });
if (!withOpening) startCheckin();
if (withOpening) {
  // opened in a background tab: wait until someone is actually looking
  if (document.hidden && holdAt === null) await new Promise((ok) => addEventListener('visibilitychange', ok, { once: true }));
  await sleep(holdAt !== null ? 0 : 250);
  await playOpening();
  startCheckin(); // the newest thing on the sheet arrives after the photos
}

// ---- the opening: outline → rivers → mountains → names → places → stacks & notes ----
async function playOpening() {
  const at = holdAt ?? 0, frozen = holdAt !== null;
  const T = (x) => `${(x - at).toFixed(2)}s`; // start times, relative to now
  if (frozen) html.classList.add('op-frozen');
  // lettering: neighbours, then regions, then the capital and cities, then the rest — each west → east
  const shown = LBL.filter((x) => (x.el ??= x.marker.getElement()?.firstElementChild) && ramp(1, x.l.reveal) > 0 && !x.el.classList.contains('is-hidden'));
  const order = (c) => (c.includes('t-country') ? 0 : c.includes('t-region') ? 1 : c.includes('t-place--big') ? 2 : c.includes('t-place') && !c.includes('--small') ? 3 : 4);
  const START = [1.85, 2.3, 2.85, 3.0, 3.45], GAP = [0.12, 0.14, 0, 0.1, 0.05];
  let writeEnd = 0;
  [0, 1, 2, 3, 4].forEach((g) => shown.filter((x) => order(x.l.cls) === g).sort((a, b) => a.l.x - b.l.x).forEach((x, i) => {
    const t = START[g] + i * GAP[g];
    x.el.style.setProperty('--d', T(t));
    writeEnd = Math.max(writeEnd, t + x.l.text.length * 0.042 + 0.11);
  }));
  // the notes and controls settle onto the finished sheet; then, after a breath, the
  // photos arrive last — one stack at a time, in the order of the trip (Day 1, Day 2, …)
  document.getElementById('titleBlock').style.setProperty('--xd', T(1.7)); // the title goes on right after the outline
  document.getElementById('almanac').style.setProperty('--xd', T(4.3));
  document.querySelector('.zoom').style.setProperty('--xd', T(4.5));
  document.getElementById('hint').style.setProperty('--xd', T(4.7));
  const PHOTOS_AT = 5.4, PHOTO_GAP = 0.26, day = (ly) => parseInt(String(ly.s.date).replace(/\D+/g, ''), 10) || 99;
  [...stackLayers].sort((a, b) => day(a) - day(b)).forEach((ly, i) => ly._el.style.setProperty('--xd', T(PHOTOS_AT + i * PHOTO_GAP)));
  const allEnd = Math.max(writeEnd, 4.7 + 0.9, PHOTOS_AT + stackLayers.length * PHOTO_GAP + 0.8);

  html.classList.add('op-play'); // start every scheduled animation now
  const HANDLERS = ['dragging', 'touchZoom', 'boxZoom', 'keyboard']; // (doubleClickZoom stays off: a click leans in)
  HANDLERS.forEach((h) => map[h]?.disable());
  const op = createOpening({ map, frame, ll, guides, images: plateImgs });
  // any touch, scroll or key finishes the drawing at once
  let skipped = false;
  const skip = () => { skipped = true; op.skip(); html.classList.remove('opening', 'op-play'); };
  const EV = ['pointerdown', 'wheel', 'keydown', 'resize'];
  if (!frozen) EV.forEach((ev) => addEventListener(ev, skip, { capture: true, passive: true }));
  await op.play({ at, frozen });
  // the drawing is complete: swap to the tiles in the same frame — they are the same
  // drawing, so a crossfade would only double every line for a moment
  html.classList.remove('op-drawing');
  op.canvas.remove();

  HANDLERS.forEach((h) => map[h]?.enable());
  if (!skipped) await sleep((allEnd - Math.max(at, 4.6)) * 1000);
  html.classList.remove('opening', 'op-play');
  EV.forEach((ev) => removeEventListener(ev, skip, { capture: true }));
}

window.__map = map; // for testing
