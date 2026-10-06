// Terrain relief as pencil hachures, from the elevation grid: short strokes running
// downhill, only on slopes turned away from the north-west light, darker where steep.
// Units are map px; sizes are chosen for how the layer looks at its reveal zoom.

import { brush, pointInRings } from './pencil.js';

export function hachures({ T, geo, data, r, box, spacing = 5, len = [1.6, 5.5], w = [0.35, 0.7], exclude = null }) {
  const inside = (lon, lat) => pointInRings(lon, lat, data.afghanistan);
  const d = 0.015;
  let s = '';
  for (let y = box[1]; y < box[3]; y += spacing) for (let x = box[0] + ((y / spacing) % 2 ? spacing / 2 : 0); x < box[2]; x += spacing) {
    const [lon, lat] = geo.fromMap([x + (r() - 0.5) * spacing * 0.4, y + (r() - 0.5) * spacing * 0.4]);
    if (exclude && exclude(lon, lat)) continue;
    // outside the elevation grid the slope is meaningless — stop at its edge
    const [b0, b1, b2, b3] = T.bounds;
    if (lon < b0 + 0.05 || lon > b2 - 0.05 || lat < b1 + 0.05 || lat > b3 - 0.05) continue;
    const inCountry = inside(lon, lat);
    if (!inCountry && r() < 0.8) continue; // neighbours' side: sparse
    const e = T.sample(lon, lat);
    const gx = (T.sample(lon + d, lat) - T.sample(lon - d, lat)) / (2 * d * 111000 * 0.8);
    const gy = (T.sample(lon, lat + d) - T.sample(lon, lat - d)) / (2 * d * 111000);
    const slope = Math.hypot(gx, gy);
    if (slope < 0.11) continue; // only genuinely steep ground gets marks
    const lit = (0.7 * gx - 0.7 * gy) / slope; // +1 = faces the north-west light
    if (lit > 0.3) continue;
    if (e > 5800 && lit > -0.2) continue; // snow stays white
    const l = Math.min(len[1], len[0] + slope * (len[1] - len[0]) * 2.2);
    const o = Math.min(0.75, 0.16 + (0.3 - lit) * 0.28 + slope * 0.5) * (inCountry ? 1 : 0.5);
    s += brush([[x, y], [x - (gx / slope) * l, y + (gy / slope) * l]], r, { w: w[0] + r() * (w[1] - w[0]), o, taperIn: 0.15, taperOut: 0.55 });
  }
  return s;
}
