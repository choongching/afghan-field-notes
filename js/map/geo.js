// The map's coordinate system. Everything drawn — and, later, every pin — goes
// through toMap(). The "drawn from memory" distortion is part of it on purpose:
// it is smooth, seeded and invertible, so pins are "wrong" exactly the way the
// drawing is, and fromMap() turns a click back into lon/lat.

import { rng } from '../engine.js';

export const FRAME = { w: 2000, h: 1300 };

// ---------- projection ----------
// Equirectangular with cos(34°) correction — plenty for one country, and it's what
// a sketcher's grid effectively is.
export function projection({ w = FRAME.w, h = FRAME.h, margin = 150, bounds = [60.4, 29.3, 75.1, 38.55] } = {}) {
  const [x0, y0, x1, y1] = bounds, c = Math.cos((34 * Math.PI) / 180);
  const k = Math.min((w - 2 * margin) / ((x1 - x0) * c), (h - 2 * margin) / (y1 - y0));
  const ox = (w - (x1 - x0) * c * k) / 2, oy = (h - (y1 - y0) * k) / 2;
  const p = ([lon, lat]) => [ox + (lon - x0) * c * k, oy + (y1 - lat) * k];
  p.inverse = ([x, y]) => [x0 + (x - ox) / (c * k), y1 - (y - oy) / k];
  p.k = k; p.c = c;
  return p;
}

// Drawn from memory: proportions drift, the page is tilted, and the part you
// actually travelled through gets drawn bigger than it is.
function drawnFromMemory(P0, frame, r, known = [68.5, 34.7]) {
  const ph = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const tilt = ((r() < 0.5 ? -1 : 1) * (1.5 + r() * 1.5) * Math.PI) / 180;
  const sx = 1.02 + r() * 0.04, sy = 0.95 + r() * 0.03;
  const [kx, ky] = P0(known); // e.g. Kabul–Bamiyan: the bit you know
  const cx = frame.w / 2, cy = frame.h / 2;
  const P = (ll) => {
    let [x, y] = P0(ll);
    const d2 = (x - kx) ** 2 + (y - ky) ** 2, mag = 1 + 0.16 * Math.exp(-d2 / (2 * 260 ** 2));
    x = kx + (x - kx) * mag; y = ky + (y - ky) * mag;
    x += 24 * Math.sin(x / 530 + ph[0]) * Math.cos(y / 610 + ph[1]) + 9 * Math.sin((x + y) / 290 + ph[2]);
    y += 20 * Math.cos(x / 470 + ph[3]) * Math.sin(y / 690 + ph[4]) + 8 * Math.sin((x - y) / 310 + ph[5]);
    const dx = (x - cx) * sx, dy = (y - cy) * sy;
    return [cx + dx * Math.cos(tilt) - dy * Math.sin(tilt), cy + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
  };
  P.k = P0.k; P.c = P0.c; P.inverse = null;
  return P;
}


// A complete coordinate system for one sheet (the main map, or a detail sheet).
//   toMap([lon, lat]) → [x, y]   fromMap([x, y]) → [lon, lat]
export function createGeo({ frame = FRAME, bounds, margin, seed = 'marco', flaws = true, known } = {}) {
  const P0 = projection({ w: frame.w, h: frame.h, margin, bounds });
  const toMap = flaws ? drawnFromMemory(P0, frame, rng(`${seed}|warp`), known) : P0;
  function fromMap([x, y]) {
    // the warp is a small, smooth displacement: fixed-point iteration converges fast
    let ll = P0.inverse([x, y]);
    if (!flaws) return ll;
    for (let i = 0; i < 12; i++) {
      const [mx, my] = toMap(ll), [px, py] = P0(ll);
      ll = P0.inverse([px + (x - mx), py + (y - my)]);
    }
    return ll;
  }
  return { toMap, fromMap, frame, k: P0.k };
}
