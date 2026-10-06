---
name: sketch-map
description: How the hand-drawn Afghanistan sketch map is built and how to change it without breaking its look, its zoom tiers or its coordinate system. Use this whenever the user asks to add, remove, move or restyle anything on the map — places, labels, mountains, hills, rivers, landmarks, doodles, notes, the Wakhan, the route, zoom reveal behaviour, pins, the opening/preloader animation, the photo stacks, the "Afghanistan, today" note — or mentions "the map", "sketch", "pencil", "tiers", "zoom in details", even if they just send a screenshot of the map with a comment.
---

# Sketch map — architecture & conventions

The map is **generated**, not drawn by hand: real geography (Natural Earth + an elevation
grid) → one coordinate system → pencil-stroke primitives → SVG layers → baked into image tiles
per zoom tier → shown in Leaflet with live hand-lettered labels on top.

## The user's taste (most important)
- It must look like a **normal traveller's pencil sketch**: rough, imperfect, never clinical.
  Stroke pressure, wobble, re-traces, pen-lifts, smudges, carbon shading are all deliberate.
- **Tidy over decorative**: the red sample route + "Day N" notes are *hidden* (`trip: false` default in `drawMap`,
  also absent from the opening) until the real itinerary; the "circled twice" Band-e Amir loop was deleted.
  Placeholder content → hide behind a switch; decorative clutter → delete.
- **Size tweaks by feel, in moderate steps**: "2× bigger" on the today note turned out "too big!" → settled at 1.4×.
  When asked to scale UI, check it against the map at 1440×860 for overlaps before reporting.
- **Less is more.** The user repeatedly removed clutter (chai doodle, "must see!!", extra hills,
  inset boxes). Prefer a few well-placed marks; add detail through zoom tiers, not at 1×.
- **The country must read as mountainous at 1×**: layer `highlands` (t0, plate `relief`) scatters real DEM summits
  (`terrain.peaks({radius:10,minElev:3000})`, ~60) as smaller, fainter peaks (h 8–17, o .58, half get a lower shoulder),
  skipping the RIDGES, towns/landmarks and the Wakhan. Main chains stay the strongest marks.
- **Hills are lopsided silhouettes** (`hillCluster`): one steep side, ground line trailing off both feet, slanted hatch on
  the shadow side. Symmetric arcs with tick marks read as eyebrows — don't go back.
- **Rivers** (layer `rivers`, t0): inland rivers meander (double `wobble` on a 4 px resample) and **taper** thin→full
  downstream (direction from the DEM). Main: Helmand, Harirud, Kabul, Arghandab. Tributaries drawn lighter: data
  `MINOR_RIVERS` (Kunduz, Kokcha, Balkh) + hand-traced `TRIBUTARIES` (Kunar, Panjshir, Logar, Murghab, Khash Rud, Tarnak)
  + Farah. `RESERVOIRS` (Kajaki, Naghlu) = small lakes upstream of the dam. Amu Darya/Panj are the border — kept exact.
  `riverGeom` keeps the drawn lines so later layers sit on them.
- **Oases** (layer `waters`, t2): two rows of furrowed plots edge to edge along each bank inside `OASES` boxes
  (outer row thins out), occasional poplar rows; plus tributary names along their lines (`t-river`). Scattered single
  plots read as confetti — keep them touching.
- But **no dead zones**: when an area looks empty at 1× (e.g. the south), add *light, sparse*
  landscape detail (small hills, dunes, lakes, rivers) — not doodles.
- Labels must never collide or cross borders; the Wakhan must read as a long, narrow corridor.
- **Colour**: aged paper, but only a *hint* of warmth — "too yellow" was rejected. Palette (travel-journal reference:
  pencil + two crayons) ink `#37332e`, paper `#ebe7dd`, red `#b8432f`, **green `#5f8c4e`** (crayon, for fertile valleys
  only), **turquoise `--tile` #1aa0b4** (Blue Mosque tiles — photo-stop diamonds only, so stops pop; index.html only),
  defined in places that must match: `COLORS` in `tools/build-tiles.mjs`, `:root` in `index.html`,
  `spike/map-lab.html` and `checkin/index.html` (paper is baked into tiles as the fill that lets near peaks hide far ones).
- **Green = life along water**: layer `oases` (t0, plate `water`, drawn under the rivers) = soft broad green crayon ribbons
  (4 offset waxy passes) along the `OASES` stretches; the t2 oasis fields and poplars are green too. Don't spread green
  elsewhere — it's an accent, not a fill colour.
- **Title block** (index.html, screen-fixed top-left like the today note): green Reenie date line "2026 / a traveller's
  sketchbook", Amatic SC 700 kicker "FIELD NOTES FROM", "AFGHANISTAN" in Amatic SC 700 80px with a text-stroke, pencil
  rules from `brush()` (thin + heavy). Fades with `html.zoomed`; settles in at 1.7 s in the opening.
- **Shading is pencil, never airbrush**: carbon tones render as the `#graphite` diagonal-hatch
  pattern through the `#carbon` filter (grain + feathered edge). Blurred grey blobs were rejected.
- **Main city names are "pressed harder"**: Architects Daughter has no bold, so `.lbl.heavy`
  adds a same-colour `-webkit-text-stroke`. (True bold alternative if asked: Kalam 700.)
- **Range names sit on the range**: HINDU KUSH follows the real crest (Shibar → Salang → Mir Samir), north of Kabul
  and Charikar — not in the Kabul basin. Big range names (`t-region--range`, `t-region--wakhan`) fade out by ~2× (`hide`).
- **Landmark vignettes stay small and on their spot**: e.g. the Bamiyan cliff (two niches, monks' caves, poplars) sits
  right over the town (off [-4,-18], ~100 map px wide); a wider one ran into the Shibar/Charikar area. `LANDMARKS[].lab`
  moves a caption that would collide with a place name.
  Vignette style (Bamiyan, Jam): compact, paper-filled bodies in front of what's behind, a few telling details from the real
  site (niches + caves + poplars; Jam's plinth, brick lattice, inscription band, balcony, lantern, gorge walls, river), light shading.
- **Drawings instead of words** where they're nicer (the Marco Polo sheep is a skull in the Wakhan, no caption). A
  doodle needs a paper-fill backing if it sits on peaks, must be *inside the border* (`pointInRings` for its whole bbox),
  and must not push out labels — check the Wakhan label list before/after (see map-build).
- **Geography is accurate** — city distances were verified against great-circle km (all within the
  deliberate ~5–15% "drawn from memory" warp). If something *looks* too close, fix the lettering
  (e.g. `LABEL_LEFT` puts BAMIYAN's name on the left), don't move the place.
- When the user sends a screenshot with "remove/fix these", find the generating code, fix it,
  rebuild, and verify visually (see `visual-check`).

## Files
| File | Role |
|---|---|
| `js/map/geo.js` | `createGeo()` → `toMap([lon,lat])` / `fromMap([x,y])`; projection + seeded "drawn from memory" warp |
| `js/map/pencil.js` | `brush` (pressure stroke), `roughLine` (multi-stroke line, `steady` option), `peak`, `flicks`, `S`, `handLettering`, `FX` (carbon tones/smudges) |
| `js/map/sketch-map.js` | `drawMap(data, opts)` — every layer; `composeSVG(parts, {layers,text,grain,colors})`; `extractLabels(parts)` |
| `js/map/terrain.js` | elevation grid: `sample`, `contours`, `peaks`, `profile`, `shade` |
| `js/map/relief.js` | DEM hachures (tier 1) |
| `js/map/wakhan.js` | Wakhan detail (tier 2): valley line, peaks, passes, lakes, doodles, label placer |
| `js/map/tiers.js` | `TIERS` (layers per zoom tier + reveal range + baked zooms), `labelRule()` |
| `index.html` + `js/site.js` | **the whole site** (markup/CSS in index.html; all logic in js/site.js — no inline scripts, CSP): Leaflet `CRS.Simple`, tier fades, live labels, declutter, two-state zoom, `html.zoomed` class |
| `js/map/photos.js` + `data/photos.json` | photo **stacks** per place (`stacks[].photos[]`; deckle-edged prints, map units, scale with zoom): messy pile → hover only loosens → **click** deals a tidy grid (zooms to 3× first at the overview) → click a print = lightbox with ←/→ → Esc / map click gathers. Placed via `geo.toMap`; `dx/dy` offset + pencil leader to a red ring; `precision: hidden` skips a stack |
| `js/map/opening.js` | opening scene: reveals 4 baked **plates** (`tiles/intro/*.webp`) on a canvas through brush masks that follow real geometry (`tiles/intro.json` from `introGuides()` in sketch-map.js); `SCHEDULE` = timings |
| `js/map/checkin-pin.js` | live **"I was here!" margin note** (user's choice over ring/pushpin/pulse/footprints): a bowed red pencil arrow from open paper (74 css px, 8 candidate directions, picks the one whose note covers fewest labels/stacks/diamonds) stopping short of the spot (gap grows with the stop's diamond at zoom), "I was here!" + "5 days ago" at the tail; zoomed adds place + “note”. Re-laid out on zoomend; arrow draws in (dashoffset). Polls `local-r2/public/checkin/latest.json` every 30 s; text via textContent only. Rules: `js/checkin/core.js` |
| `js/map/almanac.js` | "Afghanistan, today" (shown at `scale(1.4)` — 2× was "too big"; the hint sits left of centre to clear it): Kabul time (`Asia/Kabul`), date (`Intl`), temperature °C + humidity from Open-Meteo (no key; Kabul coords only). Fixed bottom-right |

## Rules that keep it working
1. **Everything positions through `geo.toMap` (`P` inside `drawMap`).** Never project on your own —
   pins and the drawing must share the same distortion. `npm test` checks round-trip & no folds.
2. **Each layer block starts with `layerSeed('<key>')`** so its strokes are identical in every tier
   combination. New layer = new `layerSeed` + an `out.push('<g class="layer-NAME">…</g>')`.
3. **Put the new layer in a tier** in `tiers.js` (`t0` always visible; `t1` relief ~1.3–1.7×;
   `t2` detail ~1.8–2.2×; `t3` margins ~2.3–2.7×). Unlisted layers are never baked.
4. **Text is `<text class="…">`** inside a layer; it is stripped from tiles and becomes a live label.
   Give it a class the viewer knows (`FONT` map in `index.html`) and a rule in `labelRule()`.
5. **Drawing at another scale** (like the Wakhan at 2.5×): wrap in `<g transform>`, set
   `FX.xform` while drawing so carbon tones land in the right place, and add `data-map="ox oy s"`
   on the layer group so `extractLabels` maps label coords back.
6. **Sizes are map px at the tier's reveal zoom**: t0 marks ~1.5–3 px strokes; t2 detail is drawn at
   2.5× then scaled down.
7. Terrain lookups must stay inside `T.bounds` (outside the grid slopes are garbage → stripe artefacts).
8. Density knobs: `RIDGES[i].step` (peak spacing) and `.foothills` (rows); `HILLS` / `HILLS_SOUTH`;
   peak stroke width is capped in `pencil.peak`. Declutter by lowering these before deleting features.
9. Label side/anchor: `text-anchor="end"` / `"middle"` are honoured by the viewer (`.lbl.end/.mid`).
    Collision footprint = circles of 0.5 × font size along the baseline; priority 0 wins.
10. Use `pointInRings(lon, lat, data.afghanistan)` to keep marks inside the country.

## Page UI conventions (index.html)
- **Overlays are lettered, not boxed**: UI on the paper (the today note) follows the hand-drawn map-legend
  reference — caps label, dotted leader, handwritten value; no card, frame or shadow.
- **General details step aside when zoomed in**: `html.zoomed` is toggled on `zoomanim` (so fades run *with*
  the camera) and on `zoomend`; overlays like `.almanac` / `.hint` fade out under it. New screen-fixed UI
  should do the same, or it will cover stacks and labels at 3×.
- **Layer order (map panes)**: labels 450 · lens 455 · photos 460 · check-in 470 · opened pile 480 · **hovered stop 490**
  (`.leaflet-photos-pane:has(.ps-stop:hover)`, `!important` beats the pane's inline z) so a milestone tag always sits on
  top. On a photo stop (`stops` passed to `addCheckinPin`) the arrow tip stops short of the diamond.
- **Photo stacks layering**: `.ps-pile` z 1 over its `.pp-lead` z 0; an open pile hides its leader path and the photos
  pane goes to z 480 (above the check-in pin, 470). `.pp-paper` has `isolation: isolate`. Clicked prints: no focus
  ring (`:focus-visible` only). The check-in lettering hides minor labels under it (`.lbl.ci-cover`), never `.heavy` ones.
- **Milestones** (Out of Eden Walk reference): each stack's exact place has a **plain turquoise diamond** (`diamond()` in
  photos.js: rhombus, `--tile` fill, thin pencil outline, small offset shadow; radius 5–7.2 by photo count; `.ps-stop`).
  History: cairns ("3D objects clashing") → girih star ("way too complex") → **simple geometry**. Keep it plain.
  Hover (or an open pile) enlarges it 1.7× and shows a **paper luggage tag** — "MILESTONE n" (Amatic, red), "place · date",
  title (Reenie) — counter-scaled by `--s` (= 2^zoom), offset by `--ch` (radius) × 1.7. Numbered in trip order (Day N).
  Clicking the diamond opens the stop like the pile. Tag = paper object, not a card.
- **One marker per place**: `build-tiles.mjs` reads `data/photos.json` and passes `stops` to `drawMap` (and the Wakhan);
  places/towns/passes within 0.12° of a stop draw no cross/ring/pass mark — the diamond is the marker (rebuild after adding
  stops). Skipped marks are still generated (same random draws, same label blocks) so labels don't shift. Place and town
  crosses are deliberately small and light. The "JALALABD" misspelling flaw was removed as clutter; `LABEL_LEFT` names (Bamiyan) are
  centred below the place (y+26), clear of Kabul's name and Band-e Amir's diamond. No focus outline on markers.
- **Zoom affordances**: at the whole map the cursor is a drawn pencil magnifier (`--cur-in`, SVG data URI with a paper
  halo) and **a click leans in** at that point. Around it a small wobbly pencil **lens ring** (~62 px, opacity .42)
  eases after the pointer (lerp .22 — the motion is the cue); on a first visit only, "click to look closer" is lettered
  beside it for 4.5 s (localStorage `fieldnotes-lens-tip`). Mouse only; hidden over stacks/UI, when zoomed, in the opening.
  A big dashed preview frame of the 3× view was tried and rejected (reads as a software selection box, covers a third of
  the sheet). Zoomed: `grab` cursor, a lettered "double-tap for the whole map →" by the buttons; **double tap / double click** (map `dblclick`) steps back
  — ignored within 700 ms of a click-to-lean-in, so a double click at the overview doesn't zoom in and straight out; Esc steps back (after closing an open
  pile/print). `doubleClickZoom` is off (keep it out of the opening's re-enable list). Coordinate readout only with `?debug`.
- **Click over hover** for revealing content (user rolled back a hover-to-arrange experiment).
- **Map-unit DOM objects** (things that live on the paper and scale with zoom, like the stacks): a small
  `L.Layer` that sets `L.DomUtil.setTransform(el, latLngToLayerPoint(ll), 2 ** zoom)` on `zoom/viewreset`
  and `_latLngToNewLayerPoint(ll, e.zoom, e.center)` on `zoomanim`, with `transform-origin: 0 0` and the
  `leaflet-zoom-animated` class. Sizes inside are map px.
- **`[hidden]` + `display:grid` bug**: any overlay styled `display:…` needs an explicit
  `.x[hidden] { display: none }`, or the invisible layer covers the page and eats every click.
- **Big images**: show the small version at once, swap to the large one on `onload` — never an empty frame.
- **Today note** (`almanac.js`): rows = Kabul time, date, temperature °C, humidity (Solar Hijri was swapped for
  temperature). Dotted leaders are long strings clipped by flex (`'.'.repeat(90)`) — short ones leave a gap.
  Shown at `scale(1.4)` from the bottom-right; the hint sits left of centre (`calc(50% - 70px)`) to clear it.
- **Retina tiles**: at devicePixelRatio ≥ 1.5 each tier asks for one baked zoom sharper (`zoomOffset: 1`,
  `tileSize: 128`, native range −1). Don't use Leaflet's `detectRetina` — it clamps minZoom to 0 and the
  whole-map view (negative zoom) disappears.
- Photos load eagerly (no `loading="lazy"`): lazy images inside CSS-scaled Leaflet layers never "enter" the viewport.

## Load performance (measured 2026-10-06: slow 4G map-start 13.6 s → 3.8 s; 2.4 MB → ~1 MB)
- The preloader waits only for map.json, fonts, intro.json, **the outline plate** and the first t0 tiles. The other
  plates start downloading *after* the outline lands and stream in during the opening (opening.js skips a plate until
  its image is complete). If the outline isn't in within `OPENING_BUDGET` (6 s) — or Data Saver is on — no opening: map.
- Photo prints load **160×120 thumbnails** (`thumbOf`: `thumb` in photos.json, or picsum resized by URL) and only after
  the preloader (`loadThumbs()`); piles on screen at 3× (or opened) `sharpen()` to the full print (swap on load).
- WebP: `alpha_quality=70, method=6` for tiles and plates (alpha was half of every file; visually identical).
- index.html head: Leaflet **self-hosted** in `vendor/leaflet-1.9.4/` (SRI kept), `modulepreload` for site.js + its
  imports, `preload` for map.json / photos.json / outline plate. New module imported by site.js → add a modulepreload.
- Fonts: no Inter (system-ui for UI); Amatic SC requested with `&text=` (only the title/milestone glyphs).
  Using Amatic for new text with other letters → extend that `text=` list or the glyphs fall back.
- `_headers` (Cloudflare Pages): tiles 1 day + SWR, vendor immutable, js revalidate, checkin no-store.
- Check-in poll backs off to 5 min while `latest.json` is 404. Measure with `visual-check/scripts/perf.mjs`.
  (The local python server doesn't compress — Leaflet shows 147 KB there, ~42 KB on Cloudflare.)

## Opening scene (preloader → drawing → names → notes → photos)
- Preloader `#preload`: hand-lettered title + a pencil line = load progress (`track()` in index.html). Min 0.9 s; never
  use `img.decode()` (hangs in background tabs); if the tab is hidden, wait for `visibilitychange` before playing.
- Order (s): border traced from the west 0–1.55 → rivers 1.15 → ridges/hills/deserts hatched 1.6 → names written
  letter-by-letter (neighbours 1.85, regions 2.3, cities 2.85–3, rest 3.45) → marks 2.9 → today note/controls 4.3–4.7 →
  **photos last**: a pause, then one stack every 0.26 s from 5.4 s in **trip order (Day N)**, leader + ring first, pile drops.
- Plates = t0 split by layer (`PLATES` in build-tiles.mjs, same order) so they stack to exactly the t0 drawing. When
  the drawing ends, swap canvas→tiles in the **same frame** (a crossfade doubles every line). Tiles are hidden by
  `html.op-drawing` only (not `.opening`, which lasts until the photos land — that hid the map after the drawing), and
  `.tier-t0` has no opacity transition. `?t=` frames never reach the swap: also check real playback with `live.mjs`
  (no `still`, wait ~6.5 s: expect canvas gone, t0 opacity 1).
- CSS animations are gated by `html.op-play` (added when the drawing starts); `html.opening` only hides. Setting
  delays on already-running animations counts from element creation (the preloader), which ran the schedule early.
- Any pointer/wheel/key skips to the end. Skipped for `?f=` deep links, `still=1` and reduced motion; `?t=` holds a frame.
- New map layer → add it to a plate in `PLATES` too, or it won't appear until the swap.

## Typical change → steps
1. Edit the layer in `sketch-map.js` (or `wakhan.js` / `relief.js`), keep it seeded and in a tier.
2. `node --input-type=module --check < js/map/<file>.js`
3. Rebuild with the `map-build` skill (tiles + labels).
4. Look at it with the `visual-check` skill at the zoom where it appears (`?f=3&at=x,y`).

## Style bench
`spike/map-lab.html` renders `drawMap` live (no tiles) with layer toggles, ink colours, "traveller
flaws" on/off and a seed re-roll — quickest way to judge stroke-level changes at 1×.

More detail (layer list, tiers, label classes): see `references/layers.md`.
