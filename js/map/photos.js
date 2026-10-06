// Photo stacks pinned to the sketch map — one loose pile of prints per place.
// A stack is a physical object on the paper: it lives in map units and scales with
// the zoom, sits a little away from its spot, and a pencil leader runs to a
// red-pencil ring on the exact place (positions via geo.toMap, like the drawing).
//
//   rest   → a pile: deckle-edged prints at odd angles, top photo visible, "×n"
//   hover  → the pile loosens
//   click  → the pile deals out into a tidy arrangement around its place (zooms in first at 1×)
//   click a print → held up close; ← / → flip through the stack; Esc / map click → gather

import { rng } from '../engine.js';

const W = 64, H = 58;        // one print, map units (photo + caption strip)
const CELL = [72, 66];       // spread grid cell

// scalloped "deckle" edge, like old photo prints
function deckle(r) {
  const pts = [], step = 3.2, d = 0.9;
  const edge = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.round(len / step);
    for (let i = 0; i < n; i++) { const t = i / n, k = i % 2 ? d * (0.6 + r() * 0.5) : 0; pts.push([x0 + (x1 - x0) * t + nx * k, y0 + (y1 - y0) * t + ny * k]); }
  };
  edge(0, 0, W, 0, 0, 1); edge(W, 0, W, H, -1, 0); edge(W, H, 0, H, 0, -1); edge(0, H, 0, 0, 1, 0);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
}

// The stop marker: a plain diamond on the exact place — turquoise, a thin pencil outline, a small shadow.
// Bigger stops get a slightly bigger diamond. Map px, centred on (0, 0); `radius` positions the tag.
function diamond(nPhotos, r) {
  const R = 5 + Math.min(nPhotos, 7) * 0.32, j = () => ((r() - 0.5) * 0.5).toFixed(2); // a hand-placed corner, not a CAD one
  const d = `M${j()} ${-R} L${R} ${j()} L${j()} ${R} L${-R} ${j()} Z`;
  return { svg: `<path class="stop-shadow" d="${d}" transform="translate(1.1 1.4)"/><path class="stop-tile" d="${d}"/><path class="stop-line" d="${d}"/>`, radius: R };
}

// photos.json is data, never markup: every text goes through esc(), numbers through num(), and image
// URLs must be http(s) or a relative path (no javascript:/data: tricks).
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
export const safeUrl = (u) => { const t = String(u ?? '').trim(); return /^https:\/\//i.test(t) || /^\.{0,2}\/(?!\/)/.test(t) ? t : ''; };

function spread(n, r) {
  const cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols, row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
    return [(c - (inRow - 1) / 2) * CELL[0], (row - (rows - 1) / 2) * CELL[1], (r() - 0.5) * 1.6];
  });
}

export function addPhotoPrints({ map, geo, stacks, toLatLng, reduced = false }) {
  const pane = map.createPane('photos');
  // milestones are numbered in trip order (Day 1, Day 2, …)
  const day = (s) => parseInt(String(s.date).replace(/\D+/g, ''), 10) || 99;
  const shown = stacks.filter((s) => s && s.precision !== 'hidden' && Array.isArray(s.photos) && s.photos.length && Number.isFinite(+s.lon) && Number.isFinite(+s.lat));
  const milestone = new Map([...shown].sort((a, b) => day(a) - day(b)).map((s, i) => [s.id, i + 1]));
  pane.style.zIndex = 460; // prints physically cover the lettering under them
  let open = null;

  const Stack = L.Layer.extend({
    initialize(s) {
      // numbers stay numbers (they go into style attributes), photos stay a list of {img, caption}
      this.s = { ...s, dx: num(s.dx), dy: num(s.dy), rot: num(s.rot), lon: num(s.lon), lat: num(s.lat),
        photos: (Array.isArray(s.photos) ? s.photos : []).map((p) => ({ img: safeUrl(p?.img), caption: String(p?.caption ?? '') })) };
    },
    onAdd(m) {
      const { s } = this, r = rng(s.id);
      this._ll = toLatLng(...geo.toMap([s.lon, s.lat]));
      const el = (this._el = L.DomUtil.create('div', 'ps leaflet-zoom-animated', m.getPane('photos')));
      const ex = s.dx, ey = s.dy + (s.dy < 0 ? H * 0.55 : -H * 0.5), len = Math.hypot(ex, ey) || 1;
      const bow = ((r() - 0.5) * 0.3 + 0.12) * len;
      const cn = diamond(s.photos.length, r), no = milestone.get(s.id);
      const fan = spread(s.photos.length, r);
      // bottom of the pile first; the top print is the last one drawn
      const prints = s.photos.map((p, i) => {
        const top = i === 0, k = s.photos.length - 1 - i;
        const [fx, fy, fr] = fan[i];
        return `<button type="button" class="pp${top ? ' pp-top' : ''}" style="z-index:${s.photos.length - i};--sx:${(top ? 0 : (r() - 0.5) * 24).toFixed(1)}px;--sy:${(top ? 0 : (r() - 0.5) * 16 + k * 0.8).toFixed(1)}px;--sr:${(top ? s.rot : s.rot + (r() < 0.5 ? -1 : 1) * (8 + r() * 22)).toFixed(1)}deg;--fx:${fx.toFixed(1)}px;--fy:${fy.toFixed(1)}px;--fr:${fr.toFixed(1)}deg;--d:${(i * 0.035).toFixed(3)}s" aria-label="${esc(s.title)}, photo ${i + 1} of ${s.photos.length}" data-i="${i}">
          <span class="pp-paper" style="clip-path:${deckle(r)}">
            <span class="pp-photo"><img src="${esc(safeUrl(p.img))}" alt="" decoding="async"></span>
            <span class="pp-cap">${esc(p.caption)}</span>
          </span></button>`;
      }).reverse().join('');
      el.innerHTML = `
        <svg class="pp-lead" overflow="visible" width="1" height="1" aria-hidden="true">
          <path d="M0 0 Q${(ex / 2 - (ey / len) * bow).toFixed(1)} ${(ey / 2 + (ex / len) * bow).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}"/>
        </svg>
        <button type="button" class="ps-stop" style="--ch:${cn.radius.toFixed(1)}px" aria-label="Milestone ${no}: ${esc(s.title)} — ${esc(s.place)}, ${esc(s.date)}">
          <svg overflow="visible" width="1" height="1" aria-hidden="true">${cn.svg}</svg>
        </button>
        <span class="ps-tag ${s.dx >= 0 ? 'left' : 'right'}" style="--ch:${cn.radius.toFixed(1)}px" aria-hidden="true">
          <b>Milestone ${no}</b><span class="tg-where">${esc(s.place)} · ${esc(s.date)}</span><span class="tg-title">${esc(s.title)}</span>
        </span>
        <div class="ps-pile" style="--x:${s.dx}px;--y:${s.dy}px">
          ${prints}
          <i class="pp-tape" style="--tr:${((r() - 0.5) * 12).toFixed(1)}deg;--tx:${((r() - 0.5) * 10).toFixed(1)}px;--rot:${s.rot}deg"></i>
          <span class="ps-count">${esc(s.place)} ×${s.photos.length}</span>
        </div>`;
      el.addEventListener('click', (e) => {
        L.DomEvent.stop(e);
        if (e.target.closest('.ps-stop')) { if (open !== this) this.deal(); return; }
        const b = e.target.closest('.pp');
        if (!b) return;
        if (open === this) viewer(s, +b.dataset.i); // arranged: look at this one
        else this.deal();                             // pile: arrange it (zooming in first at the overview)
      });
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      m.on('zoomanim', this._animate, this);
      m.on('zoom viewreset', this._reset, this);
      this._reset();
    },
    onRemove(m) { this._el.remove(); m.off('zoomanim', this._animate, this); m.off('zoom viewreset', this._reset, this); },
    _reset() { const k = 2 ** this._map.getZoom(); L.DomUtil.setTransform(this._el, this._map.latLngToLayerPoint(this._ll), k); this._el.style.setProperty('--s', k); },
    _animate(e) { const k = 2 ** e.zoom; L.DomUtil.setTransform(this._el, this._map._latLngToNewLayerPoint(this._ll, e.zoom, e.center), k); this._el.style.setProperty('--s', k); },

    deal() {
      if (open === this) return;
      if (open) open.gather();
      const m = this._map;
      // an opened pile sits above everything on the sheet, the check-in pin included
      const go = () => { open = this; this._el.classList.add('open'); pane.classList.add('focusing'); pane.style.zIndex = 480; };
      // at the overview, walk up to the place first
      if (m.getZoom() < m.getMaxZoom() - 0.02) {
        const [x, y] = geo.toMap([this.s.lon, this.s.lat]);
        m.once('zoomend', go);
        m.setView(toLatLng(x + this.s.dx * 0.6, y + this.s.dy * 0.6), m.getMaxZoom(), { animate: !reduced });
      } else go();
    },
    gather() { this._el.classList.remove('open'); if (open === this) { open = null; pane.classList.remove('focusing'); pane.style.zIndex = 460; } },
  });

  const layers = shown.map((s) => new Stack(s).addTo(map));
  map.on('click', () => open?.gather());
  // piles only loosen on hover at the overview; up close, hover arranges them
  const mark = () => pane.classList.toggle('close', map.getZoom() > map.getMaxZoom() - 0.02);
  map.on('zoomend', () => { mark(); if (!pane.classList.contains('close')) open?.gather(); });
  mark();

  // ---- held up close, with the rest of the stack a flip away ----
  const box = document.createElement('div');
  box.className = 'pp-lightbox';
  box.hidden = true;
  box.innerHTML = `<figure class="pp-held" role="dialog" aria-modal="true" aria-label="Photo">
      <i class="pp-tape"></i><img alt=""><figcaption><b></b><span class="cap"></span><span class="n"></span></figcaption></figure>
      <button class="pp-nav prev" type="button" aria-label="Previous photo">←</button><button class="pp-nav next" type="button" aria-label="Next photo">→</button>`;
  document.body.appendChild(box);
  let cur = null, idx = 0;
  const show = () => {
    const p = cur.photos[idx];
    // show the print we already have at once, then swap in the sharp one when it arrives
    const img = box.querySelector('img'), big = safeUrl(p.img).replace(/\/480\/360$/, '/1200/900'), want = idx;
    img.src = safeUrl(p.img);
    const hi = new Image();
    hi.onload = () => { if (cur.photos[idx] === p && idx === want) img.src = big; };
    hi.src = big;
    box.querySelector('b').textContent = `${cur.date} — ${cur.place}`;
    box.querySelector('.cap').textContent = p.caption;
    box.querySelector('.n').textContent = `${idx + 1} / ${cur.photos.length}`;
    box.querySelector('.pp-held').style.setProperty('--r', `${(rng(`${cur.id}${idx}`)() - 0.5) * 3}deg`);
  };
  const step = (d) => { idx = (idx + d + cur.photos.length) % cur.photos.length; show(); };
  function viewer(s, i) { cur = s; idx = i; show(); box.hidden = false; requestAnimationFrame(() => box.classList.add('on')); }
  const close = () => { box.classList.remove('on'); setTimeout(() => { box.hidden = true; }, reduced ? 0 : 280); };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.prev')) return step(-1);
    if (e.target.closest('.next')) return step(1);
    close();
  });
  addEventListener('keydown', (e) => {
    if (!box.hidden) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      e.stopPropagation();
    } else if (e.key === 'Escape') open?.gather();
  }, true);
  return layers;
}
