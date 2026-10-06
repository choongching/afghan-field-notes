// The Wakhan detail sheet: a zoomed-in sketch of the corridor, drawn from real
// terrain (valley floor, walls, peaks, passes) in the same pencil hand as the
// main map. It has its own coordinate system (createGeo), so pins can land here too.

import { createGeo } from './geo.js';
import { resample, brush, roughLine, peak, pointInRings, S } from './pencil.js';

export const WAKHAN_BOX = [71.2, 36.3, 75.0, 37.78]; // lon0, lat0, lon1, lat1

// Valley floor ("thalweg"): for each longitude, the lowest ground inside the country.
export function valleyLine(T, inside, lonA, lonB, latLo, latHi, step = 0.04) {
  const raw = [];
  for (let lon = lonA; lon <= lonB; lon += step) {
    let best = null;
    for (let lat = latLo; lat <= latHi; lat += 0.01) {
      if (!inside(lon, lat)) continue;
      const e = T.sample(lon, lat);
      if (!best || e < best.e) best = { lat, e };
    }
    if (best) raw.push([lon, best.lat]);
  }
  return raw.map((p, i) => { const w = raw.slice(Math.max(0, i - 3), i + 4); return [p[0], w.reduce((a, q) => a + q[1], 0) / w.length]; });
}

// ---- label placement: try positions around the point, take the first free one ----
const CHAR = { 'w-title': 30 * 0.95, 'w-place': 19 * 0.68, 'w-small': 22 * 0.42, 'w-note': 25 * 0.42, 'w-peak': 17 * 0.72, 'w-region': 17 * 1.1, 'w-country': 18 * 1.2, 'w-river': 22 * 0.42 };
const SIZE = { 'w-title': 30, 'w-place': 19, 'w-small': 22, 'w-note': 25, 'w-peak': 17, 'w-region': 17, 'w-country': 18, 'w-river': 22 };
function labeller(w, h) {
  const boxes = [];
  const hit = (b) => (w < 1e6 && (b.x0 < 6 || b.y0 < 6 || b.x1 > w - 6 || b.y1 > h - 6)) || boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  return {
    block(x0, y0, x1, y1) { boxes.push({ x0, y0, x1, y1 }); },
    place(text, x, y, cls, { rot = 0, fixed = false, pad = 3 } = {}) {
      const tw = text.length * CHAR[cls], th = SIZE[cls];
      const cands = fixed ? [[0, 0]] : [[12, 6], [-tw - 12, 6], [-tw / 2, -14], [-tw / 2, th + 10], [12, -14], [12, th + 8], [-tw - 12, -14], [-tw - 12, th + 8], [-tw / 2, -34], [-tw / 2, th + 30]];
      for (const [dx, dy] of cands) {
        const b = { x0: x + dx - pad, y0: y + dy - th - pad, x1: x + dx + tw + pad, y1: y + dy + pad };
        if (!fixed && hit(b)) continue;
        boxes.push(b);
        return `<text class="${cls}" x="${(x + dx).toFixed(0)}" y="${(y + dy).toFixed(0)}"${rot ? ` transform="rotate(${rot} ${(x + dx).toFixed(0)} ${(y + dy).toFixed(0)})"` : ''}>${text}</text>`;
      }
      return ''; // no room: a traveller would just leave it off
    },
  };
}

const PLACES = [
  { name: 'Ishkashim', at: [71.61, 36.71] },
  { name: 'Khandud', at: [72.32, 36.95] },
  { name: 'Qala-e Panja', at: [72.58, 37.0] },
  { name: 'Sarhad-e Broghil', at: [73.35, 36.97], note: 'road ends here!' },
  { name: 'Bozai Gumbaz', at: [74.02, 37.12], small: true },
];
const PASSES = [
  { name: 'Broghil Pass 3,798 m', at: [73.35, 36.884] },
  { name: 'Wakhjir Pass 4,923 m', at: [74.484, 37.087], note: '→ China' },
];
const LAKES = [
  { name: 'Zorkul', at: [73.7, 37.45], rx: 30, ry: 8, rot: -8 },
  { name: 'Chaqmaqtin', at: [74.28, 37.1], rx: 20, ry: 7, rot: 12 },
];

// framed = a standalone sheet with paper, border, title and scale.
// Unframed + toLocal/fromLocal = drawn straight onto the main map (the zoom tier).
export function drawWakhanSheet({ terrain: T, data, r, seed = 'marco', w = 780, h = 380, framed = true, toLocal = null, fromLocal = null, stops = [] }) {
  const geo = toLocal ? { toMap: toLocal, fromMap: fromLocal, k: null } : createGeo({ frame: { w, h }, bounds: WAKHAN_BOX, margin: 18, seed: `${seed}|wakhan`, flaws: false });
  const P = geo.toMap, proj = (pts) => pts.map(P);
  const inside = (lon, lat) => pointInRings(lon, lat, data.afghanistan);
  const L = labeller(framed ? w : 1e6, framed ? h : 1e6);
  let g = framed ? `<defs><clipPath id="wakhan-clip"><rect x="4" y="4" width="${w - 8}" height="${h - 8}"/></clipPath></defs><rect x="0" y="0" width="${w}" height="${h}" fill="var(--paper)"/>` : '';
  let terrain = '', lines = '', marks = '', labels = '';

  // ---- terrain: shadow-side hachures, denser and darker where it's steep ----
  const d = 0.015;
  const hb = framed ? [9, 9, w - 8, h - 8] : [0, 0, w, h];
  for (let y = hb[1]; y < hb[3]; y += 8) for (let x = hb[0] + ((y / 8) % 2 ? 4 : 0); x < hb[2]; x += 8) {
    const [lon, lat] = geo.fromMap([x + (r() - 0.5) * 3, y + (r() - 0.5) * 3]);
    if (lon < T.bounds[0] + 0.05 || lon > T.bounds[2] - 0.05 || lat < T.bounds[1] + 0.05 || lat > T.bounds[3] - 0.05) continue;
    if (!framed) {
      // on the main map: no hard-edged block — sparse outside the country, feathered at the box edge
      const edge = Math.min(x - hb[0], hb[2] - x, y - hb[1], hb[3] - y) / (0.28 * Math.min(hb[2], hb[3]));
      if (r() > Math.min(1, edge) * (inside(lon, lat) ? 1 : 0.12)) continue;
    }
    const e = T.sample(lon, lat);
    const gx = (T.sample(lon + d, lat) - T.sample(lon - d, lat)) / (2 * d * 111000 * 0.8);
    const gy = (T.sample(lon, lat + d) - T.sample(lon, lat - d)) / (2 * d * 111000);
    const slope = Math.hypot(gx, gy);
    if (slope < 0.12) continue;
    const lit = (0.7 * gx - 0.7 * gy) / slope; // +1 = faces the north-west light
    if (lit > 0.3) continue;
    if (e > 5800 && lit > -0.2) continue; // snow stays white
    const ux = -gx / slope, uy = gy / slope, len = Math.min(13, 4 + slope * 16);
    const o = Math.min(0.8, 0.22 + (0.3 - lit) * 0.3 + slope * 0.45) * (inside(lon, lat) ? 1 : 0.55);
    terrain += brush([[x, y], [x + ux * len, y + uy * len]], r, { w: 0.9 + r() * 0.7, o, taperIn: 0.12, taperOut: 0.55 });
  }
  // the big massifs outlined once, firmly
  for (const line of T.contours(5200, WAKHAN_BOX)) if (line.length > 30) terrain += roughLine(proj(line), r, { tol: 2.5, w: 1.3, o: 0.5, amp: 0.9, strokeLen: [3, 8] });

  // peaks along both walls: inside the country bold, neighbours' side lighter
  const noshaqLL = [71.828, 36.432];
  const peaks = T.peaks({ radius: 4, minElev: 5400, box: WAKHAN_BOX }).filter((p) => Math.hypot(p.at[0] - noshaqLL[0], p.at[1] - noshaqLL[1]) > 0.08).slice(0, 26);
  for (const p of peaks.sort((a, b) => b.at[1] - a.at[1])) {
    const [x, y] = P(p.at), hgt = 14 + ((p.elev - 5400) / 1800) * 22;
    terrain += peak(x, y + 8, hgt, r, inside(...p.at) ? 0.9 : 0.5);
    L.block(x - hgt * 0.7, y + 8 - hgt, x + hgt * 0.7, y + 8);
  }
  const nq = P(noshaqLL);
  terrain += peak(nq[0], nq[1] + 12, 46, r, 1);
  L.block(nq[0] - 34, nq[1] - 34, nq[0] + 34, nq[1] + 12);

  // ---- lines: border (bold + frontier ticks), rivers (two banks), track (dotted) ----
  for (const ring of framed ? data.afghanistan : []) {
    lines += roughLine(proj(ring), r, { tol: 3, w: 2.8, o: 0.85, amp: 1.2, strokeLen: [2, 6], steady: true });
    const pts = resample(proj(ring), 26);
    pts.forEach(([x, y], i) => {
      if (x < 6 || y < 6 || x > w - 6 || y > h - 6 || i % 2) return;
      const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)], a = Math.atan2(ny - y, nx - x) + Math.PI / 2;
      lines += brush([[x - Math.cos(a) * 4, y - Math.sin(a) * 4], [x + Math.cos(a) * 4, y + Math.sin(a) * 4]], r, { w: 1.3, o: 0.55 });
    });
  }
  const banks = (ll, gap) => {
    const p = resample(proj(ll), 4);
    const off = (dd) => p.map(([x, y], i) => { const [px, py] = p[Math.max(0, i - 1)], [qx, qy] = p[Math.min(p.length - 1, i + 1)], l = Math.hypot(qx - px, qy - py) || 1; return [x - ((qy - py) / l) * dd, y + ((qx - px) / l) * dd]; });
    return roughLine(off(-gap), r, { tol: 1.5, w: 1.1, o: 0.7, amp: 0.8, strokeLen: [4, 9], steady: true }) + roughLine(off(gap), r, { tol: 1.5, w: 1, o: 0.55, amp: 0.8, strokeLen: [4, 9], steady: true });
  };
  const wakhanRiver = valleyLine(T, inside, 72.62, 74.45, 36.86, 37.2);
  for (const riv of data.rivers.filter((v) => ['Panj', 'Pamir'].includes(v.name))) lines += banks(riv.pts, 2.2);
  lines += banks(wakhanRiver, 1.8);
  const track = valleyLine(T, inside, 71.62, 73.35, 36.62, 37.12).map(([lon, lat]) => [lon, lat + 0.02]);
  lines += roughLine(proj(track), r, { tol: 2, w: 1.7, o: 0.7, amp: 1.5, strokeLen: [4, 8], dash: [3, 7] });

  // ---- marks: lakes, places, passes, doodles (they reserve space before labels) ----
  for (const lk of LAKES) {
    const [x, y] = P(lk.at);
    const ring = Array.from({ length: 22 }, (_, i) => { const t = (i / 21) * Math.PI * 2.15; return [x + Math.cos(t) * lk.rx * (1 + (r() - 0.5) * 0.15), y + Math.sin(t) * lk.ry * (1 + (r() - 0.5) * 0.2)]; });
    marks += `<g transform="rotate(${lk.rot} ${x} ${y})">${brush(ring, r, { w: 1.5, o: 0.8, taperIn: 0.05, taperOut: 0.1 })}${[0, 1, 2].map((k) => brush([[x - lk.rx * 0.5 + k * 8, y - 1 + k * 2], [x - lk.rx * 0.5 + k * 8 + 9, y - 1 + k * 2]], r, { w: 0.8, o: 0.45 })).join('')}</g>`;
    L.block(x - lk.rx, y - lk.ry, x + lk.rx, y + lk.ry);
  }
  for (const pl of PLACES) {
    const [x, y] = P(pl.at);
    const mk = brush([[x - 4, y - 4], [x + 4, y + 4]], r, { w: 1.5, o: 0.7 }) + brush([[x + 4, y - 4], [x - 4, y + 4]], r, { w: 1.3, o: 0.65 });
    if (!stops.some(([a, b]) => Math.hypot(a - pl.at[0], b - pl.at[1]) < 0.12)) marks += mk; // a photo stop's diamond marker marks it instead
    L.block(x - 6, y - 6, x + 6, y + 6);
  }
  for (const ps of PASSES) {
    const [x, y] = P(ps.at);
    marks += S([[x - 9, y - 7], [x - 4, y], [x - 9, y + 7]], r, { w: 1.8 }) + S([[x + 9, y - 7], [x + 4, y], [x + 9, y + 7]], r, { w: 1.8 });
    L.block(x - 10, y - 8, x + 10, y + 8);
  }
  // Kyrgyz yurt in the Little Pamir
  const [yx, yy] = P([73.95, 37.34]);
  marks += S([[yx - 16, yy], [yx - 16, yy - 10], [yx + 16, yy - 10], [yx + 16, yy]], r, { w: 1.6 }) + S([[yx - 18, yy - 10], [yx - 8, yy - 20], [yx, yy - 22], [yx + 8, yy - 20], [yx + 18, yy - 10]], r, { w: 1.6 }) + S([[yx - 4, yy], [yx - 4, yy - 7], [yx + 4, yy - 7], [yx + 4, yy]], r, { w: 1.2 });
  for (let k = 0; k < 4; k++) marks += brush([[yx - 13 + k * 8, yy - 9], [yx - 9 + k * 8, yy - 2]], r, { w: 0.7, o: 0.45 });
  L.block(yx - 19, yy - 23, yx + 19, yy + 2);
  // Marco Polo sheep in the Big Pamir — drawn as its skull (front view): a long narrow face and the
  // famous horns, each a loose spiral curling out and down, ringed with growth ridges. No caption.
  const [sx, sy] = P([73.15, 37.18]); // inside the border (37.5° was over it, in Tajikistan) and clear of every label
  const K = 1.3; // the largest that still leaves room for Sarhad-e Broghil and LITTLE PAMIR
  const sk = (pts) => pts.map(([x, y]) => [sx + x * K, sy + y * K]);
  // paper under the skull, so the peaks behind don't run through the horns (as near peaks hide far ones)
  const pf = (pts) => sk(pts).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  marks += `<path d="M${pf([[-6.8, -9], [-4, -13.2], [0, -14], [4, -13.2], [6.8, -9], [6.4, -1], [4.2, 6.5], [2, 13.6], [-2, 13.6], [-4.2, 6.5], [-6.4, -1]])} Z" fill="var(--paper)"/>`;
  for (const m of [-1, 1]) marks += `<circle cx="${(sx + 13.5 * m * K).toFixed(1)}" cy="${(sy - 3.5 * K).toFixed(1)}" r="${(11.6 * K).toFixed(1)}" fill="var(--paper)"/>`;
  marks += S(sk([[-6, -8], [-4, -11.5], [0, -12.5], [4, -11.5], [6, -8]]), r, { w: 1.5 });                 // crown
  for (const m of [-1, 1]) {
    marks += S(sk([[6 * m, -8], [5.6 * m, -1], [3.6 * m, 6], [1.6 * m, 12.5]]), r, { w: 1.4 });           // cheek → snout
    marks += brush(sk(Array.from({ length: 9 }, (_, i) => { const t = (i / 8) * Math.PI * 2.1; return [3.4 * m + Math.cos(t) * 1.9, -2.5 + Math.sin(t) * 1.5]; })), r, { w: 1.2, o: 0.8 }); // eye socket
    marks += brush(sk([[0.9 * m, 4], [0.7 * m, 9.5]]), r, { w: 0.8, o: 0.55 });                          // nasal
    // the horn: outer edge spirals out from the crown, over, down and back in (~1.3 turns)
    const cx = 13.5 * m, cy = -3.5, a0 = Math.atan2(-10 - cy, (5 * m) - cx);
    const spiral = (rad0, rad1, turns, n = 26) => Array.from({ length: n }, (_, i) => { const f = i / (n - 1), a = a0 - m * f * turns * Math.PI * 2, rr = rad0 + (rad1 - rad0) * f; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
    const outer = spiral(Math.hypot(5 * m - cx, -10 - cy), 3.2, 1.3), inner = spiral(Math.hypot(5 * m - cx, -10 - cy) - 3.2, 1.6, 1.15);
    marks += brush(sk(outer), r, { w: 1.9, o: 0.85, taperIn: 0.05, taperOut: 0.35 });
    marks += brush(sk(inner), r, { w: 1.1, o: 0.6, taperIn: 0.1, taperOut: 0.5 });
    for (let i = 2; i < 20; i += 3) marks += brush(sk([outer[i], inner[Math.min(inner.length - 1, Math.round(i * 0.9))]]), r, { w: 0.6, o: 0.45 }); // growth ridges
  }
  L.block(sx - 26 * K, sy - 16 * K, sx + 26 * K, sy + 14 * K);

  // ---- labels, most important first; whatever can't fit is left off ----
  const at = (ll) => P(ll);
  if (framed) {
    labels += L.place('THE WAKHAN', 22, 42, 'w-title', { fixed: true });
    labels += L.place('detail — not to the same scale!', 24, 64, 'w-small', { fixed: true });
  }
  labels += L.place('NOSHAQ 7,492 m', nq[0] + 28, nq[1] - 4, 'w-peak', { fixed: true });
  labels += L.place('(highest in Afghanistan)', nq[0] + 30, nq[1] + 16, 'w-small', { fixed: true });
  for (const pl of PLACES) { const [x, y] = at(pl.at); labels += L.place(pl.name, x, y, pl.small ? 'w-small' : 'w-place'); }
  for (const ps of PASSES) { const [x, y] = at(ps.at); labels += L.place(ps.name, x, y + 4, 'w-small'); }
  { const [x, y] = at([73.35, 36.97]); labels += L.place('← road ends here!', x + 14, y + 44, 'w-note'); }
  { const [x, y] = at([74.484, 37.087]); labels += L.place('→ China', x + 12, y - 16, 'w-note'); }
  for (const lk of LAKES) { const [x, y] = at(lk.at); labels += L.place(lk.name, x, y, 'w-small'); }
  labels += L.place('Kyrgyz yurts', yx + 20, yy - 4, 'w-note');
  { const [x, y] = at([72.1, 36.6]); labels += L.place('valley floor ~3,000 m → 4,000 m+', x, y, 'w-note'); labels += L.place('(cold at night, even in summer)', x + 24, y + 26, 'w-note'); }
  { const [x, y] = at([72.55, 37.38]); labels += L.place('BIG PAMIR', x, y, 'w-region'); }
  { const [x, y] = at([73.45, 37.24]); labels += L.place('LITTLE PAMIR', x, y, 'w-region'); }
  { const [x, y] = at([72.95, 37.74]); labels += L.place('TAJIKISTAN', x, y, 'w-country'); }
  { const [x, y] = at([72.9, 36.4]); labels += L.place('PAKISTAN', x, y, 'w-country'); }
  { const [x, y] = at([73.75, 37.0]); labels += L.place('Wakhan River', x, y, 'w-river'); }
  { const [x, y] = at([71.8, 37.05]); labels += L.place('Panj', x, y, 'w-river'); }

  if (!framed) return { svg: `${terrain}${lines}${marks}${labels}`, geo, wakhanRiver };
  g += `<g clip-path="url(#wakhan-clip)">${terrain}${lines}${marks}${labels}</g>`;
  g += roughLine([[2, 2], [w - 2, 3], [w - 1, h - 2], [3, h - 1], [2, 2]], r, { tol: 1, w: 2, o: 0.8, amp: 1.2, strokeLen: [1, 1] });
  const km = geo.k / 111.32;
  g += roughLine([[w - 40 - 50 * km, h - 24], [w - 40, h - 24]], r, { tol: 1, w: 1.6, amp: 0.8, strokeLen: [9, 9] }) + `<text class="w-small" x="${(w - 50 - 50 * km).toFixed(0)}" y="${h - 32}">~50 km</text>`;
  return { svg: g, geo, wakhanRiver };
}
