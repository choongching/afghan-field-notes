// Opening scene: "Lights on, walk up to the wall". One continuous take, ~6s.
//
//   0.0  dark, wide shot from across the room; waits for fonts/images (max 2.5s)
//   0.4  fluorescent tube flickers on (2 flashes, modest contrast: WCAG 2.3.1 safe)
//   1.1  auto-exposure overshoots a touch, then settles
//   1.1  hold the establishing shot so the eye can read the whole wall
//   1.9  slow push-in to the final frame (slow in, long slow out, no bounce)
//   5.2  follow-through: air pushed ahead of the approach lifts a couple of notes
//
// Only transform/opacity are animated. Chrome rasterizes a compositor transform
// animation at its maximum scale (1×), so the wall stays crisp as we approach.

const EASE_DOLLY = 'cubic-bezier(.55,0,.12,1)';   // mass: reluctant start, long settle
const EASE_DRIFT = 'cubic-bezier(.4,0,.6,1)';

const STAGE_W = 2000;

export function intro({ camera, stage, notes }) {
  const html = document.documentElement;
  const lights = document.querySelector('.lights');
  const exposure = document.querySelector('.exposure');
  const vignette = document.querySelector('.vignette');
  const cue = document.querySelector('.cue');
  const replay = document.querySelector('.replay');
  let running = [];
  let done = true;

  replay.hidden = false;
  replay.addEventListener('click', (e) => { e.stopPropagation(); play(); });

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // camera pose → transform. Frames stage point (px,py) at viewport point (vx,vy).
  const pose = ({ px, py, zoom, rot = 0, vx, vy, clamp = true }) => {
    const s = camera.clientWidth / STAGE_W;
    const W = innerWidth, H = Math.min(innerHeight, camera.clientHeight);
    vx ??= W * 0.6; vy ??= H * 0.5;
    // never let the lens run off the wall
    let tx = vx - zoom * px * s, ty = vy - zoom * py * s;
    if (clamp) { tx = Math.min(0, Math.max(W - zoom * s * STAGE_W, tx)); ty = Math.min(0, ty); }
    return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot}deg) scale(${zoom})`;
  };

  function play() {
    stopAll();
    done = false;
    html.classList.add('intro');
    try { sessionStorage.setItem('intro-seen', '1'); } catch {}
    addSkip();

    if (reduced()) {
      // no flicker, no camera move: a simple fade up
      running.push(lights.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }));
      running[0].finished.then(finish).catch(() => {});
      return;
    }

    const mobile = innerWidth < 700;
    const k = mobile ? 0.8 : 1; // shorter film on phones
    const T = (ms) => ms * k;
    const total = T(6200);
    const far = mobile ? 0.7 : 0.58;

    // the camera: establishing shot from across the room, hold, then walk up to the wall
    const wide = pose({ px: 1000, py: 600, zoom: far, rot: -0.35, vx: innerWidth / 2, vy: innerHeight * 0.48, clamp: false });
    const cam = camera.animate([
      { offset: 0,               transform: wide, easing: 'linear' },
      { offset: T(1900) / total, transform: wide, easing: EASE_DOLLY },
      { offset: T(5300) / total, transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
      { offset: 1,               transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
    ], { duration: total, fill: 'both' });

    // the tube: two uneven flickers, then on
    const L = (ms) => T(ms) / total;
    const light = lights.animate([
      { offset: 0, opacity: 1 },
      { offset: L(400), opacity: 1 },
      { offset: L(470), opacity: 0.38 },
      { offset: L(540), opacity: 0.9 },
      { offset: L(760), opacity: 0.9 },
      { offset: L(820), opacity: 0.22 },
      { offset: L(880), opacity: 0.55 },
      { offset: L(1050), opacity: 0, easing: 'ease-out' },
      { offset: 1, opacity: 0 },
    ], { duration: total, fill: 'forwards' });

    // meter overshoot
    const meter = exposure.animate([
      { offset: 0, opacity: 0 },
      { offset: L(1050), opacity: 0 },
      { offset: L(1250), opacity: 0.22 },
      { offset: L(1700), opacity: 0, easing: 'ease-out' },
      { offset: 1, opacity: 0 },
    ], { duration: total, fill: 'forwards' });

    // tighter lens → heavier vignette; relaxes as we pull out
    const vig = vignette.animate([
      { offset: 0, opacity: 1 },
      { offset: L(1900), opacity: 1, easing: EASE_DOLLY },
      { offset: L(5300), opacity: 0.55 },
      { offset: 1, opacity: 0.55 },
    ], { duration: total, fill: 'forwards', composite: 'replace' });

    running = [cam, light, meter, vig];

    // follow-through: a draft from the step back
    const drafts = notes.slice(0, 2);
    const t1 = setTimeout(() => drafts.forEach((n, i) => setTimeout(() => n.classList.add('draft'), i * 140)), T(4900));
    const t2 = setTimeout(showCue, T(5600));
    running.push({ cancel: () => { clearTimeout(t1); clearTimeout(t2); } });

    watchFrames(cam);
    cam.finished.then(finish).catch(() => {});
  }

  // If the device can't hold the frame rate, don't make it suffer: cut to the end.
  function watchFrames(anim) {
    let n = 0, t0 = 0;
    const tick = (t) => {
      if (done) return;
      if (!t0) t0 = t;
      if (++n < 14) return requestAnimationFrame(tick);
      const avg = (t - t0) / (n - 1);
      if (avg > 45) { console.info(`[intro] ${avg.toFixed(0)}ms/frame — skipping to final frame`); skip(); }
    };
    requestAnimationFrame(tick);
  }

  function showCue() {
    cue.animate([{ opacity: 0, transform: 'translateX(-50%) rotate(-1.5deg) translateY(4px)' }, { opacity: 1, transform: 'translateX(-50%) rotate(-1.5deg)' }],
      { duration: 700, easing: 'ease-out', fill: 'forwards' });
    const hide = () => cue.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
    addEventListener('pointermove', hide, { once: true });
    setTimeout(hide, 6000);
  }

  // Any input: ease from wherever the camera is to the final frame in ~350ms.
  const SKIP_EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  function addSkip() { SKIP_EVENTS.forEach((e) => addEventListener(e, skip, { passive: true })); }
  function removeSkip() { SKIP_EVENTS.forEach((e) => removeEventListener(e, skip)); }

  function skip(e) {
    if (done) return;
    if (e?.target?.closest?.('.replay')) return;
    const from = getComputedStyle(camera).transform;
    const lightFrom = getComputedStyle(lights).opacity;
    stopAll();
    const a = camera.animate([{ transform: from }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
    lights.animate([{ opacity: lightFrom }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    running = [a];
    a.finished.then(finish).catch(() => {});
  }

  function stopAll() {
    running.forEach((a) => a.cancel());
    running = [];
    notes.forEach((n) => n.classList.remove('draft'));
  }

  function finish() {
    done = true;
    removeSkip();
    running.forEach((a) => a.cancel());
    running = [];
    camera.style.transform = '';
    lights.getAnimations().forEach((a) => a.cancel());
    vignette.getAnimations().forEach((a) => a.cancel());
    html.classList.remove('intro', 'filming'); // stage re-rasterizes crisp at 1×
  }

  return { play, shouldPlay: html.classList.contains('intro') };
}

// Don't film an empty set: wait for fonts and on-screen images, capped.
export function ready(cap = 2500) {
  const imgs = [...document.images].slice(0, 12).map((i) => i.decode().catch(() => {}));
  return Promise.race([
    Promise.all([document.fonts.ready, ...imgs]),
    new Promise((r) => setTimeout(r, cap)),
  ]);
}
