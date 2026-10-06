// Close-ups: click a page and the camera walks up to it. Same camera language as
// the intro — weighted easing, no bounce, the frame levels itself to the paper.
//
//   click / Enter      push in to the page (spreads frame as one unit)
//   ← / →              dolly along the wall to the previous / next page
//   Esc, wall, scroll  step back to the full wall

const STAGE_W = 2000;
const EASE_IN = 'cubic-bezier(.5,0,.12,1)';   // walking up: reluctant start, soft landing
const EASE_PAN = 'cubic-bezier(.45,0,.2,1)';  // moving along the wall
const HOME = 'translate(0px, 0px) rotate(0deg) scale(1) translate(0px, 0px)';

export function focusable({ camera, viewport, sheets }) {
  const html = document.documentElement;
  const vignette = document.querySelector('.vignette');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One stop per page, or per spread. Reading order = order on the wall.
  const stops = [];
  for (const el of sheets) {
    const g = el.dataset.group;
    const existing = g && stops.find((s) => s.group === g);
    if (existing) existing.els.push(el); else stops.push({ group: g, els: [el] });
  }
  for (const stop of stops) {
    const label = stop.els.map((el) => el.querySelector('h2')?.textContent || el.querySelector('.l-print__cap')?.textContent).find(Boolean);
    stop.els.forEach((el) => el.setAttribute('aria-label', `Look closer${label ? `: ${label.trim()}` : ''}`));
  }

  let current = -1, anim = null;

  function frame(stop) {
    const s = camera.clientWidth / STAGE_W;
    const box = stop.els.reduce((b, el) => {
      const { x, y, w, h } = el.dataset;
      return { x0: Math.min(b.x0, +x), y0: Math.min(b.y0, +y), x1: Math.max(b.x1, +x + +w), y1: Math.max(b.y1, +y + +h) };
    }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const bw = (box.x1 - box.x0) * s, bh = (box.y1 - box.y0) * s;
    // leave air around the page: it should feel held up to the eye, not cropped
    const zoom = Math.min((innerHeight * 0.86) / bh, (innerWidth * 0.9) / bw);
    const cx = ((box.x0 + box.x1) / 2) * s, cy = ((box.y0 + box.y1) / 2) * s;
    const vx = innerWidth / 2;
    const vy = scrollY - viewport.offsetTop + innerHeight / 2;
    // level the frame most of the way to the paper; a hint of tilt stays human
    const rot = -(stop.els.reduce((a, el) => a + +el.dataset.rot, 0) / stop.els.length) * 0.8;
    return `translate(${vx.toFixed(1)}px, ${vy.toFixed(1)}px) rotate(${rot.toFixed(3)}deg) scale(${zoom.toFixed(4)}) translate(${(-cx).toFixed(1)}px, ${(-cy).toFixed(1)}px)`;
  }

  function move(to, duration, easing) {
    const from = getComputedStyle(camera).transform;
    const prev = anim;
    html.classList.add('filming');
    anim = camera.animate([{ transform: from === 'none' ? HOME : from }, { transform: to }],
      { duration: reduced() ? 1 : duration, easing, fill: 'forwards' });
    prev?.cancel();
    const mine = anim;
    mine.finished.then(() => { if (anim === mine) html.classList.remove('filming'); }).catch(() => {});
    return mine;
  }

  function go(i, { pan = false } = {}) {
    if (i < 0 || i >= stops.length) return;
    const first = current < 0;
    current = i;
    html.classList.add('focused');
    stops.forEach((s, j) => s.els.forEach((el) => el.classList.toggle('is-focus', j === i)));
    move(frame(stops[i]), pan && !first ? 850 : 1000, pan && !first ? EASE_PAN : EASE_IN);
    vignette.animate([{ opacity: getComputedStyle(vignette).opacity }, { opacity: 0.85 }], { duration: 900, fill: 'forwards' });
    stops[i].els[0].focus({ preventScroll: true });
  }

  function back() {
    if (current < 0) return;
    const el = stops[current].els[0];
    current = -1;
    html.classList.remove('focused');
    stops.forEach((s) => s.els.forEach((e) => e.classList.remove('is-focus')));
    const a = move(HOME, 850, EASE_IN);
    a.finished.then(() => { if (anim === a) { a.cancel(); anim = null; camera.style.transform = ''; } }).catch(() => {});
    vignette.animate([{ opacity: getComputedStyle(vignette).opacity }, { opacity: 0.55 }], { duration: 800, fill: 'forwards' });
    el.focus({ preventScroll: true });
  }

  const busy = () => html.classList.contains('intro'); // never fight the opening scene
  const stopOf = (el) => stops.findIndex((s) => s.els.includes(el));

  viewport.addEventListener('click', (e) => {
    if (busy()) return;
    if (e.target.closest('.note')) return;              // notes stay notes
    const el = e.target.closest('.sheet');
    if (!el) return back();                             // clicked the wall
    const i = stopOf(el);
    if (i === current) back(); else go(i, { pan: current >= 0 });
  });

  addEventListener('keydown', (e) => {
    if (busy()) return;
    if (e.key === 'Escape') return back();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.sheet')) {
      e.preventDefault();
      const i = stopOf(e.target);
      return i === current ? back() : go(i, { pan: current >= 0 });
    }
    if (current < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.min(stops.length - 1, current + 1), { pan: true }); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); go(Math.max(0, current - 1), { pan: true }); }
  });

  // scrolling means "I'm looking around again"
  addEventListener('wheel', () => { if (current >= 0) back(); }, { passive: true });
  addEventListener('resize', () => { if (current >= 0) move(frame(stops[current]), 1, 'linear'); });

  return { go, back };
}
