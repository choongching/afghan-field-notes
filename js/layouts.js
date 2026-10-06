// Print layouts for the sheets on the wall. Photos are placeholders (picsum, seeded)
// until the real trip photos drop in — swap `photo()` to point at local files.

import { rng } from './engine.js';

// requested at 2× so a page still holds up when the camera pushes in on it
export const photo = (seed, w = 600, h = 400) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w * 2}/${h * 2}`;

const WORDS = 'the morning ferry left before light and we followed the coast road past shuttered cafes salt on the windows a dog asleep on warm stone markets opening one awning at a time fish on ice oranges in pyramids old men arguing about football in the square we walked until the streets ran out and the sea began again bells somewhere up the hill a bus that never came bread still warm in paper bags night trains humming through small stations light falling sideways across the harbour'.split(' ');

export function lorem(seed, words = 120) {
  const r = rng(seed);
  let out = '', cap = true;
  for (let i = 0; i < words; i++) {
    let w = WORDS[Math.floor(r() * WORDS.length)];
    if (cap) { w = w[0].toUpperCase() + w.slice(1); cap = false; }
    out += w;
    if (r() < 0.09) { out += '. '; cap = true; } else if (r() < 0.06) out += ', '; else out += ' ';
  }
  return out.trim().replace(/[ ,]*$/, '.');
}
const paras = (seed, n, words) => Array.from({ length: n }, (_, i) => `<p>${lorem(`${seed}${i}`, words)}</p>`).join('');

export const layouts = {
  cover: ({ seed, title, sub, issue = 'AUTUMN 2026' }) => `
    <div class="l-cover">
      <img class="photo" src="${photo(seed, 540, 700)}" alt="">
      <div class="l-cover__issue">${issue}</div>
      <h2 class="l-cover__title">${title}</h2>
      <div class="l-cover__sub">${sub}</div>
    </div>`,

  feature: ({ seed, kicker, title, dek }) => `
    <div class="l-feature">
      <img class="photo" src="${photo(seed, 600, 420)}" alt="">
      <div class="kicker">${kicker}</div>
      <h2>${title}</h2>
      <div class="dek">${dek}</div>
      <div class="cols">${paras(seed, 3, 40)}</div>
    </div>`,

  print: ({ seed, caption, n }) => `
    <div class="l-print">
      <img class="photo" src="${photo(seed, 520, 620)}" alt="">
      <div class="l-print__cap"><span>${n ?? ''}</span>${caption}</div>
    </div>`,

  contact: ({ seed, title = 'Contact sheet', count = 12 }) => `
    <div class="l-contact">
      <div class="l-contact__head"><b>${title}</b><span>ROLL ${seed.slice(-2).toUpperCase()}</span></div>
      <div class="l-contact__grid">${Array.from({ length: count }, (_, i) =>
        `<figure><img class="photo" src="${photo(`${seed}-${i}`, 200, 150)}" alt=""><figcaption>${String(i + 1).padStart(2, '0')}</figcaption></figure>`).join('')}</div>
    </div>`,

  essay: ({ seed, title, quote }) => `
    <div class="l-essay">
      <h2>${title}</h2>
      <div class="byline">Words &amp; photographs by the traveller</div>
      <div class="cols">${paras(seed, 2, 55)}<blockquote>“${quote}”</blockquote>${paras(seed + 'b', 3, 45)}</div>
      <img class="photo l-essay__img" src="${photo(seed, 360, 240)}" alt="">
    </div>`,

  toc: ({ entries }) => `
    <div class="l-toc">
      <h2>Contents</h2>
      <ol>${entries.map(([t, p]) => `<li><span>${t}</span><i></i><b>${p}</b></li>`).join('')}</ol>
    </div>`,

  // a single image spanning several adjacent sheets: each sheet shows its slice
  spread: ({ seed, part, of, title, side }) => `
    <div class="l-spread" style="--part:${part};--of:${of}">
      <div class="photo l-spread__img" style="background-image:url(${photo(seed, 1400, 700)})"></div>
      ${title ? `<h2 class="l-spread__title l-spread__title--${side || 'left'}">${title}</h2>` : ''}
      ${part === of - 1 ? `<div class="l-spread__text cols">${paras(seed, 2, 38)}</div>` : ''}
    </div>`,

  polaroid: ({ seed, caption }) => `
    <div class="l-polaroid"><img class="photo" src="${photo(seed, 300, 300)}" alt=""><div>${caption}</div></div>`,
};
