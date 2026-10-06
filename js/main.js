import { installTextures } from './textures.js';
import { sheet, note, tape, applyLight, interact } from './engine.js';
import { sheets, notes } from './wall-data.js';
import { intro, ready } from './intro.js';
import { focusable } from './focus.js';

const STAGE = { w: 2000, h: 1300 };
installTextures(document.documentElement, STAGE);

const stage = document.getElementById('stage');
const falloff = stage.querySelector('.falloff');
const add = (el) => stage.insertBefore(el, falloff);

const items = [], sheetEls = [];
for (const s of sheets) {
  const el = sheet(s);
  items.push(el); sheetEls.push(el); add(el);
  for (const t of el._tapes) add(tape(t));
}
// sticky notes are switched off (the user asked for a clean wall); the data and
// builder stay in wall-data.js / engine.js in case they come back
const SHOW_NOTES = false;
const noteEls = SHOW_NOTES ? notes.map((n) => add(note(n))) : [];
items.push(...noteEls);

applyLight(items);
interact(items);

// Scale the whole wall like a photograph: fit width, keep the composition intact.
const viewport = document.getElementById('viewport');
const fit = () => {
  const s = Math.max(viewport.clientWidth, 320) / STAGE.w;
  stage.style.transform = `scale(${s})`;
  viewport.style.height = `${STAGE.h * s}px`;
};
addEventListener('resize', fit);
fit();

// Opening scene. Draft notes = the loose cluster on the left (free, nothing on top).
const scene = intro({
  camera: document.getElementById('camera'),
  stage,
  notes: noteEls.filter((n) => +n.dataset.x < 260 && +n.dataset.y > 500),
});
if (scene.shouldPlay) ready().then(scene.play);

// Close-ups: click a page to walk up to it.
focusable({ camera: document.getElementById('camera'), viewport, sheets: sheetEls });
