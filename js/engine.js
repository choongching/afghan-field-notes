// Rendering engine for the wall. One light, one set of rules:
//   - every object sits some height h above the wall (top edge vs bottom edge)
//   - its shadow is the projection of that geometry from a single point light
//   - penumbra (blur) grows with height, darkness falls with height
// That consistency is what sells "photograph" more than any individual effect.

export function rng(seed) {
  let a = typeof seed === 'string' ? [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) : seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, lo, hi) => lo + r() * (hi - lo);

export const light = {
  x: 760, y: -1100, z: 2100, // stage coordinates; z = distance out from the wall
  size: 0.9,                 // area-light softness: blur px per px of height
  strength: 1,
};

// ---------- builders ----------

export function sheet({ x, y, w, h, rot = 0, content = '', tape = 'top', lift = 6, id, group }) {
  const el = document.createElement('article');
  el.className = 'item sheet';
  if (id) el.id = id;
  Object.assign(el.dataset, { lift, liftTop: 0.5, shadowK: 1.5 });
  place(el, x, y, w, h, rot);
  if (group) el.dataset.group = group;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  const seed = id || `${x},${y}`;
  el._tapes = tapeSpec(tape, x, y, w, h, rot, seed);
  const wear = paperWear(w, h, rng(`${seed}|wear`), el._tapes);
  el.style.setProperty('--paper', wear.tone);
  el.style.setProperty('--skew', `${wear.skew}deg`);
  el.innerHTML = `
    <div class="shadow cast"></div>
    <div class="shadow contact"></div>
    ${wear.cornerShadow}
    <div class="paper" style="clip-path:${wear.clip}">${content}${wear.html}<div class="paper-grain"></div><div class="paper-shade"></div></div>`;
  return el;
}

// Nothing on a real wall is a perfect rectangle. Per sheet, seeded:
//  cockle   – low-frequency relief lit by the same light (paper never lies flat)
//  tension  – dimples/creases fanning out below each piece of tape
//  curl     – one bottom corner lifting towards the camera, with its own shadow
//  edges    – guillotine edges that are very slightly irregular
//  tone     – each ream/printer gives a slightly different white
//  fold     – some sheets were folded to be carried around
//  smudge   – handling marks near the edges
function paperWear(w, h, r, tapes) {
  const html = [];
  // relief = soft cockle (fractalNoise) + sharp crinkles (turbulence = |noise| → creases),
  // lit by the scene light, recentered so flat paper = 0.5 grey (soft-light neutral).
  // Crinkle strength varies a lot: some sheets are fresh, some were carried around.
  const crinkle = [0.05, 0.25, 0.5, 0.8][Math.min(3, Math.floor(r() * 4.4))];
  const f = (v) => v.toFixed(4);
  const cockle = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><filter id='c' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>`
    + `<feTurbulence type='fractalNoise' baseFrequency='${f(between(r, 0.006, 0.011))} ${f(between(r, 0.008, 0.016))}' numOctaves='2' seed='${Math.floor(r() * 999)}' result='soft'/>`
    + `<feTurbulence type='turbulence' baseFrequency='${f(between(r, 0.008, 0.018))} ${f(between(r, 0.008, 0.018))}' numOctaves='2' seed='${Math.floor(r() * 999)}' result='sharp'/>`
    + `<feComposite in='soft' in2='sharp' operator='arithmetic' k2='1' k3='${f(-crinkle)}' k4='${f(crinkle * 0.3)}' result='height'/>`
    + `<feDiffuseLighting in='height' surfaceScale='${between(r, 2.2, 3.6).toFixed(1)}' lighting-color='#fff'><feDistantLight azimuth='250' elevation='52'/></feDiffuseLighting>`
    + `<feComponentTransfer><feFuncR type='linear' slope='1.3' intercept='-0.47'/><feFuncG type='linear' slope='1.3' intercept='-0.47'/><feFuncB type='linear' slope='1.3' intercept='-0.47'/></feComponentTransfer>`
    + `</filter><rect width='100%' height='100%' filter='url(#c)'/></svg>`)}")`;
  html.push(`<div class="wear-cockle" style="background-image:${cockle.replaceAll('"', '&quot;')};opacity:${between(r, 0.35, 0.6).toFixed(2)}"></div>`);

  // tension creases under each tape (tape u is sheet-local 0..1)
  for (const t of tapes) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const px = t.u * w + side * between(r, 4, t.len * 0.4);
      html.push(`<i class="wear-crease" style="left:${px.toFixed(1)}px;height:${between(r, 18, 62).toFixed(0)}px;--a:${(side * between(r, 8, 48)).toFixed(1)}deg;opacity:${between(r, 0.45, 1).toFixed(2)}"></i>`);
    }
  }

  // curled corner (≈70% of sheets)
  let clipBR = [w, h], clipBL = [0, h], cornerShadow = '';
  const curl = r();
  if (curl < 0.7) {
    const right = curl < 0.4, s = between(r, 26, 60), pull = between(r, 1.2, 3.2);
    html.push(`<div class="wear-curl wear-curl--${right ? 'r' : 'l'}" style="--s:${s.toFixed(0)}px"></div>`);
    cornerShadow = `<div class="shadow corner corner--${right ? 'r' : 'l'}" style="--s:${s.toFixed(0)}px"></div>`;
    // a lifted corner is foreshortened: pull the silhouette in a touch
    if (right) clipBR = [w - pull, h - pull * 1.3]; else clipBL = [pull, h - pull * 1.3];
  }

  // edges: gently irregular polygon
  const jitter = () => between(r, 0, 0.45);
  const edge = (from, to, steps, nx, ny) => Array.from({ length: steps }, (_, i) => {
    const t = i / steps, j = jitter();
    return [from[0] + (to[0] - from[0]) * t + nx * j, from[1] + (to[1] - from[1]) * t + ny * j];
  });
  const pts = [...edge([0, 0], [w, 0], 6, 0, 1), ...edge([w, 0], clipBR, 8, -1, 0), ...edge(clipBR, clipBL, 6, 0, -1), ...edge(clipBL, [0, 0], 8, 1, 0)];
  const clip = `polygon(${pts.map(([a, b]) => `${a.toFixed(1)}px ${b.toFixed(1)}px`).join(',')})`;

  // fold line (≈25%)
  if (r() < 0.25) html.push(`<div class="wear-fold" style="top:${(h * between(r, 0.46, 0.54)).toFixed(0)}px;--fa:${between(r, -0.8, 0.8).toFixed(2)}deg"></div>`);
  // smudges (≈35%)
  if (r() < 0.35) html.push(`<div class="wear-smudge" style="left:${between(r, 0.05, 0.85) * w}px;top:${between(r, 0.6, 0.92) * h}px;--sz:${between(r, 18, 40).toFixed(0)}px"></div>`);

  const tones = ['#f4f4f1', '#f6f5f0', '#f1f2f0', '#f5f3ec', '#eff1f0', '#f7f6f2'];
  return { html: html.join(''), clip, cornerShadow, tone: tones[Math.floor(r() * tones.length)], skew: between(r, -0.25, 0.25).toFixed(2) };
}

export function note({ x, y, w = 150, h = 150, rot = 0, text = '', font = 'reenie', color = 'canary', lift = 13, curl = 7, id }) {
  const el = document.createElement('aside');
  el.className = `item note note--${color}`;
  if (id) el.id = id;
  Object.assign(el.dataset, { lift, liftTop: 0.35, shadowK: 2.5 });
  el.style.setProperty('--curl', `${curl}deg`);
  // ink scales with the note, then shrinks further for long lines so nothing clips
  const longest = Math.max(1, ...text.split('\n').map((l) => l.length));
  el.style.setProperty('--fs', ((w / 120) * Math.min(1, 10 / longest)).toFixed(3));
  place(el, x, y, w, h, rot);
  const r = rng(`${x}|${y}|note`);
  // lines get individual wobble: real handwriting drifts
  const lines = text.split('\n').map((l) =>
    `<span style="--lr:${between(r, -2.2, 2.2).toFixed(2)}deg;--lx:${between(r, -3, 4).toFixed(1)}px">${l}</span>`).join('');
  el.innerHTML = `
    <div class="shadow cast"></div>
    <div class="shadow contact"></div>
    <div class="note-paper">
      <div class="ink ink--${font}" style="--ink-rot:${between(r, -4, 3).toFixed(2)}deg">${lines}</div>
      <div class="paper-grain"></div><div class="note-shade"></div>
    </div>`;
  return el;
}

export function plate({ x, y, w = 86, h = 136 }) {
  const el = document.createElement('div');
  el.className = 'item plate';
  Object.assign(el.dataset, { lift: 1.8, liftTop: 1.8, shadowK: 1.1 });
  place(el, x, y, w, h, 0);
  el.innerHTML = `
    <div class="shadow cast"></div>
    <div class="shadow contact"></div>
    <div class="plate-face"><i class="screw" style="--sr:38deg"></i><i class="screw" style="--sr:-71deg"></i></div>`;
  return el;
}

function place(el, x, y, w, h, rot) {
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  el.style.setProperty('--rot', `${rot}deg`);
  Object.assign(el.dataset, { x, y, w, h, rot });
}

// ---------- tape ----------

// Tape pieces are positioned in stage space (not inside the rotated sheet) so
// mix-blend-mode: multiply reaches both the paper and the wall behind it.
function tapeSpec(kind, x, y, w, h, rot, seed) {
  if (!kind) return [];
  const r = rng(`${seed}|tape`);
  const specs = [];
  const at = (u, v, len, angle) => specs.push({ u, v, len, angle, seed: `${seed}|${u}|${v}` });
  if (kind === 'top') at(between(r, 0.38, 0.62), 0, between(r, 64, 86), between(r, -4, 4));
  if (kind === 'corners') { at(0.03, 0.01, between(r, 46, 58), between(r, -44, -36)); at(0.97, 0.01, between(r, 46, 58), between(r, 36, 44)); }
  if (kind === 'top-left') at(0.1, 0.01, between(r, 50, 62), between(r, -40, -30));
  if (kind === 'top-right') at(0.9, 0.01, between(r, 50, 62), between(r, 30, 40));
  // convert sheet-local (u,v) to stage coordinates through the sheet rotation
  const cx = x + w / 2, cy = y + h / 2, a = (rot * Math.PI) / 180;
  return specs.map((s) => {
    const lx = s.u * w - w / 2, ly = s.v * h - h / 2;
    return { ...s, cx: cx + lx * Math.cos(a) - ly * Math.sin(a), cy: cy + lx * Math.sin(a) + ly * Math.cos(a), angle: s.angle + rot };
  });
}

export function tape({ cx, cy, len, angle, seed, width = 19 }) {
  const el = document.createElement('div');
  el.className = 'tape';
  Object.assign(el.style, { left: `${cx - len / 2}px`, top: `${cy - width / 2}px`, width: `${len}px`, height: `${width}px` });
  el.style.setProperty('--tape-rot', `${angle}deg`);
  const r = rng(seed);
  el.style.setProperty('--crepe-x', `${Math.round(r() * 200)}px`);
  el.innerHTML = `<i style="clip-path:${tornEnds(len, width, r)}"></i>`;
  return el;
}

// Hand-torn ends: irregular sawtooth, 6–9 teeth, 0.5–4.5px deep, slight slant.
function tornEnds(len, width, r) {
  const end = (xBase, dir) => {
    const n = 6 + Math.floor(r() * 4), slant = between(r, -3, 3), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, depth = i % 2 ? between(r, 1.2, 3) : between(r, 0, 1);
      pts.push([xBase + dir * depth + slant * (t - 0.5), t * width]);
    }
    return pts;
  };
  const right = end(len, -1), left = end(0, 1).reverse();
  return `polygon(${[...right, ...left].map(([px, py]) => `${px.toFixed(1)}px ${py.toFixed(1)}px`).join(',')})`;
}

// ---------- light ----------

// Projects each item's shadow from the point light. The cast shadow is an affine
// stretch of the silhouette: the top edge (h = liftTop) barely moves, the bottom
// edge (h = lift) moves by lift * direction — so shadows fan out where paper lifts.
export function applyLight(items) {
  for (const el of items) {
    const d = el.dataset;
    const w = +d.w, h = +d.h, rot = (+d.rot * Math.PI) / 180;
    const lift = +d.lift * (+d.hover ? 2.2 : 1), top = +d.liftTop;
    const cx = +d.x + w / 2, cy = +d.y + h / 2;
    // direction of shadow displacement per px of height, in stage space
    let dx = (cx - light.x) / light.z, dy = (cy - light.y) / light.z;
    // rotate into the item's local frame (the shadow lives inside the rotated item)
    [dx, dy] = [dx * Math.cos(rot) + dy * Math.sin(rot), -dx * Math.sin(rot) + dy * Math.cos(rot)];

    const cast = el.querySelector('.shadow.cast');
    const contact = el.querySelector('.shadow.contact');
    const c = (dx * (lift - top)) / h, sy = 1 + (dy * (lift - top)) / h;
    // a curled note is foreshortened; its shadow widens at the bottom the same way
    const curl = el.classList.contains('note') ? ` perspective(520px) rotateX(${parseFloat(getComputedStyle(el).getPropertyValue('--curl')) * (+d.hover ? 2.2 : 1)}deg)` : '';
    cast.style.transform = `translate(${(dx * top).toFixed(2)}px, ${(dy * top).toFixed(2)}px) matrix(1, 0, ${c.toFixed(4)}, ${sy.toFixed(4)}, 0, 0)${curl}`;
    el.style.setProperty('--cast-blur', `${(lift * light.size).toFixed(2)}px`);
    // shadows get lighter as they get softer (same energy spread wider)
    el.style.setProperty('--cast-alpha', Math.min(0.6, (0.1 + 0.9 / (4 + lift)) * +(d.shadowK || 1) * light.strength).toFixed(3));
    contact.style.transform = `translate(${(dx * top * 1.4).toFixed(2)}px, ${(dy * top * 1.4 + 0.3).toFixed(2)}px)`;
  }
}

// Hover = the free edge lifts off the wall (tape/adhesive still holds the top).
export function interact(items) {
  for (const el of items) {
    if (!el.matches('.sheet, .note')) continue;
    const set = (v) => { el.dataset.hover = v; applyLight([el]); };
    el.addEventListener('pointerenter', () => set(1));
    el.addEventListener('pointerleave', () => set(0));
  }
}
