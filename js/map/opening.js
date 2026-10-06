// Opening scene: the map is drawn in front of you, pass by pass.
// The finished whole-map drawing is split at build time into four "plates"
// (tiles/intro/*.webp: outline, water, relief, marks — same layer order as t0, so stacked
// they ARE the t0 drawing). Each plate is revealed through its own mask, and the mask is
// painted by a bristly brush that follows the real geometry (tiles/intro.json): the
// border is traced round, rivers run downstream, ridges get hatched along their length,
// hills and marks are dabbed in. After its strokes, a plate "settles" (the rest fades up),
// so nothing is ever left missing. Lettering is written by CSS (see index.html).
//
//   const op = createOpening({ map, frame, ll, guides, images })
//   op.play({ at, frozen })  → Promise that resolves when the drawing is complete
//   op.skip()                 → finish at once
//   op.canvas                 → remove it when the tiles are in place underneath

import { rng } from '../engine.js';
import { resample } from './pencil.js';

// seconds from the start of the drawing
export const SCHEDULE = {
  outline: { at: 0, settle: [1.55, 2.1] },
  water: { at: 1.15, settle: [2.25, 2.7] },
  relief: { at: 1.6, settle: [3.0, 3.5] },
  marks: { at: 2.9, settle: [3.75, 4.15] },
  end: 4.6,
};

export function createOpening({ map, frame, ll, guides, images }) {
  const r = rng('opening');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const s = 2 ** map.getZoom();                                      // css px per map px (whole-map view)
  const W = Math.min(3000, Math.round(frame.w * s * dpr)), H = Math.round((W * frame.h) / frame.w);
  const k = W / frame.w;                                             // canvas px per map px

  const canvas = document.createElement('canvas');
  canvas.className = 'opening-canvas';
  canvas.width = W; canvas.height = H;
  const origin = map.latLngToLayerPoint(ll(0, 0));
  Object.assign(canvas.style, { position: 'absolute', left: `${origin.x}px`, top: `${origin.y}px`, width: `${frame.w * s}px`, height: `${frame.h * s}px` });
  const pane = map.getPane('opening') || map.createPane('opening');
  pane.style.zIndex = 250; // over the tiles, under lettering and photos
  pane.appendChild(canvas);
  const out = canvas.getContext('2d');
  const tmp = Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d');

  // ---- brush strokes, in map px ----
  const strokes = [];
  const add = (plate, pts, { w, at, dur, bristles = 7 }) => {
    if (pts.length < 2) return;
    const p = resample(pts, 3);
    const nrm = p.map((_, i) => {
      const [ax, ay] = p[Math.max(0, i - 1)], [bx, by] = p[Math.min(p.length - 1, i + 1)], d = Math.hypot(bx - ax, by - ay) || 1;
      return [-(by - ay) / d, (bx - ax) / d];
    });
    // each bristle keeps its lane (with a slow wander), some carry less paint → streaks
    const lanes = Array.from({ length: bristles }, (_, b) => ({ off: ((b + 0.5) / bristles - 0.5) * w * (0.9 + r() * 0.2), ph: r() * 9, a: 0.55 + r() * 0.45, lw: (w / bristles) * (1.5 + r() * 0.8) }));
    strokes.push({ plate, p, nrm, lanes, w, at, dur, done: 0 });
  };
  // a scribble filling a small area: short zig-zag passes, like shading a patch
  const scribble = (cx, cy, rw, rh, passes = 4) => {
    const pts = [];
    for (let i = 0; i <= passes; i++) {
      const y = cy - rh / 2 + (rh * i) / passes + (r() - 0.5) * 6;
      const x0 = cx - rw / 2 + (r() - 0.5) * 12, x1 = cx + rw / 2 + (r() - 0.5) * 12;
      pts.push(...(i % 2 ? [[x1, y], [x0, y + rh / passes / 2]] : [[x0, y], [x1, y + rh / passes / 2]]));
    }
    return pts;
  };
  const len = (pts) => pts.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

  // 1 · outline: one pencil round the border, starting in the west (Herat side), with the
  //     graphite halo that hugs it — a wide brush
  for (const ring of guides.border) {
    const i0 = ring.reduce((b, p, i) => (p[0] < ring[b][0] ? i : b), 0);
    const loop = [...ring.slice(i0), ...ring.slice(0, i0 + 1)];
    add('outline', loop, { w: 120, at: SCHEDULE.outline.at, dur: 1.55, bristles: 9 });
  }
  // 2 · water: rivers traced one after another, quick
  guides.rivers.forEach((pts, i) => add('water', pts, { w: 30, at: SCHEDULE.water.at + i * 0.1, dur: Math.max(0.3, Math.min(0.8, len(pts) / 1500)), bristles: 5 }));
  // 3 · relief: ridges hatched along their length, then hills and desert patches dabbed
  guides.ridges.forEach((pts, i) => add('relief', pts, { w: 110, at: SCHEDULE.relief.at + i * 0.18, dur: 0.55, bristles: 8 }));
  guides.hills.forEach(([x, y], i) => add('relief', scribble(x, y - 12, 210, 70, 3), { w: 34, at: SCHEDULE.relief.at + 0.5 + i * 0.07, dur: 0.35, bristles: 5 }));
  guides.deserts.forEach(([x, y], i) => add('relief', scribble(x, y, 190, 130, 4), { w: 40, at: SCHEDULE.relief.at + 0.8 + i * 0.1, dur: 0.4, bristles: 5 }));
  // 4 · marks: places and landmarks dabbed west → east
  [...guides.marks].sort((a, b) => a[0] - b[0]).forEach(([x, y], i) => add('marks', scribble(x, y, 120, 90, 3), { w: 36, at: SCHEDULE.marks.at + i * 0.045, dur: 0.22, bristles: 5 }));

  // ---- one mask per plate (half resolution is plenty for a brush edge) ----
  const plates = guides.plates.map((name) => {
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(W / 2), height: Math.round(H / 2) });
    const g = c.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = '#000';
    return { name, img: images[name], mask: c, g, fill: 0, started: false };
  });
  const byName = Object.fromEntries(plates.map((p) => [p.name, p]));
  const mk = k / 2; // mask px per map px

  function paint(st, upto) {
    const { g } = byName[st.plate], a = st.done, b = Math.min(st.p.length - 1, upto);
    if (b <= a) return;
    for (const ln of st.lanes) {
      g.globalAlpha = ln.a;
      g.lineWidth = ln.lw * mk;
      g.beginPath();
      for (let i = Math.max(0, a - 1); i <= b; i++) {
        const wob = Math.sin(i * 0.05 + ln.ph) * st.w * 0.05;
        const x = (st.p[i][0] + st.nrm[i][0] * (ln.off + wob)) * mk, y = (st.p[i][1] + st.nrm[i][1] * (ln.off + wob)) * mk;
        i === Math.max(0, a - 1) ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    st.done = b;
  }

  const ease = (x) => 1 - (1 - x) ** 2; // a hand slows a little at the end of a line
  const clamp = (x) => Math.max(0, Math.min(1, x));

  function frameAt(t) {
    for (const st of strokes) {
      if (t < st.at) continue;
      byName[st.plate].started = true;
      paint(st, Math.round(ease(clamp((t - st.at) / st.dur)) * (st.p.length - 1)));
    }
    for (const pl of plates) {
      const [a, b] = SCHEDULE[pl.name].settle, f = clamp((t - a) / (b - a));
      if (f > pl.fill) {
        // raise the whole mask to at least f (source-over: a' = a + d(1-a))
        pl.g.globalAlpha = pl.fill >= 1 ? 1 : (f - pl.fill) / (1 - pl.fill);
        pl.g.fillRect(0, 0, pl.mask.width, pl.mask.height);
        pl.fill = f;
      }
    }
    out.clearRect(0, 0, W, H);
    for (const pl of plates) {
      if (!pl.started && pl.fill <= 0) continue;
      if (!(pl.img.complete && pl.img.naturalWidth)) continue; // still streaming in: its mask keeps growing, it appears when it lands
      if (pl.fill >= 1) { out.drawImage(pl.img, 0, 0, W, H); continue; }
      tmp.globalCompositeOperation = 'copy';
      tmp.drawImage(pl.mask, 0, 0, W, H);
      tmp.globalCompositeOperation = 'source-in';
      tmp.drawImage(pl.img, 0, 0, W, H);
      out.drawImage(tmp.canvas, 0, 0);
    }
  }

  let skipped = false;
  function play({ at = 0, frozen = false } = {}) {
    if (frozen) { frameAt(at); return new Promise(() => {}); } // held still for screenshots
    return new Promise((resolve) => {
      const t0 = performance.now() - at * 1000;
      const tick = (now) => {
        const t = skipped ? SCHEDULE.end : (now - t0) / 1000;
        frameAt(Math.min(t, SCHEDULE.end));
        if (t >= SCHEDULE.end) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  return { canvas, play, skip: () => { skipped = true; } };
}
