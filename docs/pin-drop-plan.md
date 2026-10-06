# Pin drop on the sketch map — technical plan

**Goal:** keep the map looking hand-drawn and imperfect, but make it a real coordinate
system underneath. Given any `lat, lon`, a pin must land in the right place *relative
to what's drawn* — on the drawn Bamiyan, in the drawn Wakhan valley — and clicking the
map must give back a `lat, lon`.

**Verdict: feasible.** The sketch is generated from real geodata, so every drawn stroke
already goes through a projection. The key is to make that projection — including the
deliberate "drawn from memory" distortion — one deterministic, invertible function, and
to route pins through exactly the same function.

---

## 1. One coordinate pipeline, used by everything

```
lat, lon (WGS84)
  → project()      equirectangular, cos(34°) — analytic, invertible
  → handWarp()     the "traveller flaws": tilt, stretch, enlarged Kabul–Bamiyan, gentle wobble
  → map px         the 2000 × 1300 drawing frame
  → stage px       where the map sits on the wall (+ bleed)
  → screen px      camera transform (intro / close-up zoom)
```

- A single module, `js/map/geo.js`, exports `toMap(lat, lon)` and `fromMap(x, y)`.
- The sketch renderer, the landmarks, the route **and** the pins all call `toMap`. Nothing
  projects on its own. (Today `drawMap` builds its warped `P` internally — step 1 of the work
  is lifting that out.)
- Because pins and drawing share the same distortion, **a pin is "wrong" in exactly the
  same way the drawing is** — so it looks right. The Bamiyan pin sits on the drawn Bamiyan X,
  even though the drawn Bamiyan is a few km off in true geography. That's the whole trick.

## 2. Imperfection that stays invertible

The flaws must be smooth, fold-free and seeded:

| Flaw | Kind | Invertible? |
|---|---|---|
| Tilt, uneven stretch | affine | analytic inverse |
| Enlarged "known" area | radial smooth bump (≤ 16%) | numeric (see below) |
| Low-frequency wobble (≤ ~25 px) | smooth sine field | numeric |
| Stroke jitter, gaps, smudges, lettering | **drawing-only**, not part of the coordinate system | n/a — never moves pins |

- **Rule:** the warp's gradient stays well under 1 (currently ≤ ~0.08 for the wobble; the bump's
  radial stretch stays between ~0.93× and 1.16×), so the mapping never folds and every map point has exactly one lat/lon.
- `fromMap` inverts the warp numerically (fixed-point / Newton, 3–5 iterations from the
  un-warped guess), then inverts the projection analytically.
- **Seed is frozen** in config (`MAP_SEED`). Re-rolling the "hand" moves the drawing, but pins
  follow automatically because they're stored as lat/lon, never as pixels.
- Stroke-level wobble (±2–4 px) is cosmetic noise *around* the true line. It's the only
  mismatch between pin and drawing, and it's ~3 km at wall scale — invisible.

## 3. Pins are data, not drawing

```jsonc
// data/pins.json
{ "id": "bamiyan-niches", "lat": 34.832, "lon": 67.826,
  "title": "The Buddha niches", "date": "2026-10-12",
  "kind": "stop | photo | camp | note",
  "photos": ["img/bamiyan-01.jpg"], "note": "cold at dawn",
  "precision": "exact | approx | hidden" }
```

- Rendered in their own layer **above** the pencil-filtered map group, so adding or moving a
  pin never re-rasterises the heavy sketch.
- Pins are DOM/SVG elements: clickable, keyboard-focusable, labelled for screen readers.
- Each pin is drawn in the same sketch style (hand-drawn triangle / X / red pencil pin),
  seeded by its `id`, so it looks hand-made but stays stable between visits.

## 4. Ways to drop a pin

1. **By coordinates** — add a row to `pins.json` (or later a small admin form).
2. **By clicking** — an edit mode (local only): click the map → `fromMap` → lat/lon shown,
   copy or save.
3. **From your photos** — a build script reads GPS from photo EXIF (e.g. `exifr`) and creates
   pins automatically, grouped by day. Most phone photos from the trip will already carry
   coordinates.

## 5. Precision and scale

- At full-wall view: ~108 px per degree of latitude, **~1 px per km**. City-level pins read cleanly;
  pins closer than ~6 km overlap → cluster them into one hand-drawn "3 stops" note.
- In a close-up (camera zoom ~3–4×): ~0.2 km per px.
- For street-level precision (a specific guesthouse), use **detail sheets**: small sketch maps
  of a region — the Wakhan, Bamiyan valley, Kabul — each with its own bbox and frame, running
  **through the same pipeline**. The Wakhan inset is the first of these, so it doubles as the
  proof of the multi-scale approach.

## 6. Linking photos to places

- A photo sheet can reference a `pinId`. The layout places it near its pin and draws a loose
  pencil leader line (or a string) from the paper to the spot — like the site-plan reference.
- A simple overlap solver nudges sheets apart; the pin stays fixed.

## 7. Safety & privacy (important for this trip)

- Exact coordinates in Afghanistan can expose people and hosts. Support `precision`:
  `exact`, `approx` (snapped to ~10 km, shown as a loose circle), or `hidden` (not published).
- **Strip EXIF GPS from published images** — the pin data should be the only published
  location, and you control its precision.
- Consider publishing with a delay (after you've left an area).

## 8. How we'll know it works

- **Round-trip test:** `fromMap(toMap(p)) ≈ p` within 0.001° for a grid of points across the country.
- **Landmark test:** the pins for Kabul, Herat, Bamiyan, Mazar and Kandahar land within 1 px of
  their drawn X marks, with flaws on.
- **Border test:** random points inside Afghanistan stay inside the drawn border (± stroke jitter).
- **Visual check:** headless-Chrome screenshots of the map with pins, run after every change.

## 9. Build order

1. Extract `geo.js` (`toMap` / `fromMap`), make `drawMap` use it; add round-trip + landmark tests.
2. Pin layer + sketch pin glyph + `pins.json` (a few sample pins).
3. Edit mode: click → lat/lon readout, copy-to-clipboard.
4. Wakhan detail sheet (first multi-scale sheet, same pipeline).
5. EXIF import script + precision/privacy handling.
6. Photo sheets anchored to pins with leader lines.

## Risks

| Risk | Mitigation |
|---|---|
| Warp too strong → folds, ambiguous clicks | cap warp gradient; test the Jacobian over the grid |
| Pins pile up in cities | clustering at wall scale; detail sheets for close-ups |
| Seed change moves the drawing | pins stored in lat/lon, never pixels; seed frozen in config |
| Heavy SVG filters slow re-render | pins in a separate unfiltered layer; map re-rendered only on seed change |
| Publishing sensitive locations | `precision` field, EXIF stripping, optional delay |
