# Field Notes — Afghanistan photo diary

**The site is one page: `index.html` — the hand-drawn sketch map of Afghanistan.**
Visitors land on it: real geography drawn as a traveller's pencil sketch, photo stacks pinned
to places, a live "Afghanistan, today" note (Kabul time, date, temperature, humidity), and a
two-state zoom (whole map ↔ 3×) that reveals detail tiers.

The earlier realistic **photo wall** (paper, tape, light engine, intro) is archived at
`spike/wall.html` — not linked from anywhere; its code in `js/engine.js`, `js/intro.js`, `js/focus.js`,
`css/materials.css` may be reused. `spike/map-explore.html` just redirects to the root.

Serve with `python3 -m http.server 5173` from the repo root (already the convention).

## Where things live
| Area | Files |
|---|---|
| Wall realism (archived) | `js/engine.js` (light/shadows, tape, notes), `js/textures.js`, `css/materials.css`, `spike/lab.html` (tuning bench) |
| Wall motion (archived) | `js/intro.js` (opening scene), `js/focus.js` (click-to-close-up), `css/intro.css` |
| Map drawing | `js/map/sketch-map.js` (layers), `pencil.js` (stroke primitives), `geo.js` (coordinates), `terrain.js` (DEM), `relief.js`, `wakhan.js`, `tiers.js` |
| Map page (the site) | `index.html` (markup + CSS) + `js/site.js` (all page logic: Leaflet, preloader, opening, zoom), `js/map/opening.js` (drawn-in opening), `js/map/photos.js` (stacks), `js/map/almanac.js` (today note), `data/photos.json`; `spike/map-lab.html` = style bench |
| Check-ins ("last seen here") | `checkin/index.html` (private form), `js/checkin/core.js` (rules + guardrails), `tools/dev-server.mjs` (`npm run dev`, :5174, local stand-in for the Worker), `js/map/checkin-pin.js` (live pin), `tests/checkin.test.mjs` |
| Data & build | `tools/*.py`, `tools/build-tiles.mjs`, `data/`, `tiles/` (generated) |
| Plans & research | `docs/pin-drop-plan.md`, `docs/zoom-plan.md`, `docs/hosting-plan.md` (going public: Cloudflare Pages + R2 proposal), `research/*.md` |

## Decisions already made (don't re-litigate)
- The map **is** the site; the photo wall is archived (2026-09-30).
- Page opens on the **whole-map view**: preloader → the map is drawn in (outline, rivers, relief), names written, notes, then photo stacks last in trip order. Any input skips.
- Zoom is **two-state**: whole map ↔ 3×, one gesture = one jump.
- Pins will come later; the map is already pin-ready (`geo.toMap/fromMap`, tested).
- Check-ins: you submit on a private page → the receiver stores the history privately and writes a public `latest.json` → the map polls it every 30 s. No database, no AI in the loop. Public = town-snapped latest by default.
- Photos are placeholders (picsum) until real trip photos arrive.

## Skills
Use `sketch-map` before changing anything on the map, `map-build` to rebuild tiles/data,
`visual-check` to look at a result (the Chrome extension is flaky; headless Chrome is reliable).
Run `npm test` after touching `js/map/geo.js` or the map's projection.

## Security & publishing
Public repo: https://github.com/choongching/afghan-field-notes. Pages have a Content-Security-Policy (no inline
scripts — page logic lives in `js/site.js` / `checkin/checkin.js`), Leaflet loads with SRI, and data from
`photos.json` / `map.json` / check-ins is escaped or set via textContent. New external hosts (e.g. the R2 photo
domain) must be added to the CSP meta tags. Never commit `~/.field-notes`, `local-r2/`, `data/raw/`, `tiles/raw/`.
