---
name: map-build
description: Rebuild the Afghanistan sketch map's generated assets — baked zoom-tier tiles, live label data (tiles/map.json), and optionally the source geodata and elevation grid. Use this after ANY change to js/map/*.js, js/map/tiers.js, or the data tools, whenever the user says the map "didn't change", or before taking screenshots of the explore viewer. Also covers the build's known pitfalls so you don't rediscover them.
---

# Map build

The explore viewer (`index.html`) shows **pre-baked tiles**, so edits to the drawing code
are invisible until you rebuild. (`spike/map-lab.html` renders live and needs no rebuild.)

## One command
```bash
bash .claude/skills/map-build/scripts/rebuild.sh          # tiles + labels, ~40 s
bash .claude/skills/map-build/scripts/rebuild.sh --data   # also rebuild data/afghanistan.json + data/afg-elevation.json
```
It syntax-checks `js/map/*.js`, runs the coordinate test, renders every tier × zoom with resvg,
writes `tiles/map.json` (labels), clears old tiles, slices 256 px WebP tiles. Expect roughly
"~790 tiles, ~8 MB" and "~75 labels", plus "intro plates ×4".

## Pipeline (for when something breaks)
1. `tools/build-map-data.py` → `data/afghanistan.json` (Natural Earth 10m in `data/raw/`; downloads are cached there).
2. `tools/build-elevation.py` → `data/afg-elevation.json` (AWS Terrain Tiles z7, cached in `data/raw/terrain/`).
3. `tools/build-tiles.mjs` → `tiles/raw/<tier>_<z>.png` + `tiles/map.json`
   (`drawMap(..., {parts:true})` → `composeSVG` per tier with `text:false`, `grain: 2^z`, literal colours).
4. `tools/slice-tiles.py` → `tiles/<tier>/<z>/<x>/<y>.webp` (empty tiles skipped; viewer uses a blank fallback).

## Known pitfalls
- **Never hide build output** (`>/dev/null`) — a JS error (e.g. `Assignment to constant variable`)
  then looks like success and you screenshot stale tiles.
- resvg has **no CSS variables**: `composeSVG` replaces `var(--ink|paper|red)` via `colors`. New colours
  need adding to `COLORS` in `build-tiles.mjs` — and must match the viewer's `:root` (see `sketch-map`).
- Only layers listed in `js/map/tiers.js` are baked. A new layer that "doesn't show" is usually missing there.
- **Testing positions/labels fast**: don't loop full builds (~40 s each). Draw with `drawMap(..., {parts:true})` and read
  `extractLabels(parts)` in a one-off node script (a few seconds) — e.g. to see which Wakhan labels a doodle pushes out.
  The Wakhan is crowded: Qala-e Panja, Broghil Pass and "road ends here!" don't fit even without doodles.
- When scripting edits in a shell loop, `node --input-type=module --check` the file after each edit — a broken edit plus
  hidden build output silently leaves the old tiles/labels in place.
- Label changes (text/position/rule) only need the rebuild too — labels come from `tiles/map.json`.
- Switched-off layers (`trip`, `route`) are off via `drawMap` defaults, so their labels aren't extracted either;
  turn one on by passing it in the `layers` option in `build-tiles.mjs` (and add it to a `PLATES` group for the opening).
- Tiles are cached by URL: after a rebuild, the user must hard-refresh (Cmd+Shift+R) — blank rectangles in their
  screenshot right after a rebuild are stale tiles, not a bug.
- Seed: `MAP_SEED` env var (default `marco`). Changing it moves every stroke; pins are unaffected (lat/lon).
- Dependencies: `npm install` (only `@resvg/resvg-js`), Python 3 with Pillow.

The build also writes the opening scene's assets: `tiles/intro/{outline,water,relief,marks}.webp` (t0 split into plates, ~0.9 MB) and `tiles/intro.json` (guide lines). They're regenerated with the tiles; nothing extra to run.
