// Pencil primitives: how a hand puts graphite on paper. Shared by the main map
// and the detail sheets so every sheet is drawn by the same hand.

// ---------- hand-drawn line primitives ----------
export function noise1(r) {
  // smooth 1D value noise, seeded
  const v = Array.from({ length: 64 }, () => r() * 2 - 1);
  return (t) => { const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f); return v[i & 63] * (1 - s) + v[(i + 1) & 63] * s; };
}

export function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay);
    let t = step - carry;
    while (t < d) { out.push([ax + ((bx - ax) * t) / d, ay + ((by - ay) * t) / d]); t += step; }
    carry = d - (t - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// wrist wobble: displace along the normal by low-frequency noise
export function wobble(pts, r, amp = 1.2, freq = 0.06) {
  const n = noise1(r), off = r() * 50;
  return pts.map(([x, y], i) => {
    const [px, py] = pts[Math.max(0, i - 1)], [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = nx - px, dy = ny - py, len = Math.hypot(dx, dy) || 1;
    const o = n(off + i * freq * 6) * amp;
    return [x - (dy / len) * o, y + (dx / len) * o];
  });
}

// Catmull-Rom → cubic Bézier
export function smooth(pts, closed = false) {
  if (pts.length < 3) return `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}`;
  const P = (i) => pts[closed ? (i + pts.length) % pts.length : Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M${P(0)[0].toFixed(1)} ${P(0)[1].toFixed(1)}`;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? d + 'Z' : d;
}

// A line the way a hand draws it: one confident pass + a lighter re-trace.
export function handLine(pts, r, { w = 1.3, o = 0.85, passes = 2, amp = 1.1, step = 7, closed = false, dash = '', cls = '' } = {}) {
  const base = resample(pts, step);
  let s = '';
  for (let p = 0; p < passes; p++) {
    const d = smooth(wobble(base, r, amp * (p ? 1.4 : 1)), closed);
    s += `<path class="${cls}" d="${d}" fill="none" stroke="var(--ink)" stroke-width="${(w * (p ? 0.7 : 1)).toFixed(2)}" stroke-opacity="${(o * (p ? 0.45 : 1)).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  }
  return s;
}

export function offsetLine(pts, dist) {
  return pts.map(([x, y], i) => {
    const [px, py] = pts[Math.max(0, i - 1)], [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = nx - px, dy = ny - py, len = Math.hypot(dx, dy) || 1;
    return [x - (dy / len) * dist, y + (dx / len) * dist];
  });
}

// ---------- geometry helpers ----------
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
export const boundsOf = (rings) => rings.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

// dart-throwing Poisson-ish sampling inside rings
export function scatter(rings, spacing, r, frame, tries = 4000) {
  const [x0, y0, x1, y1] = boundsOf(rings), pts = [];
  for (let t = 0; t < tries; t++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    if (x < 0 || y < 0 || x > frame.w || y > frame.h) continue;
    if (!pointInRings(x, y, rings)) continue;
    if (pts.some(([px, py]) => (px - x) ** 2 + ((py - y) * 1.5) ** 2 < spacing * spacing)) continue;
    pts.push([x, y]);
  }
  return pts;
}

// ---------- rough sketching ----------
// Ramer–Douglas–Peucker in screen px: a hand doesn't follow every wiggle.
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy); // 0 for a closed ring
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = n < 1e-6 ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / n;
    if (d > max) { max = d; idx = i; }
  }
  return max > tol ? [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)] : [a, b];
}

// ---------- pencil strokes with pressure ----------
// Each stroke is a filled outline, not a constant-width line: it tapers where the
// pencil lands and lifts, swells and thins with pressure along the way.
export function brush(pts, r, { w = 1.6, o = 0.8, taperIn = 0.12, taperOut = 0.2, color = 'var(--ink)' } = {}) {
  const c = resample(pts, 3);
  if (c.length < 2) return '';
  const n = noise1(r), off = r() * 40, bumpy = 0.35 + r() * 0.5;
  const L = [], R = [];
  c.forEach(([x, y], i) => {
    const t = i / (c.length - 1);
    const [px, py] = c[Math.max(0, i - 1)], [nx, ny] = c[Math.min(c.length - 1, i + 1)];
    const dx = nx - px, dy = ny - py, len = Math.hypot(dx, dy) || 1;
    const taper = Math.min(1, t / taperIn, (1 - t) / taperOut) ** 0.7;
    const pressure = 1 + n(off + i * 0.09) * bumpy;
    const hw = Math.max(0.12, (w / 2) * taper * pressure);
    L.push([x - (dy / len) * hw, y + (dx / len) * hw]);
    R.push([x + (dy / len) * hw, y - (dx / len) * hw]);
  });
  const d = smooth([...L, ...R.reverse()], true);
  let blob = '';
  if (FX.on) {
    // graphite builds up where the pencil paused before moving
    if (w > 1.4 && r() < 0.16) blob = `<circle cx="${c[0][0].toFixed(1)}" cy="${c[0][1].toFixed(1)}" r="${(w * (0.45 + r() * 0.3)).toFixed(2)}" fill="var(--ink)" fill-opacity="${(o * 0.8).toFixed(2)}"/>`;
    // a right hand dragging across heavy strokes smears them down-right
    if (w > 1.6 && o > 0.6 && r() < 0.14) FX.smudge(d);
  }
  return `<path d="${d}" fill="${color}" fill-opacity="${o.toFixed(2)}"/>${blob}`;
}

// Flaw state for the current drawing (set in drawMap).
export const FX = {
  on: false, cur: 'base', smudges: [], tones: [],
  // shading is recorded per layer so each zoom tier can carry its own
  // xform: set while a layer is drawn in its own (scaled) coordinates, so its
  // shading lands where its strokes do
  xform: '',
  tone(d) { this.tones.push({ layer: this.cur, d, xform: this.xform }); },
  smudge(d) { this.smudges.push({ layer: this.cur, d, xform: this.xform }); },
};

// Every stroke gets its own character: speed, pressure, darkness, re-traces.
export function character(r, base) {
  const fast = r() < 0.45;
  return {
    w: base.w * (fast ? 0.55 + r() * 0.4 : 0.85 + r() * 0.75),
    o: base.o * (fast ? 0.45 + r() * 0.3 : 0.7 + r() * 0.3),
    amp: base.amp * (fast ? 0.3 + r() * 0.5 : 0.9 + r() * 1.3),
    passes: r() < 0.55 ? 1 : r() < 0.75 ? 2 : 3,
  };
}

export const ext = (p, q, k) => { const dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * k, p[1] + (dy / l) * k]; };

export function dashes(pts, on, gap, r) {
  const c = resample(pts, 2), out = [];
  let i = 0;
  while (i < c.length - 1) {
    const a = Math.round((on * (0.6 + r() * 0.8)) / 2), g = Math.round((gap * (0.7 + r() * 0.6)) / 2);
    if (i + a < c.length) out.push(c.slice(i, i + a + 1));
    i += a + g;
  }
  return out;
}

// A long line drawn the way a hand does it: in several strokes of varying length,
// each overshooting a little, sometimes leaving a gap, sometimes re-traced.
export function roughLine(pts, r, { tol = 9, w = 1.5, o = 0.8, amp = 2.4, strokeLen = [2, 7], dash = null, steady = false } = {}) {
  const simple = simplify(pts, tol);
  let s = '', i = 0;
  while (i < simple.length - 1) {
    const n = strokeLen[0] + Math.floor(r() * (strokeLen[1] - strokeLen[0] + 1));
    let seg = simple.slice(i, Math.min(simple.length, i + n + 1));
    i += n;
    if (seg.length < 2) break;
    seg = [ext(seg[0], seg[1], r() * 8), ...seg.slice(1, -1), ext(seg[seg.length - 1], seg[seg.length - 2], 1 + r() * 9)];
    if (!steady && simple.length > 6 && r() < 0.1) continue; // pen lifted: leave a gap
    const ch = character(r, { w, o, amp });
    if (steady) { ch.w = Math.max(ch.w, w * 0.85); ch.o = Math.max(ch.o, o * 0.85); ch.amp = Math.min(ch.amp, amp); }
    for (let p = 0; p < ch.passes; p++) {
      // re-traces drift off the first line and are lighter
      const line = wobble(resample(seg, 10), r, ch.amp * (p ? 1.8 : 1), 0.06 + r() * 0.06);
      const pw = ch.w * (p ? 0.5 + r() * 0.3 : 1), po = ch.o * (p ? 0.35 + r() * 0.25 : 1);
      if (dash) for (const d of dashes(line, dash[0], dash[1], r)) s += brush(d, r, { w: pw, o: po, taperIn: 0.3, taperOut: 0.3 });
      else s += brush(line, r, { w: pw, o: po });
    }
    // now and then a short correction stroke hugging the line
    if (!dash && r() < 0.12) {
      const k = Math.floor(r() * (seg.length - 1));
      const a = seg[k], b = seg[k + 1] || seg[k];
      s += brush(wobble(resample([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (r() - 0.5) * 4]], 6), r, 1.5), r, { w: w * 0.6, o: o * 0.5 });
    }
  }
  return s;
}

// Mountain: one or two quick strokes for the Λ, a random amount of shading.
// Some are careful, some dashed off; some apexes don't quite meet.
export function peak(x, y, h, r, o = 0.8) {
  const w = h * (1.0 + r() * 0.8), ax = x + (r() - 0.5) * w * 0.35, ay = y - h * (0.85 + r() * 0.3);
  const ch = character(r, { w: 2.4, o: Math.min(1, o * 1.15), amp: 1 });
  ch.w = Math.min(ch.w, 2.6); // a peak is a quick mark — never a heavy blob
  const left = [[x - w / 2, y + (r() - 0.5) * 3], [x - w / 4 + (r() - 0.5) * 4, y - h / 2 + (r() - 0.5) * 4], [ax, ay]];
  const right = [[ax + r() * 2.5, ay + r() * 3], [x + w / 4 + (r() - 0.5) * 4, y - h / 2 + (r() - 0.5) * 4], [x + w / 2, y + (r() - 0.5) * 4]];
  let s;
  if (r() < 0.35) s = brush(wobble(resample([...left, ...right.slice(1)], 4), r, ch.amp), r, { w: ch.w, o: ch.o }); // one stroke
  else s = brush(wobble(resample(left, 4), r, ch.amp), r, { w: ch.w, o: ch.o }) + brush(wobble(resample(right, 4), r, ch.amp), r, { w: ch.w * (0.7 + r() * 0.4), o: ch.o * (0.7 + r() * 0.4) });
  const rx = x + w / 2;
  // shadow face: a cluster of short parallel hatch strokes (count varies a lot)
  const shade = 2 + Math.floor(r() * r() * 8);
  const slant = -(0.18 + r() * 0.2);
  for (let i = 0; i < shade; i++) {
    const t = 0.12 + (i / shade) * 0.8 + (r() - 0.5) * 0.06, sx = ax + (rx - ax) * t, sy = ay + (y - ay) * t;
    const len = (y - sy) * (0.45 + r() * 0.5);
    s += brush([[sx - 1, sy + 1.5], [sx - 1 + len * slant, sy + len]], r, { w: 0.9 + r() * 0.7, o: o * (0.3 + r() * 0.4), taperIn: 0.1, taperOut: 0.55 });
  }
  // stipple trailing down the slope and off the foot of the shadow side
  const dots = Math.floor(r() * 14);
  for (let i = 0; i < dots; i++) {
    const t = 0.3 + r() * 0.8, u = r();
    const dx = ax + (rx + 6 - ax) * t - u * w * 0.35, dy = ay + (y + 5 - ay) * t + (r() - 0.3) * 4;
    s += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${(0.5 + r() * 0.7).toFixed(2)}" fill="var(--ink)" fill-opacity="${(o * (0.35 + r() * 0.4)).toFixed(2)}"/>`;
  }
  // soft carbon tone rubbed into the shadow face
  if (r() < 0.8) FX.tone(`M${ax.toFixed(1)} ${(ay + 2).toFixed(1)} L${(rx + 4).toFixed(1)} ${(y + 2).toFixed(1)} L${(ax + (rx - ax) * 0.15 - w * 0.12).toFixed(1)} ${(y + 3).toFixed(1)} Z`);
  return s;
}

// Hand lettering: a font is too regular, so every glyph gets its own small
// rotation, baseline drift and spacing — the letters of a hand, not a typeface.
export function handLettering(svg, r) {
  return svg.replace(/<text([^>]*)>([^<]+)<\/text>/g, (m, attrs, txt) => {
    const chars = [...txt];
    if (FX.on && attrs.includes('t-squeeze')) {
      // started big, ran out of space: each letter smaller and tighter than the last
      return `<text${attrs}>${chars.map((ch, i) => { const f = 1 - (i / chars.length) ** 1.6 * 0.45; return `<tspan font-size="${(34 * f).toFixed(1)}" dy="${((r() - 0.5) * 3).toFixed(1)}" rotate="${((r() - 0.5) * 9).toFixed(1)}">${ch}</tspan>`; }).join('')}</text>`;
    }
    let drift = 0;
    const rot = chars.map(() => ((r() - 0.5) * 9).toFixed(1)).join(' ');
    const dy = chars.map((_, i) => { const target = Math.sin(i * 0.5 + r()) * 2.6; const d = target - drift; drift = target; return d.toFixed(2); }).join(' ');
    const dx = chars.map((_, i) => (i ? (r() - 0.45) * 2.6 : 0).toFixed(2)).join(' ');
    return `<text${attrs} rotate="${rot}" dx="${dx}" dy="${dy}">${txt}</text>`;
  });
}

export const S = (pts, r, o = {}) => brush(wobble(resample(pts, 4), r, o.amp ?? 0.8), r, { w: o.w ?? 1.5, o: o.o ?? 0.8, taperIn: 0.08, taperOut: 0.2, color: o.color });
export const dot = (x, y, r, o = 0.5) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.5 + r() * 0.6).toFixed(2)}" fill="var(--ink)" fill-opacity="${(o * (0.6 + r() * 0.6)).toFixed(2)}"/>`;

// flicks: the quick short tick marks that shade a pencil landscape
export function flicks(x0, y0, x1, y1, n, r, { ang = -1.1, len = [3, 8], o = 0.45, inside = () => true } = {}) {
  let s = '';
  for (let i = 0, t = 0; i < n && t < n * 6; t++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    if (!inside(x, y)) continue;
    i++;
    const l = len[0] + r() * (len[1] - len[0]), a = ang + (r() - 0.5) * 0.6;
    s += brush([[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], r, { w: 0.8 + r() * 0.6, o: o * (0.5 + r() * 0.7), taperIn: 0.2, taperOut: 0.5 });
  }
  return s;
}

