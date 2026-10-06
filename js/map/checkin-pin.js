// "I was here" — the last check-in, as a traveller's margin note: a red pencil arrow curving in from open paper,
// stopping just short of the spot, with "I was here!" and "5 days ago" handwritten at its tail (zoomed in: the place
// and the note too). Reads the public check-in file (only publicView() output — see js/checkin/core.js), re-checked
// every 30 s and redrawn when it changes. The note picks the direction with the most open paper.
// Text goes in with textContent only — a note can never inject markup.

import { rng } from '../engine.js';

const TZ = 'Asia/Kabul';
const LEN = 74;                                   // css px from the spot to the arrow's tail
// candidate directions (deg; 0 = right, -90 = up), in order of preference — open paper above-left reads best
const DIRS = [-145, -35, 180, 0, -110, -70, 145, 35];

function when(dateStr) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD in Kabul
  const days = Math.round((Date.parse(today) - Date.parse(dateStr)) / 864e5);
  const pretty = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : pretty;
}

export function addCheckinPin({ map, geo, toLatLng, url, every = 30_000, stops = [] }) {
  const pane = map.createPane('checkin');
  pane.style.zIndex = 470; // above the photo stacks: it's the newest thing on the sheet
  let marker = null, lastJson = '', current = null;

  // the arrow for direction `deg`: a bowed pencil line from the tail to just short of the spot, plus a two-stroke head
  function arrow(deg, gap, seed) {
    const g = rng(seed), a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    const tail = [ux * LEN, uy * LEN], tip = [ux * gap, uy * gap];
    const bend = (g() < 0.5 ? -1 : 1) * (14 + g() * 8);           // bowed, like a quick hand
    const mid = [(tail[0] + tip[0]) / 2 - uy * bend, (tail[1] + tip[1]) / 2 + ux * bend];
    const hx = tip[0] - mid[0], hy = tip[1] - mid[1], hl = Math.hypot(hx, hy) || 1, dx = hx / hl, dy = hy / hl;
    const head = (s) => { const c = Math.cos(s), sn = Math.sin(s), bx = -(dx * c - dy * sn) * 8, by = -(dx * sn + dy * c) * 8; return `M${tip[0].toFixed(1)} ${tip[1].toFixed(1)} l${bx.toFixed(1)} ${by.toFixed(1)}`; };
    const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    return { d: `M${f(tail)} Q${f(mid)} ${f(tip)}`, head: `${head(0.5)} ${head(-0.45)}`, tail };
  }

  function placeText(text, ar, left) {
    text.style.left = left ? '' : `${ar.tail[0] + 4}px`;
    text.style.right = left ? `${-ar.tail[0] + 4}px` : '';
    text.style.top = `${ar.tail[1] - 18}px`;
    text.classList.toggle('end', left);
  }

  function layout(el, c) {
    // the gap keeps the tip off the stop's diamond, which grows with the zoom
    const k = 2 ** map.getZoom(), gap = stops.some(([lon, lat]) => Math.hypot(lon - c.lon, lat - c.lat) < 0.15) ? 7.5 * k + 5 : 6;
    const text = el.querySelector('.ci-text'), svg = el.querySelector('svg');
    const blockers = [...document.querySelectorAll('.lbl:not(.is-hidden), .ps-pile, .ps-stop')]
      .filter((b) => !b.classList.contains('lbl') || +getComputedStyle(b).opacity > 0.1)
      .map((b) => b.getBoundingClientRect());
    const overlap = (a) => blockers.reduce((s, b) => s + Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)), 0);
    const seed = `${c.date}${c.lat}${c.lon}`;
    let best = null;
    DIRS.forEach((deg, i) => {
      const ar = arrow(deg, gap, seed), left = Math.cos((deg * Math.PI) / 180) < -0.2; // the note hangs off the tail, outward
      placeText(text, ar, left);
      const cost = overlap(text.getBoundingClientRect()) + i * 40; // ties → the preferred order
      if (!best || cost < best.cost) best = { cost, ar, left };
    });
    placeText(text, best.ar, best.left);
    svg.innerHTML = `<path class="ci-arrow" pathLength="1" d="${best.ar.d}"/><path class="ci-head" pathLength="1" d="${best.ar.head}"/>`;
    // a minor name under the note steps aside; major cities always stay
    for (const l of document.querySelectorAll('.lbl.ci-cover')) l.classList.remove('ci-cover');
    const box = text.getBoundingClientRect();
    for (const l of document.querySelectorAll('.lbl:not(.heavy)')) {
      const b = l.getBoundingClientRect();
      if (b.right > box.left && b.left < box.right && b.bottom > box.top && b.top < box.bottom) l.classList.add('ci-cover');
    }
  }

  function draw(c) {
    const el = document.createElement('div');
    el.className = 'ci';
    el.innerHTML = `<svg class="ci-mark" width="1" height="1" overflow="visible" aria-hidden="true"></svg>
      <div class="ci-text"><span class="ci-k">I was here!</span><span class="ci-when"></span><span class="ci-name"></span><span class="ci-note"></span></div>`;
    el.querySelector('.ci-when').textContent = when(c.date);
    el.querySelector('.ci-name').textContent = c.name || '';
    el.querySelector('.ci-note').textContent = c.note ? `“${c.note}”` : '';
    el.setAttribute('role', 'note');
    el.setAttribute('aria-label', `Last check-in${c.name ? ` near ${c.name}` : ''}, ${when(c.date)}${c.note ? `: ${c.note}` : ''}`);
    return el;
  }

  map.on('zoomend', () => requestAnimationFrame(() => { const el = marker?.getElement()?.querySelector('.ci'); if (el && current) layout(el, current); }));

  async function refresh() {
    let j;
    try { j = await (await fetch(url, { cache: 'no-store' })).text(); } catch { return; } // offline: keep what we have
    if (j === lastJson) return;
    lastJson = j;
    let c = null;
    try { c = JSON.parse(j).checkin; } catch { /* malformed: treat as none */ }
    if (marker) { marker.remove(); marker = null; current = null; }
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return;
    const [x, y] = geo.toMap([c.lon, c.lat]); // the drawing's own warp: lands beside the right drawn town
    const icon = L.divIcon({ html: '', className: 'ci-icon', iconSize: [0, 0], iconAnchor: [0, 0] });
    marker = L.marker(toLatLng(x, y), { icon, pane: 'checkin', interactive: false, keyboard: false }).addTo(map);
    const el = draw(c);
    marker.getElement().appendChild(el);
    current = c;
    requestAnimationFrame(() => { layout(el, c); requestAnimationFrame(() => el.classList.add('in')); }); // the pencil draws the arrow in
  }

  refresh();
  setInterval(refresh, every);
  addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return { refresh };
}
