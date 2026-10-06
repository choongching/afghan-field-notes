# Layers, tiers and label classes (generated from js/map/tiers.js — regenerate if it changes)

## Tiers
| id | name | reveal (× of fit) | baked zooms | layers |
|---|---|---|---|---|
| t0 | sketch | 0–0 | -1..2 | surround, deserts, (…) mountains, highlands, erased, border, rivers, foothills, mountains, hills, landmarks, trip, places, labels, compass, scale |
| t1 | relief | 1.3–1.7 | 0..2 | terrain |
| t2 | detail | 1.8–2.2 | 1..2 | towns, waters (oasis fields + tributary names), wakhan |
| t3 | margins | 2.3–2.7 | 1..2 | notes, traveller (empty since the Band-e Amir loop was removed) |

## Layer keys in drawMap (opts.layers toggles)
surround (graphite halo OUTSIDE the border: clipPath 'outside' + displaced/blurred band mask 'near-border'),
border, rivers, mountains (+foothills group), hills (HILLS + HILLS_SOUTH), landmarks (Bamiyan niches, Minaret of Jam,
Herat citadel, Blue Mosque, Band-e Amir), deserts (stipple, Registan dunes, Hamun lakes), places (PLACES X marks),
labels, trip (red SAMPLE_ROUTE — OFF by default, replace with the real itinerary), route (Marco Polo, off by default), notes,
compass/scale, terrain (DEM hachures), towns (minor cities + PASSES), wakhan (detail).
Flaws (flaws: true): hand warp in geo.js, erased ghosts (never in the Wakhan), smudges, pencil-pause blobs,
misspelt 'JALALABD' with correction, squeezed HINDU KUSH.

## Label classes → viewer fonts (index.html FONT)
AD = Architects Daughter (caps, places), RB = Reenie Beanie (handwriting, notes).
t-place, t-place--big, t-place--small, t-region, t-region--soft, t-region--wakhan, t-river, t-note, t-note--small,
t-landmark, t-trip (red), t-compass, t-scale, t-town, t-pass, t-country (neighbours: NEIGHBOURS in sketch-map.js, faint .45), w-place, w-small, w-note, w-peak, w-region, w-country, w-river.
labelRule(): reveal range + priority (0 = wins collisions); 'hide' range fades a label out (e.g. WAKHAN CORRIDOR at 1.7–2.0×).

## Data sources
data/afghanistan.json ← tools/build-map-data.py (Natural Earth 10m; APPROX rivers hand-traced; marcoPolo route)
data/afg-elevation.json ← tools/build-elevation.py (AWS Terrain Tiles z7, 0.025° grid, int16 base64)
research/afghanistan-topography.md — ridges, passes, peaks, landmark coordinates (with sources)
