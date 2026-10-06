---
name: visual-check
description: Look at what the photo wall or the sketch map actually renders — take a headless-Chrome screenshot (optionally zoomed/cropped) and read it, instead of guessing from code. Use this after any visual change in this repo, when the user sends a screenshot of a problem ("this looks messy", "remove these", "why is X missing"), to compare zoom tiers of the map, or whenever the Claude-in-Chrome extension fails ("not in Claude's tab group", "couldn't determine which page").
---

# Visual check

Two ways to look, each with a known weakness:

| Page | Use |
|---|---|
| anything timed or zoomed (`?f=3`, the opening `?t=`), or when you need page state/errors | `scripts/live.mjs` — headless over DevTools: waits, evaluates JS, screenshots what is **actually painted**. Preferred for the map. |
| interaction feel (wheel, pinch, drag) | the live browser (claude-in-chrome) |
| quick still of `spike/*` pages | `scripts/shot.sh` (plain headless screenshot) |

`shot.sh` (plain `chrome --screenshot`) can capture before async work finishes — a map with only
labels / no drawing from it is that artefact, not a bug. Confirm with `live.mjs` before debugging.
Note: a claude-in-chrome tab you create is usually a *background* tab (`document.hidden`): rAF and
image decode stall there, so timed things (opening, Leaflet fades) won't run in it.

The Chrome extension sometimes loses its tab group ("not in Claude's tab group"): call
`tabs_context_mcp` with `createIfEmpty: true` and use the tab id it returns; if it keeps
failing, fall back to headless for whatever headless can show.

```bash
L=.claude/skills/visual-check/scripts/live.mjs
SHOT=/tmp/a.png node $L "index.html?still=1" 8000                     # whole map
SHOT=/tmp/b.png DPR=2 node $L "index.html?f=3&at=1120,570&still=1" 8000 # 3× retina
SHOT=/tmp/c.png node $L "index.html?t=2.6&still=1" 8000                # opening held at 2.6 s
SHOT=/tmp/d.png SIZE=1920x1080 node $L "index.html?still=1" 8000       # another viewport
node $L "index.html" 3000 "document.documentElement.className"         # just evaluate (prints errors too)
S=.claude/skills/visual-check/scripts/shot.sh
$S "index.html" /tmp/map.png                              # whole map (1×)
$S "index.html?f=3&at=1500,300" /tmp/wakhan.png           # 3× at map px (1500,300)
$S "spike/map-lab.html" /tmp/lab.png 1500x860 2 1000,700,400,900      # 2× detail crop W,H,X,Y
$S "spike/wall.html?intro=0" /tmp/wall.png                           # archived photo wall
```
Write screenshots to the session scratchpad rather than the repo.
Wait **≥ 8 s**: the page has a preloader (fonts, tiles, weather). A capture with only country names, or an
empty today note, means it was taken too early — re-run with a longer wait before debugging. Crop with PIL to
inspect details (e.g. the today note ≈ `(900,540,1380,773)` at 1440×860).

## Check-ins
`npm run dev` serves the site + check-in API on :5174. For tests, run it with `FIELD_NOTES_HOME=<scratchpad dir> PORT=5199` so
the user's real `~/.field-notes` history is never touched, and delete `local-r2/` afterwards, or test pins show on the map.
There's no key: the API trusts same-origin requests from this computer (the server binds 127.0.0.1).

## Useful URL parameters
- Map viewer: `?f=<1..3>&at=<x>,<y>` — zoom factor and centre in map px (frame is 2000×1300;
  Kabul ≈ 1120,570, Bamiyan ≈ 985,540, Wakhan ≈ 1485,285, Herat ≈ 490,625, Kandahar ≈ 805,910;
  exact: `createGeo({seed:"marco",flaws:true}).toMap([lon,lat])` in js/map/geo.js).
- Opening scene: `?t=<seconds>` holds it at that moment (canvas drawing + lettering + stacks, all paused);
  compare `?t=4.55` (canvas complete) with the plain page to check the canvas→tiles swap is invisible.
- Photo wall: `?intro=1` force the opening scene, `?intro=0` skip it.
- To freeze an animation for a still, in the live browser run:
  `document.getAnimations().forEach(a => { a.pause(); a.currentTime = <ms>; })`.

## Reading the result
- Take the screenshot at the zoom where the change should appear (tiers reveal at ~1.5×, ~2×, ~2.5×).
- Crop at scale 2 to judge stroke quality; full view at scale 1 to judge balance and clutter.
  Never use scale < 1: headless drops the map layer and you'll see only labels.
- `shot.sh` appends `still=1` (animations off). Without it, headless leaves Leaflet tiles at opacity 0 —
  a blank or half-empty map in a screenshot is this, not a build problem.
- Which labels did the collision check hide? In the live browser:
  `[...document.querySelectorAll('.lbl.is-hidden')].map(e => e.textContent)`
- Labels start at opacity 0 and only fade *in* at their tier — a label "flashing" at 1× is a regression.
- For interaction (wheel/pinch/drag), use the live browser + `javascript_tool` to dispatch
  `WheelEvent`s and read `window.__map.getZoom()`; headless stills can't test feel.
