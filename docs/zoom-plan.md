# Two-level zoom for the sketch map — feasibility & plan

**Ask:** the map zooms like a real map, but only one level deeper. Zooming in reveals
and re-renders detail; users can drag within a bounded area; labels and sizes re-adjust
per level; the whole thing feels smooth.

**Verdict: feasible, and a good fit for how the map is already built.** The drawing is
generated from geodata + elevation through one coordinate system (`geo.js`), so a second,
more detailed level is "the same generator, more features, higher resolution" — exactly
what the Wakhan sheet already proves for one region.

---

## Recommended: progressive disclosure (supersedes the hard two-level swap below)

The map is already built as independent layers, so instead of swapping level 0 → level 1,
zoom is continuous (1× → ~3×) and **each layer carries a zoom range where it fades in**:

| Zoom | Reveals | Feel |
|---|---|---|
| 1× | border, main rivers, mountain chains, 8 places, landmarks, route, compass | the sketch at arm's length |
| ~1.5× | terrain hachures, foothills, secondary rivers, lakes | leaning in — the ground gets texture |
| ~2× | towns, passes, Wakhan valley detail, peak heights | reading the map |
| ~2.5–3× | small notes, doodles, place facts, pin captions | the margins |

- Each tier fades over a range (e.g. hachures 0 → 1 between 1.3× and 1.7×) — nothing pops.
- **Strokes behave like paper** (scale with zoom, rendered at the tier's resolution so they
  sharpen); **labels & pins behave like a map** (near-constant screen size, re-placed per
  tier with priorities); **tiny notes act as fine handwriting** — faint and unreadable at 1×,
  fading into legibility.
- Each tier = its own transparent tile set, generated only at the zooms where it's visible.
- Labels carry `minZoom` + `priority`; the collision placer runs at tier boundaries, not per frame.
- Layers to split: rivers (main / minor), places (major / minor), Wakhan (outline / interior).
- The corner Wakhan sheet becomes unnecessary: zooming into the Wakhan reveals it in place.

## Levels (original two-level idea, kept for reference)

| | Level 0 — country | Level 1 — detail (≈3×) |
|---|---|---|
| Frame | 2000 × 1300 | 6000 × 3900 |
| Scale | ~1 px/km | ~3 px/km |
| Drawn | border, main rivers, ranges, 8 places, landmarks, route | + terrain hachures from elevation everywhere, secondary rivers & towns, passes, lakes, more landmarks & notes, the Wakhan in full |
| Labels | ~25 | ~120, placed without collisions |

Both levels use the **same** `toMap/fromMap`, so pins, photos and the route line up across levels.

## How it renders (the part that makes it smooth)

1. **Bake the drawing into image tiles at build time.** A Node script generates each level's
   SVG once (deterministic seed, so strokes are continuous across tile edges), headless
   Chrome rasterises it, and it's cut into 512 px WebP tiles at 1× and 2× pixel density.
   - Why: the live SVG is already ~3 MB at level 0 with heavy filters; level 1 would be
     10×+. As images, panning and zooming are just GPU-composited bitmaps.
2. **Labels stay live**, as an SVG/DOM layer above the tiles, not baked in:
   - crisp at any zoom, re-laid out per level (the collision placer from the Wakhan sheet),
   - fonts keep a constant on-screen size during zoom (counter-scaled), then swap to the
     level's label set,
   - selectable/accessible, and the same layer will hold pins.
3. **Only visible tiles load.** Level 1 at 2× would be ~94 million pixels if fully decoded —
   too much for phones — so tiles load when they enter the viewport and are released after.

## The zoom interaction

- **In:** scroll/pinch/double-click/`+`, zooming toward the pointer.
  1. the camera animates (transform only, ~450 ms, weighted easing like the intro) using the
     level-0 image scaled up,
  2. level-1 tiles for the viewport fade in over ~250 ms as they arrive, so detail
     **appears to be drawn in** — hachures and small labels arriving last,
  3. labels cross-fade from the level-0 to the level-1 set.
- **Out:** the reverse; level-0 labels return.
- **Only two levels:** zoom is snapped — no in-between states, no level 2.
- **Drag:** pointer/touch drag with a little inertia; clamped to the map's bounds with a soft
  rubber-band at the edges. At level 0 there's nothing to pan if the map fits the screen.
- **Keyboard:** `+`/`-` zoom, arrow keys pan, `0` resets. Reduced motion → instant cuts.
- **Mobile:** pinch to zoom, one-finger drag; the page doesn't scroll while you're dragging the map.

## Open decisions

1. **How the map and the photo wall relate.** Today the map is planned as the wall's
   background, and clicking a photo already zooms the camera to it. Two zoom behaviours on one
   surface will fight. Options:
   - **A.** Map zoom is its own mode ("Explore the map" button); photo close-ups work only at level 0.
   - **B.** Photos are pinned to places; at level 1 they shrink to small thumbnails on their pins.
   - **C.** The map and the photo wall are separate sections of the page.
2. **Does the Wakhan corner sheet stay** as a hand-drawn "detail" at level 0, or does level 1
   replace it (zoom into the Wakhan and it's all there)?

## Build order

1. Spike: level-1 render of the Wakhan region only + zoom/drag/label-swap interaction →
   check the feel before investing in country-wide detail.
2. Tile build script (SVG → headless Chrome → WebP tiles, 1×/2×).
3. Country-wide level-1 content (terrain hachures everywhere, towns, passes).
4. Label layer with per-level collision placement; pins plug in here later.
5. Performance pass on a mid-range phone.

## Risks

| Risk | Mitigation |
|---|---|
| Level 1 looks blurry mid-zoom (upscaled level 0) | keep the animation short; tiles fade in the moment they're ready; preload tiles around the pointer on hover/pinch-start |
| Big tile payload | WebP, 512 px tiles, lazy per viewport; level 1 only fetched on first zoom |
| Hand-drawn strokes cut at tile seams | render the whole level as one SVG, then slice — never draw per tile |
| Labels crowding at level 1 | collision placer with priorities; low-priority labels simply don't appear |
| Map zoom vs photo close-up conflict | decision 1 above |
