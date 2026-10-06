// A traveller's hand-drawn map of Afghanistan, generated as SVG from real geography
// (data/afghanistan.json, Natural Earth) but drawn the way someone on the road would:
// wobbly re-traced lines, pictorial mountains, stippled deserts, lettered by hand.

import { rng } from '../engine.js';
// wakhan.js also holds the corridor's close-up detail, revealed later by zooming in
import { WAKHAN_BOX, valleyLine, drawWakhanSheet } from './wakhan.js';
import { hachures } from './relief.js';
import { FRAME, projection, createGeo } from './geo.js';
import { noise1, resample, wobble, smooth, handLine, offsetLine, pointInRings, boundsOf, scatter, simplify, brush, FX, character, ext, dashes, roughLine, peak, handLettering, S, dot, flicks } from './pencil.js';

export { FRAME, projection, createGeo };


// A place: an X like the field sketch, a small circle for the capital.
function place(x, y, big, r) {
  // a mark, not a shout: small and light (a place with a photo stop gets a diamond marker instead — see `stops`)
  const k = big ? 6 : 3.6, j = () => (r() - 0.5) * 1.2;
  if (big) return `<path d="M${x + 6} ${y} a6 5.5 ${(r() * 40).toFixed(0)} 1 0 -1 2.6" fill="none" stroke="var(--ink)" stroke-width="1.2" stroke-opacity=".7" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="1.3" fill="var(--ink)" fill-opacity=".7"/>`;
  return brush([[x - k + j(), y - k + j()], [x + k + j(), y + k + j()]], r, { w: 1.2 + r() * 0.5, o: 0.55 + r() * 0.2, taperIn: 0.15, taperOut: 0.4 })
    + brush([[x + k + j(), y - k + j()], [x - k + j(), y + k + j()]], r, { w: 1 + r() * 0.5, o: 0.5 + r() * 0.2, taperIn: 0.15, taperOut: 0.4 });
}

// Main mountain chains only (lon, lat), hand-traced and approximate by design.
const RIDGES = [
  { h: [22, 34], pts: [[67.9, 34.85], [68.6, 35.1], [69.4, 35.45], [70.3, 35.75], [71.1, 36.1], [71.5, 36.4]] }, // Hindu Kush (the Wakhan's peaks come from terrain data)
  { h: [18, 28], pts: [[65.2, 34.4], [66.2, 34.45], [67.2, 34.6]] },                                                                 // Koh-i-Baba
  { h: [13, 20], step: 58, foothills: 1, pts: [[63.2, 35.0], [64.4, 35.25], [65.6, 35.4]] }, // sparser: the Herat side got crowded                                                                 // Band-i-Turkestan
  { h: [13, 19], pts: [[69.4, 34.1], [70.3, 34.08]] },                                                                                // Spin Ghar
];

// Named passes (research/afghanistan-topography.md); Khyber approximate.
const PASSES = [['Salang Pass 3,878 m', 69.04, 35.31], ['Shibar Pass', 68.26, 34.91], ['Anjuman Pass 4,430 m', 70.01, 36.02], ['Khyber Pass', 71.1, 34.08]];

const LABEL_LEFT = new Set(['Bamiyan']);

// Neighbouring countries (lon, lat, rotation) — placed just outside the border, in the shading.
const NEIGHBOURS = [
  ['IRAN', 59.9, 32.4, -78], ['TURKMENISTAN', 62.6, 37.35, -12], ['UZBEKISTAN', 66.6, 37.85, 0],
  ['TAJIKISTAN', 69.6, 38.05, 0], ['CHINA', 75.35, 36.9, -80], ['PAKISTAN', 69.2, 30.7, -38],
];

const PLACES = [
  ['Kabul', 69.18, 34.53, true], ['Herat', 62.2, 34.35], ['Mazar-i Sharif', 67.11, 36.71], ['Kandahar', 65.71, 31.61],
  ['Bamiyan', 67.83, 34.82], ['Band-e Amir', 67.2, 34.84, false, 'lake'], ['Jalalabad', 70.45, 34.43], ['Faizabad', 70.58, 37.12],
];

// ---------- sketched hills & landmarks ----------
// rolling hills: overlapping silhouettes, shading denser just under each ridge line
function hillCluster(cx, cy, r, { n = 3, width = 170, height = 34 } = {}) {
  // Rolling hills: lopsided silhouettes (one side steeper), a ground line trailing off each end, and a few
  // slanted hatch strokes down the shadow side — not symmetric arcs with tick marks (those read as eyebrows).
  let s = '';
  for (let k = 0; k < n; k++) {
    const w = width * (0.6 + r() * 0.6), h = height * (0.55 + r() * 0.6);
    const x0 = cx + (r() - 0.5) * width * 0.8 - w / 2, y = cy + k * height * 0.45 + (r() - 0.5) * 8;
    const skew = 0.65 + r() * 0.75; // <1: steep on the right; >1: steep on the left
    const prof = (t) => Math.sin(Math.PI * t ** skew) ** 1.25;
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([x0 + t * w, y - prof(t) * h + Math.sin(t * 11 + k) * h * 0.04]); }
    const topT = pts.reduce((m, p, i) => (p[1] < pts[m][1] ? i : m), 0) / 14;
    s += `<path d="${smooth(pts)} L${x0 + w} ${y + 2} L${x0} ${y + 2} Z" fill="var(--paper)"/>`; // nearer hills cover farther ones
    s += S(pts, r, { w: 1.2 + r() * 0.5, o: 0.72, amp: 1.1 });
    // the ground runs on a little past each foot, then the pencil lifts
    s += brush([[x0 - 6 - r() * 10, y + 1], [x0 + 3, y + 0.5]], r, { w: 0.8, o: 0.4, taperIn: 0.5, taperOut: 0.1 });
    s += brush([[x0 + w - 3, y + 0.5], [x0 + w + 6 + r() * 12, y + 1.2]], r, { w: 0.8, o: 0.4, taperIn: 0.1, taperOut: 0.5 });
    // shadow side (right of the top): short strokes leaning with the slope, longest near the top
    const nH = 3 + Math.floor(r() * 5);
    for (let i = 0; i < nH; i++) {
      const t = topT + 0.04 + (i / nH) * (0.92 - topT), sx = x0 + t * w, sy = y - prof(t) * h + 1.6;
      const len = (y - sy) * (0.35 + r() * 0.45);
      if (len < 2) continue;
      s += brush([[sx, sy], [sx + len * 0.35, sy + len]], r, { w: 0.6 + r() * 0.4, o: 0.3 + r() * 0.25, taperIn: 0.1, taperOut: 0.6 });
    }
    if (r() < 0.35) FX.tone(`M${x0 + w * topT} ${y - h * 0.85} Q${x0 + w * (topT + 0.25)} ${y - h * 0.45} ${x0 + w * 0.97} ${y} L${x0 + w * (topT + 0.05)} ${y} Z`);
  }
  return s;
}

// Buddha niches of Bamiyan: a long cliff face, two tall empty arches
function bamiyan(x, y, r) {
  // The Bamiyan cliff, north side of the valley: an eroded sandstone wall, the two empty niches (west ~55 m,
  // east ~38 m), monks' caves between them, and poplars on the valley floor. y = foot of the cliff.
  const W = 38, f = (p) => p.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(' L');
  const top = Array.from({ length: 15 }, (_, i) => { const t = i / 14; return [x - W + t * 2 * W, y - 29 - Math.sin(t * Math.PI) * 3 + (r() - 0.5) * 5]; });
  let s = `<path d="M${x - W - 14} ${y} L${f(top)} L${x + W + 15} ${y} Z" fill="var(--paper)"/>`; // hides what's behind
  s += S(top, r, { w: 1.6 });
  s += S([[x - W, top[0][1]], [x - W - 7, y - 13], [x - W - 14, y]], r, { w: 1.3, o: 0.8 }) + S([[x + W, top[14][1]], [x + W + 8, y - 11], [x + W + 15, y]], r, { w: 1.3, o: 0.8 });
  for (let i = 0; i < 24; i++) { // weathering: short vertical runnels hanging from the rim
    const xx = x - W + 3 + r() * (2 * W - 6), t = y - 27 + (r() - 0.5) * 4;
    s += brush([[xx, t], [xx + (r() - 0.5) * 2, t + 5 + r() * 15]], r, { w: 0.6 + r() * 0.4, o: 0.18 + r() * 0.3, taperIn: 0.1, taperOut: 0.6 });
  }
  for (const [nx, nh, nw] of [[x - 19, 24, 9.5], [x + 19, 17, 6.5]]) {
    const arch = `M${nx - nw / 2} ${y} V${y - nh + nw / 2} A${nw / 2} ${nw / 2} 0 0 1 ${nx + nw / 2} ${y - nh + nw / 2} V${y} Z`;
    s += `<path d="${arch}" fill="var(--paper)"/>`;
    s += S([[nx - nw / 2, y], [nx - nw / 2, y - nh + nw / 2], [nx - nw / 3, y - nh + 1.5], [nx, y - nh], [nx + nw / 3, y - nh + 1.5], [nx + nw / 2, y - nh + nw / 2], [nx + nw / 2, y]], r, { w: 1.5, o: 0.9 });
    for (let k = 0; k < 7; k++) { const xx = nx - nw / 2 + 1.5 + (k / 6) * (nw - 3); s += brush([[xx, y - nh * 0.8], [xx, y - 0.5]], r, { w: 0.8, o: 0.4 + r() * 0.3 }); } // the empty dark
    FX.tone(arch);
  }
  for (const [cx, cy] of [[-7, -15], [-3, -21], [2, -12], [7, -19], [10, -8], [30, -15], [-31, -11], [-28, -20], [0, -6]]) { // monks' caves
    const ax = x + cx + (r() - 0.5) * 2, ay = y + cy;
    s += S([[ax - 1.6, ay + 1.6], [ax - 1.4, ay - 0.8], [ax, ay - 1.8], [ax + 1.4, ay - 0.8], [ax + 1.6, ay + 1.6]], r, { w: 0.9, o: 0.7 });
  }
  s += S([[x - W - 22, y + 1], [x - 10, y + 2], [x + W + 24, y + 0.5]], r, { w: 1.1, o: 0.6 }); // valley floor
  for (const px of [-30, -23, -5, 5, 26, 32]) { // poplars along the fields
    const bx = x + px + (r() - 0.5) * 3, by = y + 7, h = 11 + r() * 5;
    s += `<path d="M${bx} ${by} L${bx - 2.3} ${by - h * 0.45} L${bx} ${by - h} L${bx + 2.3} ${by - h * 0.45} Z" fill="var(--paper)"/>`;
    s += S([[bx, by + 1], [bx - 2.2, by - h * 0.45], [bx, by - h], [bx + 2.2, by - h * 0.45], [bx, by + 1]], r, { w: 0.9, o: 0.75 });
    s += brush([[bx - 0.6, by - h * 0.75], [bx + 0.8, by - h * 0.3]], r, { w: 0.6, o: 0.4 });
  }
  for (let k = 0; k < 3; k++) s += brush([[x - 24 + k * 20, y + 11 + k], [x - 7 + k * 20, y + 11.5 + k]], r, { w: 0.6, o: 0.3 }); // field edges
  return s;
}

// Kabul: a city in a mountain bowl — flat-roofed houses stacked up a ridge (like Sher Darwaza / Asmai),
// with the old Bala Hissar wall and a couple of towers snaking along the crest. y = foot of the hill.
function kabul(x, y, r) {
  const ridge = [[-35, 0], [-25, -13], [-13, -26], [-5, -30], [5, -24], [13, -26], [23, -15], [33, 0]].map(([a, b]) => [x + a, y + b + (r() - 0.5) * 2]);
  const crest = (xx) => { for (let i = 1; i < ridge.length; i++) if (xx <= ridge[i][0]) { const [a0, b0] = ridge[i - 1], [a1, b1] = ridge[i]; return b0 + ((xx - a0) / (a1 - a0)) * (b1 - b0); } return y; };
  let s = `<path d="M${ridge.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(' L')} Z" fill="var(--paper)"/>`;
  s += S(ridge, r, { w: 1.5, o: 0.85 });
  // the old wall riding the crest, crenellated, with two squat towers
  const wall = []; for (let xx = x - 24; xx <= x + 22; xx += 2.4) wall.push([xx, crest(xx) + 3.2]);
  s += brush(wall, r, { w: 1.1, o: 0.75 });
  for (let i = 0; i < wall.length - 1; i += 2) { const [a, b] = wall[i]; s += brush([[a, b], [a, b - 1.6]], r, { w: 0.8, o: 0.65 }); }
  for (const tx of [x - 12, x + 12]) { const ty = crest(tx) + 3.6; s += `<path d="M${tx - 2.2} ${ty} V${ty - 5} H${tx + 2.2} V${ty} Z" fill="var(--paper)"/>` + S([[tx - 2.2, ty], [tx - 2.2, ty - 5], [tx + 2.2, ty - 5], [tx + 2.2, ty]], r, { w: 0.9, o: 0.8 }); }
  // houses: little flat-roofed boxes in rough terraces up the slope, back rows first so front ones overlap
  const houses = [];
  for (let row = 0; row < 6; row++) {
    const yy = y - 2.5 - row * 3.6;
    for (let xx = x - 31 + r() * 3; xx < x + 29; xx += 4.4 + r() * 2) {
      if (yy - 4 < crest(xx) + 6 || r() < 0.18) continue; // stay below the wall; leave gaps
      houses.push([xx, yy + (r() - 0.5) * 1.2, 3.4 + r() * 1.6, 2.6 + r() * 1.2]);
    }
  }
  houses.sort((a, b) => a[1] - b[1]);
  for (const [hx, hy, w, h] of houses) {
    s += `<rect x="${hx.toFixed(1)}" y="${(hy - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--paper)"/>`;
    // square corners and a flat roof (S() would round them into arches); a slight hand-wobble per corner
    const j = () => (r() - 0.5) * 0.4;
    s += `<path d="M${(hx + j()).toFixed(1)} ${hy.toFixed(1)} L${(hx + j()).toFixed(1)} ${(hy - h).toFixed(1)} L${(hx + w + j()).toFixed(1)} ${(hy - h + j()).toFixed(1)} L${(hx + w + j()).toFixed(1)} ${hy.toFixed(1)}" fill="none" stroke="var(--ink)" stroke-width=".75" stroke-opacity=".72" stroke-linejoin="miter" stroke-linecap="round"/>`;
    s += brush([[hx - 0.4, hy - h], [hx + w + 0.5, hy - h + j()]], r, { w: 0.9, o: 0.7 }); // the roof line, pressed a bit harder
    if (r() < 0.7) s += `<rect x="${(hx + w * (0.25 + r() * 0.4)).toFixed(1)}" y="${(hy - h * 0.65).toFixed(1)}" width=".9" height="1.1" fill="var(--ink)" fill-opacity=".55"/>`; // a window
  }
  s += S([[x - 40, y + 1], [x + 38, y + 0.5]], r, { w: 1, o: 0.55 }); // the valley floor
  return s;
}

// Minaret of Jam: the 65 m brick tower in a narrow gorge where the Jam river meets the Hari Rud. Octagonal
// plinth, tapering shaft with bands (geometric brick panels, a Kufic inscription band), a balcony ledge and
// a small open lantern; steep valley walls either side and the river at its foot. y = foot of the tower.
function jam(x, y, r) {
  const H = 64, b0 = 6.5, b1 = 3.6;                      // height, half-width at foot and at the top of the shaft
  const hw = (t) => b0 + (b1 - b0) * t, Y = (t) => y - t * H;  // t: 0 at the foot → 1 at the top of the shaft
  let s = '';
  // the gorge: two steep walls leaning in, paper-filled so the tower stands in front of them
  for (const m of [-1, 1]) {
    const wall = [[x + m * 58, y + 6], [x + m * 40, y - 20], [x + m * 30, y - 34 - r() * 6], [x + m * 22, y - 22], [x + m * 13, y + 4]];
    s += `<path d="M${wall.map(([a, c]) => `${a.toFixed(1)} ${c.toFixed(1)}`).join(' L')} Z" fill="var(--paper)"/>`;
    s += S(wall.slice(0, 4), r, { w: 1.5, o: 0.85 }) + S(wall.slice(3), r, { w: 1.1, o: 0.6 });
    for (let k = 0; k < 7; k++) { const t = 0.15 + r() * 0.7, ax = x + m * (52 - t * 26), ay = y + 2 - t * 30; s += brush([[ax, ay], [ax - m * (3 + r() * 3), ay + 6 + r() * 5]], r, { w: 0.6, o: 0.3 + r() * 0.2 }); } // scree
  }
  // the tower body
  const outline = [[x - b0 - 2, y], [x - b0, Y(0.04)], [x - hw(1), Y(1)], [x + hw(1), Y(1)], [x + b0, Y(0.04)], [x + b0 + 2, y]];
  s += `<path d="M${outline.map(([a, c]) => `${a.toFixed(1)} ${c.toFixed(1)}`).join(' L')} Z" fill="var(--paper)"/>`;
  s += S([[x - b0 - 2, y], [x - b0, Y(0.04)], [x - hw(0.5), Y(0.5)], [x - hw(1), Y(1)]], r, { w: 1.5 }) + S([[x + b0 + 2, y], [x + b0, Y(0.04)], [x + hw(0.5), Y(0.5)], [x + hw(1), Y(1)]], r, { w: 1.3 });
  s += S([[x - b0 - 2, y], [x + b0 + 2, y]], r, { w: 1.2, o: 0.8 }) + S([[x - b0, Y(0.04)], [x + b0, Y(0.04)]], r, { w: 0.9, o: 0.6 }); // octagonal plinth
  // bands: slightly curved, so it reads as round
  const band = (t, o = 0.65, w = 0.9) => { const h = hw(t); return S([[x - h, Y(t)], [x, Y(t) + 1.1], [x + h, Y(t)]], r, { w, o }); };
  for (const t of [0.3, 0.55, 0.62, 0.86]) s += band(t);
  // brick panels on the lower shaft: a loose lattice
  for (let k = 0; k < 6; k++) { const t0 = 0.07 + k * 0.035, h = hw(t0) - 0.8; s += brush([[x - h, Y(t0)], [x + h, Y(t0 + 0.035)]], r, { w: 0.5, o: 0.35 }) + brush([[x + h, Y(t0)], [x - h, Y(t0 + 0.035)]], r, { w: 0.5, o: 0.35 }); }
  // the inscription band: a run of little Kufic squiggles
  for (let k = 0; k < 5; k++) { const cx = x - hw(0.585) + 1 + k * (2 * hw(0.585) - 2) / 4.5, cy = Y(0.585); s += brush([[cx, cy + 1.3], [cx, cy - 1.3], [cx + 0.9, cy - 0.4], [cx + 1.6, cy + 1.2]], r, { w: 0.6, o: 0.6 }); }
  // dots of brick ornament higher up
  for (let k = 0; k < 8; k++) { const t = 0.66 + r() * 0.18, h = hw(t) - 1; s += `<circle cx="${(x - h + r() * 2 * h).toFixed(1)}" cy="${Y(t).toFixed(1)}" r="0.45" fill="var(--ink)" fill-opacity=".5"/>`; }
  // the balcony ledge with a few brackets, then the small open lantern and its cap
  s += S([[x - hw(1) - 2.6, Y(1) + 0.5], [x + hw(1) + 2.6, Y(1) + 0.5]], r, { w: 1.3 });
  for (const dx of [-3.2, -1, 1.2, 3.2]) s += brush([[x + dx, Y(1) + 0.6], [x + dx * 0.8, Y(0.96)]], r, { w: 0.6, o: 0.55 });
  const L0 = Y(1) - 0.5, L1 = Y(1) - 9;
  s += S([[x - 2.6, L0], [x - 2.2, L1]], r, { w: 1.1 }) + S([[x + 2.6, L0], [x + 2.2, L1]], r, { w: 1.1 });
  s += brush([[x - 1.2, L0 - 1.5], [x - 1, L1 + 2]], r, { w: 0.5, o: 0.4 }) + brush([[x + 1, L0 - 1.5], [x + 0.9, L1 + 2]], r, { w: 0.5, o: 0.4 }); // openings
  s += S([[x - 3, L1], [x, L1 - 3.2], [x + 3, L1]], r, { w: 1.2 }) + S([[x, L1 - 3.2], [x, L1 - 6]], r, { w: 0.9, o: 0.8 });
  // shade on the right flank: the tower is round
  for (let k = 0; k < 12; k++) { const t = 0.06 + k * 0.075, h = hw(t); s += brush([[x + h * 0.35, Y(t)], [x + h * 0.85, Y(t) - 3.5]], r, { w: 0.55, o: 0.3 }); }
  // the river at its foot, running across the gorge
  s += S([[x - 52, y + 9], [x - 20, y + 6], [x + 8, y + 10], [x + 54, y + 7]], r, { w: 1.2, o: 0.65 });
  for (const dx of [-30, -6, 22, 40]) s += brush([[x + dx, y + 12], [x + dx + 6, y + 11.5]], r, { w: 0.6, o: 0.35 });
  return s;
}


// Herat Citadel: long walls, fat round towers, crenellations
function citadel(x, y, r) {
  // Herat Citadel (Qala Ikhtiyaruddin): a mud-brick fortress on a high earthen mound, ringed with fat round
  // bastions — a lower enclosure, and the upper citadel standing higher at its east end. y = top of the mound.
  const f = (p) => p.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(' L');
  // round bastion: slightly tapering drum, crenellated top, shade down its right side, an arrow slit
  const tower = (tx, base, h, w) => {
    const top = base - h, wt = w * 0.88;
    let t = `<path d="M${f([[tx - w / 2, base], [tx - wt / 2, top], [tx + wt / 2, top], [tx + w / 2, base]])} Z" fill="var(--paper)"/>`;
    t += S([[tx - w / 2, base], [tx - wt / 2, top]], r, { w: 1.2 }) + S([[tx + w / 2, base], [tx + wt / 2, top]], r, { w: 1.1 });
    t += S([[tx - wt / 2, top], [tx, top + 1.3], [tx + wt / 2, top]], r, { w: 1, o: 0.85 }) + S([[tx - wt / 2, top], [tx, top - 1.5], [tx + wt / 2, top]], r, { w: 0.8, o: 0.6 });
    for (let k = 0; k < 3; k++) { const cx = tx - wt / 2 + 1.5 + k * (wt - 3) / 2; t += brush([[cx, top - 0.5], [cx, top - 2.6]], r, { w: 0.9, o: 0.7 }); }
    for (let k = 0; k < 4; k++) { const sx = tx + w * (0.12 + k * 0.1); t += brush([[sx, top + 3], [sx + 0.3, base - 1]], r, { w: 0.55, o: 0.3 + r() * 0.2 }); }
    t += brush([[tx - w * 0.15, top + h * 0.4], [tx - w * 0.15, top + h * 0.55]], r, { w: 0.8, o: 0.6 });
    return t;
  };
  // curtain wall between bastions: battered (sloping) face, crenels along the top
  const wall = (xa, xb, base, h) => {
    let t = `<path d="M${f([[xa, base], [xa + 1, base - h], [xb - 1, base - h], [xb, base]])} Z" fill="var(--paper)"/>`;
    t += S([[xa + 1, base - h], [xb - 1, base - h - 0.5]], r, { w: 1.1 });
    for (let cx = xa + 3; cx < xb - 2; cx += 3.4) t += brush([[cx, base - h], [cx, base - h - 1.8]], r, { w: 0.7, o: 0.6 });
    for (let k = 0; k < 5; k++) { const sx = xa + 4 + r() * (xb - xa - 8); t += brush([[sx, base - h + 3], [sx + 0.4, base - h + 7 + r() * 4]], r, { w: 0.5, o: 0.25 }); }
    return t;
  };
  // the mound
  const mound = [[x - 60, y + 14], [x - 46, y + 1], [x + 46, y], [x + 62, y + 14]];
  let s = `<path d="M${f(mound)} Z" fill="var(--paper)"/>` + S(mound, r, { w: 1.3, o: 0.75 });
  for (let k = 0; k < 9; k++) { const t = r(), side = r() < 0.5 ? -1 : 1, sx = x + side * (47 + t * 12), sy = y + 1 + t * 12; s += brush([[sx, sy], [sx + side * 2.5, sy + 4]], r, { w: 0.6, o: 0.35 }); }
  // upper citadel (behind, higher, east end)
  s += wall(x + 2, x + 40, y - 9, 13) + tower(x + 2, y - 9, 20, 10) + tower(x + 22, y - 9, 22, 10.5) + tower(x + 41, y - 9, 20, 10);
  // lower enclosure (in front): long wall, bastions at the ends and middle
  s += wall(x - 44, x + 44, y, 11) + tower(x - 44, y, 16, 9) + tower(x - 16, y, 15, 8.5) + tower(x + 14, y, 15, 8.5) + tower(x + 44, y, 16, 9);
  FX.tone(`M${x + 30} ${y - 30} L${x + 46} ${y - 30} L${x + 48} ${y} L${x + 30} ${y} Z`);
  return s;
}

// Blue Mosque, Mazar-i Sharif: domes and minarets
function mosque(x, y, r) {
  let s = S([[x - 70, y + 4], [x + 72, y + 3]], r, { w: 1.4, o: 0.7 });
  s += `<path d="M${x - 44} ${y + 2} V${y - 18} H${x + 44} V${y + 2} Z" fill="var(--paper)"/>` + S([[x - 44, y + 2], [x - 44, y - 18], [x + 44, y - 19], [x + 44, y + 2]], r, { w: 1.3 });
  const dome = (dx, dw, dh) => `<path d="M${dx - dw} ${y - 18} Q${dx - dw} ${y - 18 - dh} ${dx} ${y - 20 - dh} Q${dx + dw} ${y - 18 - dh} ${dx + dw} ${y - 18} Z" fill="var(--paper)"/>` + S([[dx - dw, y - 18], [dx - dw * 0.9, y - 18 - dh * 0.6], [dx, y - 20 - dh], [dx + dw * 0.9, y - 18 - dh * 0.6], [dx + dw, y - 18]], r, { w: 1.5 }) + S([[dx, y - 20 - dh], [dx, y - 28 - dh]], r, { w: 1 });
  s += dome(x - 26, 11, 14) + dome(x + 26, 11, 14) + dome(x, 17, 24);
  for (const mx of [x - 58, x + 58]) {
    s += S([[mx - 3, y + 3], [mx - 2, y - 58]], r, { w: 1.2 }) + S([[mx + 3, y + 3], [mx + 2, y - 58]], r, { w: 1.1 }) + S([[mx - 5, y - 42], [mx + 5, y - 42]], r, { w: 1 }) + S([[mx - 2, y - 58], [mx, y - 64], [mx + 2, y - 58]], r, { w: 1 });
  }
  for (let k = 0; k < 16; k++) s += dot(x + 4 + r() * 14, y - 36 + r() * 16, r, 0.6);
  return s;
}

// Band-e Amir: stepped lakes held back by natural travertine dams
function bandeAmir(x, y, r) {
  let s = '';
  for (let k = 0; k < 3; k++) {
    const yy = y + k * 14, xx = x + k * 26;
    s += S([[xx - 44, yy], [xx - 10, yy - 5], [xx + 30, yy - 1], [xx + 50, yy + 3]], r, { w: 1.6 });
    for (let i = 0; i < 5; i++) { const wx = xx - 30 + r() * 60; s += brush([[wx, yy - 3.5], [wx + 6 + r() * 6, yy - 3.8]], r, { w: 0.8, o: 0.4 }); }
    for (let i = 0; i < 7; i++) { const cx = xx - 36 + i * 12; s += brush([[cx, yy + 1], [cx - 1, yy + 7]], r, { w: 0.8, o: 0.45 }); }
  }
  return s + S([[x - 60, y - 22], [x - 20, y - 30], [x + 40, y - 26], [x + 110, y - 18]], r, { w: 1.2, o: 0.55 }) + flicks(x - 60, y - 28, x + 110, y - 12, 20, r, { o: 0.35 });
}

// Where the vignettes sit (lon, lat of the site) + an offset so labels stay clear.
const LANDMARKS = [
  { draw: bamiyan, at: [67.83, 34.82], off: [-4, -18], label: 'the Buddhas (gone)', lab: [14, 26] }, // the cliff stands right over the town, north side
  { draw: jam, at: [64.52, 34.4], off: [0, 0], label: 'Minaret of Jam' },
  { draw: kabul, at: [69.18, 34.53], off: [-28, -12], label: '' }, // just NW of the city mark, clear of KABUL's name
  { draw: citadel, at: [62.2, 34.35], off: [6, -36], label: 'citadel' },
  { draw: mosque, at: [67.11, 36.71], off: [30, -44], label: 'Blue Mosque' },
  { draw: bandeAmir, at: [67.2, 34.84], off: [-120, 58], label: '' },
];
const HILLS = [[65.9, 33.9], [68.6, 33.35], [66.4, 35.85]];
// sparser, smaller hills for the south so it isn't empty at a glance
const HILLS_SOUTH = [[68.2, 32.6], [66.6, 32.75], [62.9, 32.7], [67.3, 31.95], [64.3, 32.35], [69.0, 31.9]];

const RIVERS_KEEP = new Set(['Amu Darya', 'Panj', 'Helmand', 'Harirud', 'Kabul', 'Arghandab']);
// Farah Rud, hand-traced (approximate) — runs south-west into the Hamun
const FARAH = [[63.3, 33.25], [62.9, 32.9], [62.4, 32.55], [62.1, 32.2], [61.8, 31.8], [61.5, 31.5]];

// Tributaries the source data lacks, hand-traced from atlases (approximate by design), source → mouth.
const TRIBUTARIES = [
  ['Kunar', [[71.62, 35.45], [71.38, 35.1], [71.12, 34.86], [70.9, 34.6], [70.55, 34.44]]],
  ['Panjshir', [[70.35, 35.72], [70.0, 35.45], [69.65, 35.25], [69.38, 35.05], [69.42, 34.84], [69.72, 34.62]]],
  ['Logar', [[68.75, 33.95], [69.0, 33.92], [69.12, 34.15], [69.22, 34.42]]],
  ['Murghab', [[65.2, 34.72], [64.55, 34.95], [63.95, 35.2], [63.5, 35.45], [63.25, 35.62], [62.95, 35.85]]],
  ['Khash Rud', [[64.25, 33.25], [63.65, 32.7], [63.05, 32.2], [62.45, 31.72], [61.88, 31.4]]],
  ['Tarnak', [[67.85, 32.95], [67.05, 32.4], [66.25, 31.92], [65.62, 31.58]]],
];
const MINOR_RIVERS = new Set(['Kunduz', 'Kokcha', 'Balkh']); // in the data, drawn as tributaries
// Reservoirs, drawn as small lakes on their river (dam position; the lake lies upstream of it)
const RESERVOIRS = [{ name: 'Kajaki', river: 'Helmand', at: [65.12, 32.32], len: 34 }, { name: 'Naghlu', river: 'Kabul', at: [69.72, 34.63], len: 18 }];
// Oasis stretches: the green ribbons of fields and poplars along the rivers (lon/lat boxes), drawn when zoomed in
const OASES = [
  { river: 'Helmand', box: [62.3, 30.9, 65.0, 32.4] }, { river: 'Arghandab', box: [64.6, 31.2, 66.0, 31.9] },
  { river: 'Harirud', box: [61.6, 34.1, 62.9, 34.5] }, { river: 'Kabul', box: [70.1, 34.2, 70.95, 34.55] }, { river: 'Balkh', box: [66.6, 36.2, 67.2, 36.8] },
  { river: 'Kunduz', box: [68.4, 36.4, 69.0, 37.0] }, { river: 'Murghab', box: [62.9, 35.4, 63.6, 35.9] },
];

// A sample itinerary in red pencil — replace with the real one.
const SAMPLE_ROUTE = [
  { from: [69.18, 34.53], to: [67.83, 34.82], via: [68.4, 34.95], note: 'Day 1: Kabul → Bamiyan, ~6 hrs' },
  { from: [67.83, 34.82], to: [67.2, 34.84], via: [67.5, 34.72], note: 'Day 3: 75 km, bumpy' },
  { from: [67.2, 34.84], to: [67.11, 36.71], via: [66.7, 35.8], note: 'Day 5: over the pass to Mazar' },
];

// ---------- the map ----------
export function drawMap(data, opts = {}) {
  const { seed = 'marco', layers = {}, frame = FRAME, flaws = true, terrain = null } = opts;
  const L = { border: true, rivers: true, mountains: true, hills: true, landmarks: true, deserts: true, places: true, labels: true, trip: false /* sample itinerary: hidden until the real route */, route: false, compass: true, notes: true, surround: true, terrain: false, towns: false, wakhan: false, waters: false, ...layers };
  let r = rng(seed);
  // every layer draws from its own seed: it looks the same no matter which other
  // layers are drawn with it (zoom tiers render layers separately)
  const layerSeed = (k) => { r = rng(`${seed}|${k}`); FX.cur = k; };
  FX.on = flaws; FX.smudges = []; FX.tones = [];
  // one coordinate system for the whole sheet (pins will use the same one)
  const geo = opts.geo || createGeo({ frame, seed, flaws });
  // photo stops ([lon, lat]): their diamond marker is the marker there, so no cross/ring/pass mark is drawn on top of it
  const stops = opts.stops || [];
  const nearStop = ([lon, lat]) => stops.some(([a, b]) => Math.hypot(a - lon, b - lat) < 0.12);
  const P = geo.toMap;
  const inWakhan = ([lon, lat]) => lon > 71.35 && lat > 36.3;
  const proj = (pts) => pts.map(P);
  const out = [];

  layerSeed('deserts');
  if (L.deserts) {
    // a few loose patches of stipple, not a fill
    let g = '';
    for (const [lon, lat, n] of [[63.4, 30.5, 70], [65.3, 30.9, 90]]) {
      const [cx, cy] = P([lon, lat]);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70;
        g += `<circle cx="${(cx + Math.cos(a) * d * 1.8).toFixed(1)}" cy="${(cy + Math.sin(a) * d * 0.7).toFixed(1)}" r="${(0.7 + r() * 0.9).toFixed(2)}" fill="var(--ink)" fill-opacity="${(0.35 + r() * 0.4).toFixed(2)}"/>`;
      }
    }
    // Registan: red sand dunes — loose crescents, not a pattern
    for (let i = 0; i < 16; i++) {
      const [x, y] = P([64.2 + r() * 2.2, 30.1 + r() * 1.2]);
      if (!pointInRings(...geo.fromMap([x, y]), data.afghanistan)) continue;
      const w = 9 + r() * 10;
      g += brush([[x - w, y], [x - w * 0.3, y - w * 0.45], [x + w * 0.4, y - w * 0.35], [x + w, y + 1]], r, { w: 1 + r() * 0.5, o: 0.45 + r() * 0.25, taperIn: 0.3, taperOut: 0.3 });
      if (r() < 0.6) g += brush([[x - w * 0.2, y - w * 0.3], [x + w * 0.3, y + w * 0.1]], r, { w: 0.7, o: 0.3 });
    }
    // Sistan: the Hamun lakes on the Iranian border, a few wobbly outlines
    for (const [lon, lat, rx, ry] of [[61.35, 31.45, 16, 9], [61.55, 31.05, 12, 6]]) {
      const [x, y] = P([lon, lat]);
      g += brush(Array.from({ length: 20 }, (_, i) => { const t = (i / 19) * Math.PI * 2.1; return [x + Math.cos(t) * rx * (1 + (r() - 0.5) * 0.25), y + Math.sin(t) * ry * (1 + (r() - 0.5) * 0.3)]; }), r, { w: 1.3, o: 0.65, taperIn: 0.05, taperOut: 0.1 });
      g += brush([[x - rx * 0.4, y], [x + rx * 0.3, y + 1]], r, { w: 0.8, o: 0.35 });
    }
    out.push(`<g class="layer-deserts">${g}</g>`);
  }

  layerSeed('border&&flaws');
  if (L.border && flaws) {
    // first attempts, rubbed out: a ghost line a few mm off, plus eraser smear
    let g = '';
    for (const ring of data.afghanistan) {
      const pts = proj(ring);
      for (let k = 0; k < 3; k++) {
        let i0 = Math.floor(r() * (pts.length - 60));
        for (let t = 0; t < 20 && ring.slice(i0, i0 + 60).some(inWakhan); t++) i0 = Math.floor(r() * (pts.length - 60));
        const seg = pts.slice(i0, i0 + 25 + Math.floor(r() * 35));
        const ox = (r() - 0.5) * 26, oy = (r() - 0.5) * 26;
        g += roughLine(seg.map(([x, y]) => [x + ox, y + oy]), r, { tol: 8, w: 2.4, o: 0.9, amp: 2 });
        const [mx, my] = seg[Math.floor(seg.length / 2)];
        g += `<ellipse cx="${(mx + ox / 2).toFixed(1)}" cy="${(my + oy / 2).toFixed(1)}" rx="${(40 + r() * 40).toFixed(0)}" ry="${(12 + r() * 10).toFixed(0)}" transform="rotate(${(r() * 180).toFixed(0)} ${mx.toFixed(0)} ${my.toFixed(0)})" fill="var(--ink)" fill-opacity=".05"/>`;
      }
    }
    out.push(`<g class="layer-erased" filter="url(#erased)" opacity=".16">${g}</g>`);
  }

  // The Wakhan is only 15–65 km wide: at country scale that's a few px, so it gets
  // finer tolerance and steady strokes, or the corridor collapses into a stub.
  layerSeed('surround');
  if (L.surround) {
    // Graphite shading hugging the OUTSIDE of the border, fading outward, so the country
    // stands off the sheet. Clip = everything but the country; mask = a blurred, wobbled
    // band along the border line (uneven width, like a hand shading along an edge).
    const ring = data.afghanistan.map((rg) => smooth(wobble(resample(proj(rg), 6), r, 1.5), true)).join(' ');
    const [W, H] = [frame.w, frame.h];
    out.push(`<g class="layer-surround">
      <defs>
        <clipPath id="outside"><path clip-rule="evenodd" d="M-60 -60 H${W + 60} V${H + 60} H-60 Z ${ring}"/></clipPath>
        <filter id="band" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="${Math.floor(r() * 999)}" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G" result="d"/>
          <feGaussianBlur in="d" stdDeviation="16"/>
        </filter>
        <mask id="near-border" maskUnits="userSpaceOnUse" x="-60" y="-60" width="${W + 120}" height="${H + 120}">
          <path d="${ring}" fill="none" stroke="#fff" stroke-width="78" filter="url(#band)"/>
        </mask>
      </defs>
      <g clip-path="url(#outside)" mask="url(#near-border)">
        <rect x="-60" y="-60" width="${W + 120}" height="${H + 120}" fill="var(--ink)" opacity=".06"/>
        <rect x="-60" y="-60" width="${W + 120}" height="${H + 120}" fill="url(#graphite)" filter="url(#carbon)" opacity=".5"/>
      </g>
    </g>`);
  }

  layerSeed('border');
  if (L.border) out.push(`<g class="layer-border">${data.afghanistan.map((ring) => {
    const runs = []; let cur = null;
    for (const p of [...ring, ring[0]]) { const k = inWakhan(p); if (!cur || cur.k !== k) { const last = cur && cur.pts.at(-1); cur = { k, pts: last ? [last] : [] }; runs.push(cur); } cur.pts.push(p); }
    return runs.map((run) => run.k
      ? roughLine(proj(run.pts), r, { tol: 2.5, w: 2.5, o: 0.85, amp: 1, strokeLen: [3, 7], steady: true })
      : roughLine(proj(run.pts), r, { tol: 11, w: 2.8, o: 0.85, amp: 2.2, strokeLen: [1, 6] })).join('');
  }).join('')}</g>`);



  layerSeed('rivers');
  const riverGeom = []; // the drawn (meandered) lines, source → mouth, for the oasis fields and river names
  if (L.rivers) {
    // Inland rivers meander (the source data is coarse: the Kabul and Arghandab have 7–9 points, which drew as
    // ruled lines) and taper: a pencil pressing harder as the stream grows. The Amu Darya and Panj ARE the
    // northern border — kept exact.
    const BORDER_RIVERS = new Set(['Amu Darya', 'Panj']);
    const meander = (pts) => wobble(wobble(resample(pts, 4), r, 3.4, 0.12), r, 1.3, 0.38);
    const inGrid = ([lon, lat]) => terrain && lon > terrain.bounds[0] && lon < terrain.bounds[2] && lat > terrain.bounds[1] && lat < terrain.bounds[3];
    const downstream = (ll) => (inGrid(ll[0]) && inGrid(ll.at(-1)) && terrain.sample(...ll[0]) < terrain.sample(...ll.at(-1)) ? [...ll].reverse() : ll);
    const tapered = (pts, { w0, w1, o }) => {
      const n = Math.max(2, Math.round(pts.length / 36));
      let t = '';
      for (let k = 0; k < n; k++) {
        const a0 = Math.floor((k * (pts.length - 1)) / n), b0 = Math.min(pts.length - 1, Math.floor(((k + 1) * (pts.length - 1)) / n) + 1);
        const f = (k + 0.5) / n;
        t += roughLine(pts.slice(a0, b0 + 1), r, { tol: 2.5, w: w0 + (w1 - w0) * f, o: o * (0.75 + 0.25 * f), amp: 1.5, strokeLen: [4, 10] });
      }
      return t;
    };
    let g = '';
    for (const v of data.rivers.filter((v) => RIVERS_KEEP.has(v.name) || MINOR_RIVERS.has(v.name))) {
      if (BORDER_RIVERS.has(v.name)) { g += roughLine(proj(v.pts), r, { tol: 7, w: 2, o: 0.7, amp: 2.6, strokeLen: [2, 8] }); continue; }
      const minor = MINOR_RIVERS.has(v.name), pts = meander(proj(downstream(v.pts)));
      riverGeom.push({ name: v.name, pts, minor });
      g += tapered(pts, minor ? { w0: 0.7, w1: 1.5, o: 0.52 } : { w0: 1.0, w1: 2.3, o: 0.7 });
    }
    for (const [name, ll] of [...TRIBUTARIES, ['Farah', FARAH]]) {
      const pts = meander(proj(ll));
      riverGeom.push({ name, pts, minor: true });
      g += tapered(pts, { w0: 0.7, w1: 1.5, o: 0.52 });
    }
    // reservoirs: a small lake lying along the river, upstream of its dam
    for (const rv of RESERVOIRS) {
      const [dx, dy] = P(rv.at), lines = riverGeom.filter((q) => q.name === rv.river);
      let best = null;
      for (const q of lines) q.pts.forEach((p, i) => { const d = Math.hypot(p[0] - dx, p[1] - dy); if (!best || d < best.d) best = { d, q, i }; });
      if (!best || best.d > 25) continue;
      const { q, i } = best, j = Math.max(0, i - Math.round(rv.len / 4)); // upstream from the dam
      const core = q.pts.slice(j, i + 1);
      if (core.length < 3) continue;
      const half = (k) => 2.2 + Math.sin((k / (core.length - 1)) * Math.PI) * 3.2;
      const nrm = (k) => { const a = core[Math.max(0, k - 1)], b = core[Math.min(core.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
      const ring = [...core.map((p, k) => [p[0] + nrm(k)[0] * half(k), p[1] + nrm(k)[1] * half(k)]), ...core.map((p, k) => [p[0] - nrm(k)[0] * half(k), p[1] - nrm(k)[1] * half(k)]).reverse()];
      g += `<path d="${smooth(ring, true)}" fill="var(--paper)"/>` + S([...ring, ring[0]], r, { w: 1.2, o: 0.75 });
      for (let k = 2; k < core.length - 2; k += 2) g += brush([[core[k][0] - 2, core[k][1] + 0.6], [core[k][0] + 2, core[k][1] + 0.4]], r, { w: 0.6, o: 0.35 }); // still water
    }
    // the fertile valleys in green crayon: a soft, broad ribbon along each oasis stretch (a few offset passes of a
    // waxy stroke; the pencil filter's paper tooth breaks it up like crayon) — visible at the overview
    let ribbon = '';
    for (const oz of OASES) for (const q of riverGeom.filter((q) => q.name === oz.river)) {
      const inside = q.pts.map((p) => { const [lon, lat] = geo.fromMap(p); return lon > oz.box[0] && lon < oz.box[2] && lat > oz.box[1] && lat < oz.box[3] && pointInRings(lon, lat, data.afghanistan); });
      let run = [];
      const flush = () => {
        if (run.length > 4) for (let pass = 0; pass < 4; pass++) {
          const off = (pass - 1.5) * 3.2 + (r() - 0.5) * 1.4;
          const line = run.map((p, i) => { const a0 = run[Math.max(0, i - 1)], b0 = run[Math.min(run.length - 1, i + 1)], l = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1; return [p[0] - ((b0[1] - a0[1]) / l) * off, p[1] + ((b0[0] - a0[0]) / l) * off]; });
          ribbon += brush(wobble(line, r, 1.6, 0.2), r, { w: 5.5 + r() * 2.5, o: 0.2 + r() * 0.1, taperIn: 0.25, taperOut: 0.25, color: 'var(--green)' });
        }
        run = [];
      };
      q.pts.forEach((p, i) => { if (inside[i]) run.push(p); else flush(); });
      flush();
    }
    out.push(`<g class="layer-oases">${ribbon}</g>`);
    const wakhanRiver = terrain ? valleyLine(terrain, (lon, lat) => pointInRings(lon, lat, data.afghanistan), 72.62, 74.45, 36.86, 37.2) : [];
    out.push(`<g class="layer-rivers">${g}${wakhanRiver.length ? roughLine(proj(wakhanRiver), r, { tol: 2, w: 1.6, o: 0.7, amp: 1.2, strokeLen: [3, 7], steady: true }) : ''}</g>`);
  }

  // Zoomed in: the green ribbons — patchworks of little hatched fields and poplars along the oasis stretches,
  // and the rivers' names lettered along their lines.
  layerSeed('waters');
  if (L.waters && riverGeom.length) {
    let g = '';
    const inBoxLL = ([x, y], [lo0, la0, lo1, la1]) => { const [lon, lat] = geo.fromMap([x, y]); return lon > lo0 && lon < lo1 && lat > la0 && lat < la1 && pointInRings(lon, lat, data.afghanistan); };
    for (const oz of OASES) for (const q of riverGeom.filter((q) => q.name === oz.river)) {
      // two rows of plots pressed edge to edge along each bank (a patchwork, not confetti), furrows alternating
      for (let i = 1; i < q.pts.length - 2; i += 1) {
        const p = q.pts[i];
        if (!inBoxLL(p, oz.box)) continue;
        const a = q.pts[i - 1], b = q.pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
        const half = 2.1; // plots ~4 px along the river: one per resampled step, so neighbours touch
        for (const side of [-1, 1]) for (const [d0, d1] of [[1.8, 5.2], [5.2, 8.4 + r() * 2]]) {
          if (r() < (d0 > 2 ? 0.45 : 0.15)) continue; // the outer row thins out into the desert
          const pt = (u, v) => [p[0] + ux * u - uy * v * side, p[1] + uy * u + ux * v * side];
          const j = () => (r() - 0.5) * 0.6;
          const quad = [pt(-half + j(), d0), pt(half + j(), d0), pt(half + j(), d1), pt(-half + j(), d1)];
          g += `<path d="M${quad.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z" fill="none" stroke="var(--green)" stroke-width=".45" stroke-opacity=".6"/>`;
          const along = r() < 0.5, n = 2 + Math.floor(r() * 2);
          for (let k = 1; k <= n; k++) {
            const f = k / (n + 1);
            g += brush(along ? [pt(-half * 0.9, d0 + (d1 - d0) * f), pt(half * 0.9, d0 + (d1 - d0) * f)] : [pt(-half + 2 * half * f, d0 + 0.3), pt(-half + 2 * half * f, d1 - 0.3)], r, { w: 0.45, o: 0.55, color: 'var(--green)' });
          }
        }
        if (r() < 0.07) for (let k = 0; k < 3; k++) { const [tx, ty] = [p[0] - uy * 9.5 + ux * k * 1.6, p[1] + ux * 9.5 + uy * k * 1.6]; g += brush([[tx, ty + 1.2], [tx + 0.15, ty - 3.2 - r()]], r, { w: 0.75, o: 0.7, color: 'var(--green)' }); } // a line of poplars
      }
    }
    // river names along their lines (minor rivers only — the big ones are named at the overview)
    for (const q of riverGeom.filter((q) => q.minor)) {
      const i = Math.floor(q.pts.length * 0.42), a = q.pts[Math.max(0, i - 6)], b = q.pts[Math.min(q.pts.length - 1, i + 6)];
      let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const t = (ang * Math.PI) / 180, [x, y] = [q.pts[i][0] + Math.sin(t) * 5, q.pts[i][1] - Math.cos(t) * 5];
      g += `<text class="t-river" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle" transform="rotate(${ang.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})">${q.name}</text>`;
    }
    out.push(`<g class="layer-waters">${g}</g>`);
  }

  layerSeed('mountains');
  if (L.mountains) {
    const peaks = [];
    for (const ridge of RIDGES) {
      const pts = resample(proj(ridge.pts), ridge.step || 38);
      pts.forEach(([x, y], i) => {
        if (r() < 0.15) return; // the hand skips one now and then
        const core = Math.sin(Math.PI * (i / Math.max(1, pts.length - 1)));
        peaks.push([x + (r() - 0.5) * 14, y + (r() - 0.5) * 16, ridge.h[0] + (ridge.h[1] - ridge.h[0]) * core * (0.7 + r() * 0.5)]);
      });
    }
    if (terrain) {
      // Wakhan: both walls from real summits, strictly inside the border
      for (const p of terrain.peaks({ radius: 6, minElev: 5000, box: WAKHAN_BOX }).filter((p) => pointInRings(p.at[0], p.at[1], data.afghanistan)).slice(0, 16)) {
        const [x, y] = P(p.at);
        peaks.push([x, y + 4, 11 + ((p.elev - 5000) / 2200) * 12]);
      }
    }
    peaks.sort((a, b) => a[1] - b[1]);
    let hills = '';
    for (const ridge of RIDGES) {
      const pts = resample(proj(ridge.pts), 30);
      for (let row = 1; row <= (ridge.foothills ?? 2); row++) {
        for (let i = 0; i < pts.length - 1; i += 1 + Math.floor(r() * 2)) {
          if (r() < 0.3) continue;
          const [x0, y0] = pts[i], [x1, y1] = pts[Math.min(pts.length - 1, i + 1)];
          const off = row * (16 + r() * 10), len = 0.8 + r() * 0.9;
          const a = [x0 - 6, y0 + off], b = [x0 + (x1 - x0) * len + 6, y0 + (y1 - y0) * len + off];
          const mid = [(a[0] + b[0]) / 2 + (r() - 0.5) * 6, (a[1] + b[1]) / 2 - 7 - r() * 7];
          hills += brush(wobble(resample([a, mid, b], 5), r, 1), r, { w: 1 + r() * 0.6, o: 0.35 + r() * 0.3 });
          // stipple settles under each foothill line
          for (let k = 0, n = Math.floor(r() * 6); k < n; k++) {
            const t = r();
            hills += `<circle cx="${(a[0] + (b[0] - a[0]) * t).toFixed(1)}" cy="${(a[1] + (b[1] - a[1]) * t + 3 + r() * 8 - Math.sin(t * Math.PI) * 6).toFixed(1)}" r="${(0.45 + r() * 0.6).toFixed(2)}" fill="var(--ink)" fill-opacity="${(0.25 + r() * 0.35).toFixed(2)}"/>`;
          }
          if (r() < 0.5) FX.tone(`M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mid[0].toFixed(1)} ${mid[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)} L${(b[0] - 8).toFixed(1)} ${(b[1] + 10).toFixed(1)} L${(a[0] + 12).toFixed(1)} ${(a[1] + 9).toFixed(1)} Z`);
        }
      }
    }
    out.push(`<g class="layer-foothills">${hills}</g>`);
    out.push(`<g class="layer-mountains">${peaks.map(([x, y, h]) => peak(x, y, h, r)).join('')}</g>`);
  }

  layerSeed('highlands');
  const highlandPts = [];
  if (L.mountains && terrain) {
    // The central highlands and the east, from real summits (DEM): a light scatter of smaller, fainter peaks so
    // the country reads as mountainous at the overview — the main chains (RIDGES) stay the strongest marks.
    const ridgePts = RIDGES.flatMap((rd) => resample(rd.pts, 0.08));
    const avoid = [...PLACES.map((p) => [p[1], p[2]]), ...LANDMARKS.map((l) => l.at)];
    const near = (a, list, d) => list.some(([x, y]) => Math.hypot(a[0] - x, a[1] - y) < d);
    const hs = terrain.peaks({ radius: 10, minElev: 3000 })
      .filter((p) => pointInRings(p.at[0], p.at[1], data.afghanistan) && !inWakhan(p.at) && !near(p.at, ridgePts, 0.32) && !near(p.at, avoid, 0.3))
      .map((p) => ({ ...p, xy: P(p.at) })).sort((a, b) => a.xy[1] - b.xy[1]); // far (north) first, near ones drawn over them
    let g = '';
    for (const p of hs) {
      const [x, y] = p.xy, h = 8 + Math.min(1, (p.elev - 3000) / 2500) * 9;
      g += peak(x, y, h, r, 0.58);
      if (r() < 0.5) g += peak(x + (r() < 0.5 ? -1 : 1) * (h * 0.85 + r() * 4), y + 3 + r() * 3, h * 0.68, r, 0.48); // a lower shoulder
      highlandPts.push([x, y]);
    }
    out.push(`<g class="layer-highlands">${g}</g>`);
  }

  layerSeed('hills');
  if (L.hills) out.push(`<g class="layer-hills">${HILLS.map(([lon, lat]) => { const [x, y] = P([lon, lat]); return hillCluster(x, y, r, { n: 1 + Math.floor(r() * 2) }); }).join('')}${HILLS_SOUTH.map(([lon, lat]) => { const [x, y] = P([lon, lat]); return hillCluster(x, y, r, { n: 1, width: 110, height: 22 }); }).join('')}</g>`);

  layerSeed('landmarks');
  if (L.landmarks) {
    let g = '';
    for (const lm of LANDMARKS) {
      const [x, y] = P(lm.at), lx = x + lm.off[0], ly = y + lm.off[1];
      g += `<g transform="rotate(${((r() - 0.5) * 4).toFixed(1)} ${lx} ${ly})">${lm.draw(lx, ly, r)}</g>`;
      const [tx, ty] = lm.lab ? [lx + lm.lab[0], ly + lm.lab[1]] : [lx - 50, ly + 30];
      if (lm.label) g += `<text class="t-landmark" x="${tx.toFixed(0)}" y="${ty.toFixed(0)}" transform="rotate(${((r() - 0.5) * 5).toFixed(1)} ${lx} ${ly})">${lm.label}</text>`;
    }
    out.push(`<g class="layer-landmarks">${g}</g>`);
  }

  layerSeed('trip');
  if (L.trip) {
    let g = '';
    for (const leg of SAMPLE_ROUTE) {
      const a = P(leg.from), b = P(leg.to), v = P(leg.via);
      const line = resample([a, v, b], 6);
      for (const d of dashes(wobble(line, r, 2.2), 12, 9, r)) g += brush(d, r, { w: 4 + r() * 1.5, o: 0.78, taperIn: 0.25, taperOut: 0.3, color: 'var(--red)' });
      const [mx, my] = v;
      g += `<text class="t-trip" x="${(mx - 60).toFixed(0)}" y="${(my - 16).toFixed(0)}" transform="rotate(${((r() - 0.5) * 6).toFixed(1)} ${mx} ${my})">${leg.note}</text>`;
    }
    for (const stop of [SAMPLE_ROUTE[0].from, ...SAMPLE_ROUTE.map((l) => l.to)]) {
      const [x, y] = P(stop);
      g += S([[x - 9, y + 7], [x, y - 10], [x + 9, y + 7], [x - 10, y + 7]], r, { w: 2, o: 0.85, color: 'var(--red)' });
    }
    out.push(`<g class="layer-trip">${g}</g>`);
  }

  layerSeed('route');
  if (L.route) out.push(`<g class="layer-route">${roughLine(proj(data.marcoPolo), r, { tol: 4, w: 2, o: 0.75, amp: 3, strokeLen: [4, 8], dash: [7, 11] })}</g>`);

  layerSeed('places');
  if (L.places) {
    out.push(`<g class="layer-places">${PLACES.filter((p) => p[4] !== 'lake').map(([, lon, lat, big]) => { const [x, y] = P([lon, lat]), mk = place(x, y, big, r); return nearStop([lon, lat]) ? '' : mk; }).join('')}</g>`);
  }

  layerSeed('labels');
  if (L.labels) {
    let g = '';
    const tilt = () => (r() - 0.5) * 6;
    for (const [name, lon, lat, big, kind] of PLACES) {
      const [x, y] = P([lon, lat]);
      if (kind === 'lake') { g += `<text class="t-place t-place--small" x="${x - 30}" y="${y - 16}" transform="rotate(${tilt().toFixed(1)} ${x} ${y})">${name}</text>`; continue; }
      // lettering goes on the side with room: Bamiyan's name sits centred below (it would run into Kabul's on the right,
      // and into Band-e Amir's diamond marker on the left)
      const left = LABEL_LEFT.has(name);
      // (left-lettered names sit a little low: keeps the name clear of a stop's diamond marker)
      g += `<text class="t-place${big ? ' t-place--big' : ''}" x="${left ? x : x + 12}" y="${left ? y + 26 : y + 6}"${left ? ' text-anchor="middle"' : ''} transform="rotate(${tilt().toFixed(1)} ${x} ${y})">${name.toUpperCase()}</text>`;
    }
    // HINDU KUSH lettered along the real crest — from above the Shibar Pass, NE over the Salang towards
    // the Panjshir (Shibar 68.26/34.91 → Salang 69.04/35.31 → Mir Samir ~70.0/35.6). Kabul lies south of it,
    // Bamiyan west — the name must not sit in the Kabul basin between them.
    const ha = P([68.3, 35.05]), hb = P([70.0, 35.75]);
    const hang = (Math.atan2(hb[1] - ha[1], hb[0] - ha[0]) * 180) / Math.PI;
    const [hx, hy] = ha;
    g += `<text class="t-region t-region--range${flaws ? ' t-squeeze' : ''}" x="${hx.toFixed(0)}" y="${hy.toFixed(0)}" transform="rotate(${hang.toFixed(1)} ${hx.toFixed(0)} ${hy.toFixed(0)})">HINDU KUSH</text>`;
    // the corridor named along its length, on the open ground to its north
    const wa = P([72.25, 37.2]), wb = P([74.5, 37.42]);
    const wang = (Math.atan2(wb[1] - wa[1], wb[0] - wa[0]) * 180) / Math.PI;
    g += `<text class="t-region t-region--wakhan" x="${wa[0].toFixed(0)}" y="${(wa[1] - 22).toFixed(0)}" transform="rotate(${wang.toFixed(1)} ${wa[0].toFixed(0)} ${wa[1].toFixed(0)})">WAKHAN CORRIDOR</text>`;
    const [dx, dy] = P([64.2, 30.05]);
    g += `<text class="t-region t-region--soft" x="${dx}" y="${dy}" transform="rotate(${tilt().toFixed(1)} ${dx} ${dy})">Registan desert</text>`;
    const [hx2, hy2] = P([61.3, 31.8]);
    g += `<text class="t-river" x="${hx2 - 20}" y="${hy2 - 6}" transform="rotate(-6 ${hx2} ${hy2})">Hamun</text>`;
    const [gx2, gy2] = P([66.4, 31.9]);
    g += `<text class="t-river" x="${gx2}" y="${gy2}" transform="rotate(-38 ${gx2} ${gy2})">Arghandab</text>`;
    const [ax, ay] = P([66.3, 37.35]);
    g += `<text class="t-river" x="${ax}" y="${ay}" transform="rotate(12 ${ax} ${ay})">Amu Darya</text>`;
    const [lx, ly] = P([63.4, 31.5]);
    g += `<text class="t-river" x="${lx}" y="${ly}" transform="rotate(-20 ${lx} ${ly})">Helmand</text>`;
    // neighbours, lettered faintly in the shaded surround
    for (const [name, lon, lat, rot] of NEIGHBOURS) {
      const [x, y] = P([lon, lat]);
      g += `<text class="t-country" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle" transform="rotate(${(rot + tilt() * 0.5).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})">${name}</text>`;
    }
    out.push(`<g class="layer-labels">${g}</g>`);
  }

  layerSeed('notes');
  if (L.notes) {
    out.push(`<g class="layer-notes">
      ${(() => { const [mx, my] = P([68.4, 37.25]); return `<text class="t-note t-note--small" x="${mx}" y="${my}" transform="rotate(-3 ${mx} ${my})">M. Polo went this way - - -</text>`; })()}</g>`);
  }

  // ---------- detail layers (revealed by zooming in) ----------
  const inBox = (lon, lat) => lon > WAKHAN_BOX[0] && lon < WAKHAN_BOX[2] && lat > WAKHAN_BOX[1] && lat < WAKHAN_BOX[3];
  layerSeed('terrain');
  if (L.terrain && terrain) {
    // relief across the country (the Wakhan gets extra, finer detail in the next tier)
    out.push(`<g class="layer-terrain">${hachures({ T: terrain, geo, data, r, box: [0, 0, frame.w, frame.h] })}</g>`);
  }

  layerSeed('towns');
  if (L.towns) {
    let g = '';
    const major = new Set(PLACES.map((p) => p[0]).concat(['Mazar-i-Sharif', 'Bamian', 'Kondoz']));
    for (const c of data.cities.filter((c) => !major.has(c.name) && c.rank >= 6)) {
      const [x, y] = P(c.at);
      const mk = brush([[x - 1.9, y - 1.9], [x + 1.9, y + 1.9]], r, { w: 0.7, o: 0.6 }) + brush([[x + 1.9, y - 1.9], [x - 1.9, y + 1.9]], r, { w: 0.6, o: 0.55 });
      if (!nearStop(c.at)) g += mk;
      g += `<text class="t-town" x="${(x + 4).toFixed(1)}" y="${(y + 2).toFixed(1)}">${c.name.replace('Kondoz', 'Kunduz')}</text>`;
    }
    for (const [name, lon, lat] of PASSES) {
      const [x, y] = P([lon, lat]);
      const mk = brush([[x - 3.5, y - 3], [x - 1.5, y], [x - 3.5, y + 3]], r, { w: 0.8, o: 0.7 }) + brush([[x + 3.5, y - 3], [x + 1.5, y], [x + 3.5, y + 3]], r, { w: 0.8, o: 0.7 });
      if (!nearStop([lon, lat])) g += mk;
      g += `<text class="t-pass" x="${(x + 5).toFixed(1)}" y="${(y + 5).toFixed(1)}">${name}</text>`;
    }
    out.push(`<g class="layer-towns">${g}</g>`);
  }

  layerSeed('wakhan');
  if (L.wakhan && terrain) {
    // the corridor in full, drawn at 2.5× so its strokes read at that zoom, then
    // scaled back into map px — same projection as everything else
    const S = 2.5, a = P([WAKHAN_BOX[0], WAKHAN_BOX[3]]), b = P([WAKHAN_BOX[2], WAKHAN_BOX[1]]);
    const ox = Math.min(a[0], b[0]) - 20, oy = Math.min(a[1], b[1]) - 20;
    const W = (Math.max(a[0], b[0]) - ox + 20) * S, H = (Math.max(a[1], b[1]) - oy + 20) * S;
    FX.xform = `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${(1 / S).toFixed(4)})`;
    const detail = drawWakhanSheet({ terrain, data, r, seed, framed: false, w: W, h: H, stops,
      toLocal: (ll) => { const [x, y] = P(ll); return [(x - ox) * S, (y - oy) * S]; },
      fromLocal: ([x, y]) => geo.fromMap([ox + x / S, oy + y / S]) });
    FX.xform = '';
    out.push(`<g class="layer-wakhan" data-map="${ox.toFixed(2)} ${oy.toFixed(2)} ${(1 / S).toFixed(4)}"><g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${(1 / S).toFixed(4)})">${detail.svg}</g></g>`);
  }

  layerSeed('compass&&flaws');
  if (L.compass && flaws) {
    // north as an afterthought, a little crooked; no scale — just an admission
    const x = frame.w - 230, y = 170;
    out.push(`<g class="layer-compass" transform="rotate(9 ${x} ${y})">${roughLine([[x, y + 40], [x, y - 40]], r, { tol: 1, w: 2, amp: 1.5, strokeLen: [9, 9] })}
      ${brush([[x - 8, y - 26], [x, y - 43], [x + 7, y - 27]], r, { w: 1.8, o: 0.85 })}
      <text class="t-compass" x="${x - 9}" y="${y - 52}">N</text></g>`);
    out.push(`<g class="layer-scale"><text class="t-note t-note--small" x="170" y="${frame.h - 150}" transform="rotate(-3 170 ${frame.h - 150})">(not to scale!!)</text>
      ${brush(wobble(resample([[172, frame.h - 140], [370, frame.h - 144]], 8), r, 1.5), r, { w: 1.6, o: 0.6 })}</g>`);
  } else if (L.compass) {
    layerSeed('compass-plain');
    const x = frame.w - 190, y = 190;
    out.push(`<g class="layer-compass">${roughLine([[x, y + 55], [x, y - 55]], r, { tol: 1, w: 2.2, amp: 1, strokeLen: [9, 9] })}
      <path d="M${x} ${y - 58} l-8 17 M${x + 1} ${y - 58} l8 16" stroke="var(--ink)" stroke-width="1.6" stroke-opacity=".85" stroke-linecap="round"/>
      <text class="t-compass" x="${x}" y="${y - 70}" text-anchor="middle">N</text></g>`);
    const km = P.k / 111.32, sx = 190, sy = frame.h - 160, len = 200 * km;
    out.push(`<g class="layer-scale">${roughLine([[sx, sy], [sx + len, sy]], r, { tol: 1, w: 2, amp: 1.2, strokeLen: [9, 9] })}
      <path d="M${sx} ${sy - 7} v13 M${sx + len} ${sy - 6} v12" stroke="var(--ink)" stroke-width="1.4" stroke-opacity=".8" stroke-linecap="round"/>
      <text class="t-scale" x="${sx + len / 2}" y="${sy - 14}" text-anchor="middle">~200 km</text></g>`);
  }

  const parts = {
    frame, seed,
    groups: out.map((svg) => ({ layer: (svg.match(/class="layer-([a-z-]+)"/) || [])[1] || 'misc', svg })),
    tones: FX.tones.slice(), smudges: FX.smudges.slice(),
    rng: r,
    highlandPts, // for the opening's brush to dab over
  };
  return opts.parts ? parts : composeSVG(parts);
}

// which drawn groups each layer's shading belongs to
const SHADING_GROUPS = { mountains: ['mountains', 'foothills'], 'notes&&flaws': ['traveller'], 'border&&flaws': ['erased'], 'compass&&flaws': ['compass', 'scale'], 'compass-plain': ['compass', 'scale'] };
const shadingIn = (key, only) => !only || (SHADING_GROUPS[key] || [key]).some((g) => only.has(g));

// Assemble drawn groups into one SVG.
//   layers: only these group names (a zoom tier)   text: keep lettering (false = strokes only, for tiles)
//   grain: scale of the paper-tooth noise (keep it fine when rendering at higher zoom)
//   colors: literal colours for renderers without CSS variables
export function composeSVG(parts, { layers = null, text = true, grain = 1, colors = null } = {}) {
  const only = layers ? new Set(layers) : null;
  const { frame } = parts;
  let body = parts.groups.filter((g) => !only || only.has(g.layer)).map((g) => g.svg).join('');
  body = text ? handLettering(body, parts.rng) : body.replace(/<text[\s\S]*?<\/text>/g, '');
  const tones = parts.tones.filter((t) => shadingIn(t.layer, only)), smudges = parts.smudges.filter((t) => shadingIn(t.layer, only));
  let svg = `<svg class="sketch-map" viewBox="0 0 ${frame.w} ${frame.h}" width="${frame.w}" height="${frame.h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="var(--ink)" stroke-width="1.4" stroke-linecap="round"/></marker>
      <filter id="erased" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="smudge" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3.2"/></filter>
      <!-- rubbed graphite: soft, but still broken by the paper's tooth -->
      <!-- rubbed graphite: fine diagonal strokes (pattern), broken by the paper's tooth,
           feathered at the edge — pencil shading, not an airbrushed blur -->
      <pattern id="graphite" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
        <path d="M0 0.6 H2.6" stroke="var(--ink)" stroke-width="0.7"/>
      </pattern>
      <filter id="carbon" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="edge"/>
        <feComposite in="SourceGraphic" in2="edge" operator="in" result="soft"/>
        <feTurbulence type="fractalNoise" baseFrequency="${(0.75 * grain).toFixed(3)} ${(0.3 * grain).toFixed(3)}" numOctaves="2" seed="21" result="tooth"/>
        <feColorMatrix in="tooth" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -1.1" result="mask"/>
        <feComposite in="soft" in2="mask" operator="in"/>
      </filter>
      <!-- graphite skips on paper tooth: break strokes up with a noise mask -->
      <filter id="pencil" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="${(0.9 * grain).toFixed(3)}" numOctaves="2" seed="3" result="tooth"/>
        <feColorMatrix in="tooth" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.0 0 0 0 -0.08" result="grain"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="2" seed="9" result="patch"/>
        <feColorMatrix in="patch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 0.05" result="pressure"/>
        <feComposite in="grain" in2="pressure" operator="arithmetic" k1="1" result="mask"/>
        <feComposite in="SourceGraphic" in2="mask" operator="in"/>
      </filter>
    </defs>
    ${tones.length ? `<g filter="url(#carbon)" opacity=".42">${tones.map((t) => `<path d="${t.d}"${t.xform ? ` transform="${t.xform}"` : ''} fill="url(#graphite)"/>`).join('')}</g>` : ''}
    ${smudges.length ? `<g filter="url(#smudge)" transform="translate(5 4)" opacity=".09">${smudges.map((t) => `<path d="${t.d}" fill="var(--ink)" transform="${t.xform ? `${t.xform} ` : ''}scale(1.01)"/>`).join('')}</g>` : ''}
    <g filter="url(#pencil)">${body}</g>
  </svg>`;
  if (colors) for (const [k, v] of Object.entries(colors)) svg = svg.replaceAll(`var(--${k})`, v);
  return svg;
}

// Pull every piece of lettering out as data (for a live label layer): text, anchor
// point in map px, rotation, style class, and which drawn layer it came from.
export function extractLabels(parts) {
  const labels = [];
  const rot = (x, y, a, cx, cy) => { const t = (a * Math.PI) / 180, dx = x - cx, dy = y - cy; return [cx + dx * Math.cos(t) - dy * Math.sin(t), cy + dx * Math.sin(t) + dy * Math.cos(t)]; };
  for (const g of parts.groups) {
    const gt = g.svg.match(/^<g class="layer-[a-z-]+" transform="rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)"/);
    const gm = g.svg.match(/^<g class="layer-[a-z-]+" data-map="([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
    for (const m of g.svg.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)) {
      const attr = (n) => (m[1].match(new RegExp(`${n}="([^"]*)"`)) || [])[1];
      let x = +attr('x'), y = +attr('y'), a = 0;
      const t = (attr('transform') || '').match(/rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/);
      if (t) { a = +t[1]; [x, y] = rot(x, y, a, +t[2], +t[3]); }
      if (gt) { a += +gt[1]; [x, y] = rot(x, y, +gt[1], +gt[2], +gt[3]); }
      if (gm) { x = +gm[1] + x * +gm[3]; y = +gm[2] + y * +gm[3]; }
      labels.push({ text: m[2].replace(/<[^>]+>/g, ''), x, y, rot: a, cls: attr('class') || '', anchor: attr('text-anchor') || 'start', layer: g.layer });
    }
  }
  return labels;
}

// Where the pencil went, as plain geometry in map px — the opening animation traces
// these to reveal each plate (outline → water → relief → marks). Pure: no random draws,
// so the drawing itself is untouched.
export function introGuides(data, geo, frame = FRAME) {
  const P = geo.toMap, proj = (pts) => pts.map(P);
  return {
    border: data.afghanistan.map(proj),
    rivers: [...data.rivers.filter((v) => RIVERS_KEEP.has(v.name) || MINOR_RIVERS.has(v.name)).map((v) => proj(v.pts)), proj(FARAH), ...TRIBUTARIES.map(([, ll]) => proj(ll))],
    ridges: [...RIDGES.map((rd) => proj(rd.pts)), proj([[71.4, 36.45], [72.3, 36.85], [73.2, 37.0], [74.1, 37.15], [74.9, 37.2]])], // last: the Wakhan's walls
    hills: [...HILLS, ...HILLS_SOUTH].map(P),
    deserts: [[63.4, 30.5], [65.3, 30.9], [61.6, 31.3]].map(P),
    marks: [
      ...PLACES.map(([, lon, lat]) => P([lon, lat])),
      ...LANDMARKS.map((lm) => { const [x, y] = P(lm.at); return [x + lm.off[0], y + lm.off[1]]; }),
      [frame.w - 230, 150], [270, frame.h - 145],
    ],
  };
}
