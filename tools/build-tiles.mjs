// Render each zoom tier of the sketch map to images (strokes only — lettering stays
// live in the browser), plus the label data.   node tools/build-tiles.mjs
// Then: python3 tools/slice-tiles.py  (cuts the renders into 256 px WebP tiles)

import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { drawMap, composeSVG, extractLabels, introGuides, createGeo, FRAME } from '../js/map/sketch-map.js';
import { terrainFrom } from '../js/map/terrain.js';
import { TIERS, labelRule } from '../js/map/tiers.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tiles');
const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive: true });

const SEED = process.env.MAP_SEED || 'marco';
// aged paper: warm cream sheet, warm graphite, faded red pencil (must match the viewer's --paper)
const COLORS = { ink: '#37332e', paper: '#ebe7dd', red: '#b8432f', green: '#5f8c4e' }; // green: crayon for fertile valleys

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/afghanistan.json')));
const terrain = terrainFrom(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/afg-elevation.json'))));

console.time('draw');
// photo stops: their cairns are the markers there, so the drawing leaves those places unmarked
const stops = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/photos.json'))).stacks.filter((s) => s.precision !== 'hidden').map((s) => [s.lon, s.lat]);
const parts = drawMap(data, { seed: SEED, terrain, parts: true, flaws: true, stops, layers: { terrain: true, towns: true, wakhan: true, waters: true } });
console.timeEnd('draw');

for (const tier of TIERS) {
  for (let z = tier.native[0]; z <= tier.native[1]; z++) {
    const scale = 2 ** z;
    // keep the paper tooth the same size on screen at every zoom
    const svg = composeSVG(parts, { layers: tier.layers, text: false, grain: scale, colors: COLORS });
    const t = Date.now();
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(FRAME.w * scale) }, background: 'rgba(0,0,0,0)' }).render().asPng();
    fs.writeFileSync(path.join(RAW, `${tier.id}_${z}.png`), png);
    console.log(`${tier.id} z${z}  ${Math.round(FRAME.w * scale)}×${Math.round(FRAME.h * scale)}  ${(png.length / 1e6).toFixed(1)} MB  ${Date.now() - t} ms`);
  }
}

// ---- opening scene: the whole-map drawing split into 'plates' the viewer reveals one
// after another with pencil/brush masks, plus the guide lines those masks follow.
// Plates keep the tier's layer order, so stacked they are pixel-identical to t0.
export const PLATES = { outline: ['surround', 'erased', 'border'], water: ['oases', 'rivers'], relief: ['deserts', 'foothills', 'mountains', 'highlands', 'hills'], marks: ['landmarks', 'trip', 'places', 'labels', 'compass', 'scale'] };
const PLATE_SCALE = 1.5;
for (const [name, layers] of Object.entries(PLATES)) {
  const svg = composeSVG(parts, { layers, text: false, grain: PLATE_SCALE, colors: COLORS });
  fs.writeFileSync(path.join(RAW, `intro_${name}.png`), new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(FRAME.w * PLATE_SCALE) }, background: 'rgba(0,0,0,0)' }).render().asPng());
}
const thin = (pts, d = 7) => { const o = [pts[0]]; for (const p of pts) if (Math.hypot(p[0] - o.at(-1)[0], p[1] - o.at(-1)[1]) >= d) o.push(p); if (o.at(-1) !== pts.at(-1)) o.push(pts.at(-1)); return o.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]); };
const G = introGuides(data, createGeo({ frame: FRAME, seed: SEED, flaws: true }));
const guides = { plates: Object.keys(PLATES), scale: PLATE_SCALE, border: G.border.map((l) => thin(l)), rivers: G.rivers.map((l) => thin(l)), ridges: G.ridges.map((l) => thin(l, 4)), hills: thin([...G.hills, ...parts.highlandPts.filter((_, i) => i % 2 === 0)], 0), deserts: thin(G.deserts, 0), marks: thin(G.marks, 0) };
fs.writeFileSync(path.join(OUT, 'intro.json'), JSON.stringify(guides));
console.log(`intro plates ×${Object.keys(PLATES).length} + guides → tiles/intro.json`);

const labels = extractLabels(parts).map((l) => ({ ...l, x: +l.x.toFixed(1), y: +l.y.toFixed(1), ...labelRule(l) }));
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify({ seed: SEED, frame: FRAME, tiers: TIERS, labels }, null, 1));
console.log(`${labels.length} labels → tiles/map.json`);
