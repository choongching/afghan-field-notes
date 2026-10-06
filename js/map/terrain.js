// Real terrain for the sketch map: elevation grid (data/afg-elevation.json, built by
// tools/build-elevation.py from AWS Terrain Tiles) + the analysis the drawing needs.

export async function loadTerrain(url) {
  const j = await (await fetch(url)).json();
  return terrainFrom(j);
}

export function terrainFrom(j) {
  const bin = typeof atob === 'function' ? Uint8Array.from(atob(j.int16), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(j.int16, 'base64'));
  const z = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
  const [lon0, lat0, lon1, lat1] = j.bounds, { w, h, step } = j;

  const at = (i, k) => z[Math.max(0, Math.min(h - 1, k)) * w + Math.max(0, Math.min(w - 1, i))];
  // lon/lat ↔ grid (cell centres)
  const toGrid = (lon, lat) => [(lon - lon0) / step - 0.5, (lat1 - lat) / step - 0.5];
  const toLL = (gx, gy) => [lon0 + (gx + 0.5) * step, lat1 - (gy + 0.5) * step];

  function sample(lon, lat) {
    const [gx, gy] = toGrid(lon, lat), i = Math.floor(gx), k = Math.floor(gy), fx = gx - i, fy = gy - k;
    return at(i, k) * (1 - fx) * (1 - fy) + at(i + 1, k) * fx * (1 - fy) + at(i, k + 1) * (1 - fx) * fy + at(i + 1, k + 1) * fx * fy;
  }

  // Marching squares → polylines in lon/lat, optionally limited to a lon/lat box.
  function contours(level, box = [lon0, lat0, lon1, lat1]) {
    const [bx0, by0] = toGrid(box[0], box[3]), [bx1, by1] = toGrid(box[2], box[1]);
    const i0 = Math.max(0, Math.floor(bx0)), i1 = Math.min(w - 2, Math.ceil(bx1));
    const k0 = Math.max(0, Math.floor(by0)), k1 = Math.min(h - 2, Math.ceil(by1));
    const segs = [];
    const lerp = (a, b, va, vb) => a + ((level - va) / (vb - va || 1e-9)) * (b - a);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const a = at(i, k), b = at(i + 1, k), c = at(i + 1, k + 1), d = at(i, k + 1);
      const code = (a > level) << 3 | (b > level) << 2 | (c > level) << 1 | (d > level);
      if (code === 0 || code === 15) continue;
      const T = [lerp(i, i + 1, a, b), k], R = [i + 1, lerp(k, k + 1, b, c)], B = [lerp(i, i + 1, d, c), k + 1], L = [i, lerp(k, k + 1, a, d)];
      const E = { 1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]], 8: [[L, T]], 9: [[T, B]], 10: [[L, B], [T, R]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] }[code];
      for (const s of E) segs.push(s);
    }
    return link(segs).map((line) => line.map(([gx, gy]) => toLL(gx, gy)));
  }

  // hillshade value 0..1 for a light from azimuth/altitude (degrees)
  function shade(i, k, az = 315, alt = 45, zf = 1) {
    const dzdx = ((at(i + 1, k) - at(i - 1, k)) / (2 * step * 111000 * Math.cos(0.6))) * zf;
    const dzdy = ((at(i, k + 1) - at(i, k - 1)) / (2 * step * 111000)) * zf;
    const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
    const zen = ((90 - alt) * Math.PI) / 180, azr = ((360 - az + 90) * Math.PI) / 180;
    return Math.max(0, Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(azr - aspect));
  }

  // Peaks: cells that are the maximum in a (2r+1)² window and above minElev.
  function peaks({ radius = 8, minElev = 4500, box = [lon0, lat0, lon1, lat1] } = {}) {
    const out = [];
    const [bx0, by0] = toGrid(box[0], box[3]), [bx1, by1] = toGrid(box[2], box[1]);
    for (let k = Math.max(radius, Math.floor(by0)); k < Math.min(h - radius, by1); k++) for (let i = Math.max(radius, Math.floor(bx0)); i < Math.min(w - radius, bx1); i++) {
      const v = at(i, k);
      if (v < minElev) continue;
      let top = true;
      for (let dk = -radius; dk <= radius && top; dk++) for (let di = -radius; di <= radius; di++) if (at(i + di, k + dk) > v) { top = false; break; }
      if (top) out.push({ at: toLL(i, k), elev: v });
    }
    return out.sort((a, b) => b.elev - a.elev);
  }

  function profile(a, b, n = 200) {
    return Array.from({ length: n }, (_, t) => { const u = t / (n - 1); const lon = a[0] + (b[0] - a[0]) * u, lat = a[1] + (b[1] - a[1]) * u; return { u, lon, lat, elev: sample(lon, lat) }; });
  }

  return { w, h, step, bounds: j.bounds, min: j.min, max: j.max, at, sample, contours, shade, peaks, profile, toGrid, toLL };
}

// join marching-squares segments into polylines
function link(segs) {
  const key = ([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const ends = new Map();
  const add = (k, s) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(s); };
  segs.forEach((s, idx) => { s.id = idx; add(key(s[0]), s); add(key(s[1]), s); });
  const used = new Set(), lines = [];
  for (const s of segs) {
    if (used.has(s.id)) continue;
    used.add(s.id);
    const line = [s[0], s[1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) || []).find((t) => !used.has(t.id));
        if (!next) break;
        used.add(next.id);
        const far = key(next[0]) === key(tip) ? next[1] : next[0];
        if (dir) line.push(far); else line.unshift(far);
      }
    }
    lines.push(line);
  }
  return lines;
}
