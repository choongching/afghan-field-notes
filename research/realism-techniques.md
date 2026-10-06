# Photorealistic objects with HTML/CSS/SVG (no WebGL)

Scene: a light-grey painted office wall, A4 printouts held by lime-green masking tape, pale-yellow Post-its with handwriting, and a brushed-steel light-switch plate.

Legend: **[src]** means the value is quoted from the linked source. **[tune]** means it is my suggested starting value, derived from the source technique and meant to be adjusted by eye.

---

## 0. Global rules (these matter most)

- **Use one light source for everything.** Josh Comeau: "every shadow on the page should share the same ratio". Put the light above and slightly left, and keep **y-offset = 2 × x-offset** on every shadow. **[src]** https://www.joshwcomeau.com/css/designing-shadows/
  - For SVG lighting filters, use `feDistantLight azimuth≈225` (light from the top-left; azimuth is clockwise from +x, so 225 points up and to the left in screen coordinates). Sara Soueidan's demo uses `azimuth=45 elevation=60`, so flip it to match your CSS shadows. **[tune]**
- **As an object lifts off the wall, its shadow changes three ways at once:** the offset grows, the blur grows, and the opacity drops. **[src]** Comeau
- **Tint shadows toward the surface colour; never use pure black.** On a grey wall with a slightly cool cast, use something like `hsl(220deg 8% 40% / a)`. **[tune]** (Comeau's principle, values adapted)
- **Rasterize anything static.** feTurbulence is expensive. Render each texture once as an SVG data-URI `background-image`, not as a live `filter:` on large elements (see §8).

---

## 1. Wall: painted drywall / orange peel

### 1a. Bump-mapped texture (feTurbulence → feDiffuseLighting)
This is Sara Soueidan's "rough paper" recipe (Codrops). **[src]** https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/
```xml
<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise"/>
<feDiffuseLighting in="noise" lighting-color="white" surfaceScale="2">
  <feDistantLight azimuth="45" elevation="60"/>
</feDiffuseLighting>
```
- `baseFrequency` range 0.02–0.2 is "useful starting points for most textures" (Mullany via Soueidan). **[src]**
- Detail stops visibly improving above `numOctaves="5"`. **[src]**
- `surfaceScale` is a z multiplier: **20 gives a stucco look, 50 gives crumpled plastic**. **[src]** https://www.creativebloq.com/netmag/how-go-beyond-basics-svg-filters-71412280

Orange-peel paint on drywall is a fine, low-relief texture. **[tune]**
```html
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
 <filter id="peel" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="7" stitchTiles="stitch" result="n"/>
  <feDiffuseLighting in="n" surfaceScale="1.2" diffuseConstant="1" lighting-color="#e9eaec">
    <feDistantLight azimuth="225" elevation="55"/>
  </feDiffuseLighting>
 </filter>
 <rect width="100%" height="100%" filter="url(#peel)"/>
</svg>
```
- Use `stitchTiles="stitch"` so the tile repeats seamlessly. Export it as a 512px tile and set `background-size: 512px`.
- `color-interpolation-filters="sRGB"` prevents the washed-out look of the default linearRGB. **[src: MDN note]** https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feSpecularLighting
- Satin or eggshell paint has a faint sheen. Add a low `feSpecularLighting` (`specularExponent≈20`, `specularConstant≈0.3`, lighting-color `#fff`) and combine it with `feComposite operator="arithmetic" k2=1 k3=1`. That arithmetic pattern is the MDN example, which uses `specularExponent="20"`. **[src + tune]**

### 1b. Low-frequency mottling (uneven paint and roller marks)
- Add a second noise layer with `baseFrequency="0.004 0.006"`, `numOctaves="2"`, mapped to ±3% luminance with `feColorMatrix` (alpha ≈ 0.04–0.06), and blend it with `mix-blend-mode: soft-light` or `multiply`. **[tune]**
- Roller streaks come from anisotropic noise. Soueidan shows that two values such as `baseFrequency="0.01 0.4"` produce directional noise. For faint vertical roller lap marks, try `0.002 0.02` at very low alpha. **[src technique / tune values]**

### 1c. Large-scale light falloff
A real photo is never evenly lit. Stack gradients above the texture: **[tune]**
```css
.wall{
  background:
    radial-gradient(120% 90% at 25% 10%, hsl(0 0% 100% / .18), transparent 60%), /* hotspot near light */
    linear-gradient(180deg, hsl(220 6% 50% / 0) 40%, hsl(220 6% 30% / .12) 100%), /* floor-ward darkening */
    url(peel.svg) 0 0 / 512px,
    #c9cacc; /* light grey paint base; photographed grey walls sit ~#c4c6c8–#d2d3d4 */
}
```

---

## 2. Shadows

### 2a. Layered box-shadows (Comeau and Ahlin)
Comeau's medium elevation (replace the hue with your wall tint): **[src]**
```css
box-shadow: 1px 2px 2px hsl(220deg 60% 50% / .333),
            2px 4px 4px hsl(220deg 60% 50% / .333),
            3px 6px 6px hsl(220deg 60% 50% / .333);
```
Comeau's large elevation: `1px 2px 2px`, `2px 4px 4px`, `4px 8px 8px`, `8px 16px 16px`, `16px 32px 32px`, each at alpha `0.2`. **[src]**

Tobias Ahlin's "sharp" stack (contact-heavy, ideal for paper lying flat against a wall): **[src]** https://tobiasahlin.com/blog/layered-smooth-box-shadows/
```css
box-shadow: 0 1px 1px rgba(0,0,0,.25), 0 2px 2px rgba(0,0,0,.20),
            0 4px 4px rgba(0,0,0,.15), 0 8px 8px rgba(0,0,0,.10), 0 16px 16px rgba(0,0,0,.05);
```

### 2b. Contact vs ambient shadow for paper taped flat on a wall **[tune]**
Paper sits about 0.1 mm off the wall, so its shadow is mostly a tight contact line plus a very faint ambient halo:
```css
.sheet{ box-shadow:
  0 0 0 .5px hsl(220 10% 30% / .10),       /* edge definition */
  .5px 1px 1px hsl(220 10% 25% / .18),      /* contact */
  1px 2px 3px hsl(220 10% 25% / .10),
  3px 6px 12px hsl(220 10% 25% / .06);      /* ambient */ }
```
Post-its (whose bottom curls about 5–10 mm off the wall) and the switch plate (about 5 mm proud of the wall) need longer and softer layers.

### 2c. Lifted and curled corners (Nicolas Gallagher's pseudo-element trick) **[src]**
https://nicolasgallagher.com/css-drop-shadows-without-images/demo/
Put the shadow on rotated or skewed pseudo-elements *behind* the element (`z-index:-1`; the parent needs `position:relative`, plus `z-index` on a wrapper):
```css
/* Lifted corners */
.lifted::before,.lifted::after{content:"";position:absolute;z-index:-1;
  bottom:15px;left:10px;width:50%;height:20%;max-width:300px;max-height:100px;
  box-shadow:0 15px 10px rgba(0,0,0,.7);transform:rotate(-3deg);}
.lifted::after{right:10px;left:auto;transform:rotate(3deg);}
/* Curled corners */
.curled{border-radius:0 0 120px 120px / 0 0 6px 6px;}
.curled::before,.curled::after{bottom:12px;left:10px;width:50%;height:55%;
  max-width:200px;max-height:100px;box-shadow:0 8px 12px rgba(0,0,0,.5);
  transform:skew(-8deg) rotate(-3deg);}
.curled::after{right:10px;left:auto;transform:skew(8deg) rotate(3deg);}
/* Perspective (one-sided cast shadow) */
.perspective::before{left:80px;bottom:5px;width:50%;height:35%;max-width:200px;max-height:50px;
  box-shadow:-80px 0 8px rgba(0,0,0,.4);transform:skew(50deg);transform-origin:0 100%;}
/* Raised, no pseudos */
.raised{box-shadow:0 15px 10px -10px rgba(0,0,0,.5),0 1px 4px rgba(0,0,0,.3),0 0 40px rgba(0,0,0,.1) inset;}
```
- For a single lifted A4 corner (for example, bottom-right where the tape does not hold), use only one pseudo-element. Halve the demo values for the offset (`0 8px 6px`) and the alpha (`.35`), because those values were tuned for a card on white. **[tune]**
- Pair the shadow with a highlight on the paper itself: a `linear-gradient(135deg, …)` that lightens the lifted corner by 3–5% where it tilts toward the light. **[tune]**

### 2d. Drop-shadows that follow irregular shapes
For clipped or torn shapes (tape), `box-shadow` is cut off by `clip-path`. Put `filter: drop-shadow(...)` on a **wrapper** around the clipped element instead. **[tune; standard behaviour]**

---

## 3. Paper (A4 printouts)

- **Base colour:** office paper is not pure white. Use `#f7f7f4`–`#fafaf7`. Under grey-wall ambient light it photographs around `#eeeeec`. **[tune]**
- **Fibre grain:** use a fine noise tile (the Grainy Gradients recipe, `type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'`) **[src]** https://css-tricks.com/grainy-gradients/. Lay it over the paper colour at `opacity .05–.08` with `mix-blend-mode: multiply`. **[tune]**
- **Subtle tooth or bump:** use the Soueidan paper filter from §1a, but set `baseFrequency≈0.8`, `surfaceScale≈0.6`. The texture should be felt rather than seen. **[tune]**
- **Curvature shading:** paper taped at the top bows slightly away from the wall. Add a vertical gradient on top of the paper: **[tune]**
  ```css
  background-image:
    linear-gradient(180deg, hsl(0 0% 100%/.0) 0%, hsl(0 0% 100%/.25) 30%, hsl(220 10% 40%/.06) 100%),
    linear-gradient(90deg, hsl(220 10% 40%/.04), transparent 15% 85%, hsl(220 10% 40%/.05));
  ```
- **Printed-on-paper look for images and text:**
  - Put printed content inside the sheet with `mix-blend-mode: multiply`, so white disappears and the paper texture shows through the ink. multiply "makes white pixels transparent… dark pixels remain visible". **[src]** https://www.sitepoint.com/close-up-css-mix-blend-mode-property/
  - Desaturate and flatten laser or inkjet output slightly: `filter: saturate(.85) contrast(.95) brightness(1.02)`. Text colour should be `#222`–`#2a2a2a`, not `#000`. **[tune]**
  - Optionally simulate toner edges with a tiny displacement on the text: `feTurbulence baseFrequency="0.9" numOctaves="1"` + `feDisplacementMap scale="0.6"`. **[tune]**
  - Halftone (only if the print should look cheap): Ana Tudor's three-declaration halftone combines a pattern layer `radial-gradient(closest-side,#777,#fff) 0/1em 1em` with a map layer, uses `background-blend-mode: multiply`, and adds `filter: contrast(>1)`. **[src]** https://frontendmasters.com/blog/pure-css-halftone-effect-in-3-declarations/. For office prints use a tiny dot size (≈3px) at low contrast, or skip it.

---

## 4. Masking tape (lime green)

- **Colour:** lime masking tape looks like `hsl(75 70% 55%)` (≈ `#b5d63a`). Apply it at about 80–88% opacity with `mix-blend-mode: multiply`, so the paper edge and wall texture show through. **[tune]**
- **Torn or jagged ends:** use `clip-path: polygon()` with about 8–12 irregular points on each short end. Generate the points so every piece differs. **[src technique]** https://codepen.io/ClementParis016/pen/RZzdYq (Sass mixin that generates random polygon edges), https://css-tricks.com/almanac/properties/c/clip-path/
  ```css
  .tape{ clip-path: polygon(2% 0, 98% 0, 100% 12%, 97% 27%, 100% 41%, 98% 58%, 100% 74%, 97% 88%, 99% 100%,
                            1% 100%, 3% 86%, 0 71%, 2% 55%, 0 39%, 3% 22%, 0 9%); } /* [tune] */
  ```
  - Alternative: css-tip's adhesive-tape technique uses `mask: repeating-conic-gradient(from 45deg,#000 0 25%,#0005 0 50%)` for serrated, semi-transparent edges. **[src]** https://css-tip.com/adhesive-tape-image/
- **Crepe texture:** masking tape has fine crinkles running across its width. Use anisotropic noise stretched along the tape: `baseFrequency="0.02 0.6"` (low along the length, high across it), fed into `feDiffuseLighting surfaceScale≈1.5`. Blend at `soft-light`, opacity about 0.5. **[tune, based on Soueidan's two-value baseFrequency]**
- **Sheen and edges:** add a faint top highlight `linear-gradient(180deg, hsl(0 0% 100%/.18), transparent 40%)` and slightly darker long edges (`inset 0 0 0 .5px hsl(75 50% 30%/.35)`). The tape needs almost no drop-shadow (`0 .5px 1px hsl(0 0% 0%/.15)` on a wrapper; see §2d). **[tune]**
- **Placement realism:** rotate each strip by a random amount between −6° and +6°, and vary the lengths (60–110px at A4 scale). Where the tape crosses the paper edge, the paper should show a small step. Add a 1px darker band on the tape along the paper's edge line. **[tune]**

---

## 5. Sticky notes (Post-it)

- **Colour:** the official Post-it "Canary Yellow" is **#FFFF99 (255,255,153), PMS Yellow 0131 C**. **[src]** https://brandpalettes.com/yellow-post-it-notes-colors/. In a photo under office light it reads slightly darker and warmer, around `#f7ef8a`–`#fbf3a0`. Build a gradient from a lighter top (glued, flat) to a slightly darker bottom (curled, facing away from the light). **[tune]**
- **Structure:** the top about 18% is the adhesive strip and sits flat. The bottom lifts off the wall.
  ```css
  .postit{ position:relative; width:76mm; aspect-ratio:1; /* 3x3in = 76mm */
    background: linear-gradient(180deg,#fbf6a6 0 18%,#f8f09a 19%,#f3e98c 80%,#ece17f 100%);
    transform: perspective(600px) rotateX(4deg) rotate(-1.5deg); transform-origin:50% 0;
    border-bottom-right-radius: 60% 8px;   /* curled bottom edge silhouette */ }
  .postit::after{ /* shadow of the curled bottom */
    content:""; position:absolute; z-index:-1; left:6%; right:4%; bottom:6px; height:40%;
    box-shadow: 2px 10px 12px hsl(220 10% 20%/.35); transform: skew(-4deg) rotate(2deg); }
  .postit::before{ /* adhesive line: tiny sheen change */
    content:""; position:absolute; inset:0 0 auto 0; height:18%;
    background: linear-gradient(180deg, transparent 85%, hsl(50 40% 40%/.06)); }
  ```
  **[tune; shadow uses Gallagher's curled pattern from §2c]**
- The unglued bottom is lit at a different angle. Add `linear-gradient(to bottom, transparent 55%, hsl(50 30% 30%/.08))`, and a 1px highlight along the bottom edge (`inset 0 -1px 0 hsl(0 0% 100%/.4)`).
- Reference CodePens (behind Cloudflare, so view them in a browser): https://codepen.io/jweden/pen/kGBBpM (inset shadows and radius), https://codepen.io/iamtyce/pen/krQZyN (curl).
- **Handwriting fonts (Google Fonts):**
  - **Caveat** is described as "the gold standard for realistic casual handwriting". Its contextual alternates make repeated letters look different, so keep `font-feature-settings:"calt" 1` on (the default). It is a variable font, so weights 400–700 can vary pen pressure. **[src]** https://www.realistichandwriting.com/blog/best-free-handwriting-fonts-2025
  - **Reenie Beanie** is based on ballpoint-pen handwriting. **[src]** https://fonts.google.com/specimen/Reenie+Beanie
  - **Gochi Hand** gives an everyday, unaffected hand. **Nanum Pen Script** has even-width strokes, so it reads as felt-tip or marker. **[src]** https://www.notebookandpenguin.com/handwriting-google-fonts/
  - Also worth testing (**[tune]**): *Permanent Marker* for a Sharpie look, and *Kalam* or *Shadows Into Light* for pencil or ballpoint.
  - Ink colours (**[tune]**): ballpoint blue `#1d2f6f`, black marker `#1b1b1f`. Set `opacity:.92` and `mix-blend-mode:multiply` so the ink sits in the paper.
- **Ink irregularity:** Soueidan's distortion recipe applies `feTurbulence baseFrequency="0.02" numOctaves="3"` + `feDisplacementMap scale="6"`, varying `seed` 0–4 per element. **[src]** Codrops (above). For handwriting, scale it down so the strokes wobble without breaking: **[tune]**
  ```xml
  <filter id="ink"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G"/></filter>
  ```
  Add slight per-line `rotate(-2deg…2deg)`, uneven `letter-spacing`, and a baseline that drifts across lines (`translateY` per line). Apply this filter only to small text blocks (see §8).

---

## 6. Brushed-steel switch plate

Simurai's technique uses "3 repeating-gradients with different length" to fake random brushing. **[src]** https://simurai.com/lab/2011/08/21/brushed-metal, with the code taken from the gist https://gist.github.com/jdrew1303/4079886
```css
.metal{ background-color:#E5E5E5;
  background-image:
    repeating-linear-gradient(90deg, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0) 6%, hsla(0,0%,100%,.1) 7.5%),
    repeating-linear-gradient(90deg, transparent 0%, transparent 4%, rgba(0,0,0,.03) 4.5%),
    repeating-linear-gradient(90deg, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0) 1.2%, hsla(0,0%,100%,.15) 2.2%),
    linear-gradient(-90deg, #c6c6c6 0%, #e5e5e5 47%, #c6c6c6 53%, #b2b2b2 100%);
  text-shadow: 0 -1px 0 rgba(102,102,102,.5), 0 2px 1px rgba(255,255,255,.6); }
```
(The gist uses legacy `left center`. Modern `90deg` gives horizontal banding, i.e. vertical brush lines. Use `180deg` for horizontal brushing.)
- **A more realistic grain with SVG:** use `feTurbulence baseFrequency="0.001 0.9" numOctaves="2"` (streaks), then desaturate with `feColorMatrix`, and overlay with `soft-light` at opacity about 0.35. Add an anisotropic highlight band `linear-gradient(100deg, transparent 30%, hsl(0 0% 100%/.35) 48%, transparent 60%)`. **[tune, based on Soueidan's two-value baseFrequency]**
- **Plate edge bevel:** stack inset shadows, `inset 0 1px 0 hsl(0 0% 100%/.7), inset 0 -1px 0 hsl(0 0% 0%/.25), inset 0 0 0 1px hsl(0 0% 40%/.3)`. The gist uses a similar inset stack: `0 2px 1px 7px rgba(255,255,255,.7) inset, 0 -1px 0 7px rgba(0,0,0,.25) inset`. **[src/tune]**
- **Screw heads:** use a `radial-gradient` disc plus a `linear-gradient` slot rotated to a random angle. The rocker switch is a `linear-gradient` with an inner shadow. The plate needs the longest shadow in the scene (for example Comeau's large stack at alpha 0.12) because it stands about 5 mm off the wall.
- Use `repeating-conic-gradient` for the brushed-radial "spun" look only on round parts. Switch plates are linearly brushed.

---

## 7. Photographic post-processing (whole scene)

- **Film grain:** use one fixed overlay pseudo-element with the noise tile (`baseFrequency 0.65–0.9`, `numOctaves 3`, `stitchTiles stitch`). **[src]** css-tricks Grainy Gradients / https://www.freecodecamp.org/news/grainy-css-backgrounds-using-svg-filters/
  ```css
  body::after{content:"";position:fixed;inset:-50%;pointer-events:none;z-index:9999;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity:.06; mix-blend-mode:overlay; }
  ```
  URL-encode `<`→`%3C`, `>`→`%3E`, `#`→`%23`, `%`→`%25`. Use single quotes inside. **[src: freeCodeCamp encoding]**
  - For animated grain, CSS-Tricks uses `animation: grain 8s steps(10) infinite` on a 300% oversized layer with `opacity:.3`, stepping `translate()` through 10 random offsets. **[src]** https://css-tricks.com/snippets/css/animated-grainy-texture/. A still photo should be static. If you animate, use `transform` only and a pre-rendered tile.
- **Vignette:** add `radial-gradient(ellipse 120% 100% at 45% 40%, transparent 55%, hsl(220 15% 15%/.28) 100%)` on a fixed overlay (`multiply` or plain alpha). **[tune]**
- **Colour grading:** phone photos of office walls lean slightly cool in the shadows and slightly warm in the highlights. Apply to the scene root: `filter: contrast(1.04) saturate(.92) sepia(.04)`, **or** (cheaper) a fixed overlay `linear-gradient(hsl(210 30% 50%/.05), hsl(35 40% 60%/.04))` with `mix-blend-mode: soft-light`. **[tune]** Avoid `filter` on the root if anything animates, because it forces a full-page repaint.
- **Depth of field (optional):** blur the far edges very slightly with a masked `backdrop-filter: blur(.6px)` overlay (`mask-image: radial-gradient(transparent 60%, #000)`). It is expensive, so use it only if the scene is static. **[tune]**
- **Chromatic softness:** real photos are never perfectly sharp. A global `filter: blur(.25px)` on the scene, or `.3px` on text-shadows, removes the "vector crisp" tell. **[tune]**

---

## 8. Performance caveats

- **SVG filters run in the paint stage.** Each primitive adds paint cost and can enlarge the painted region. Complex chains or large filter regions fall back to CPU paths, and in Chrome, SVG-on-SVG filters render on the CPU only. **[src]** https://github.com/MelodicBloom/svg-filter-lab/blob/main/docs/how-to-implement-performant-svg-filters-without-killing-your-frame-rate.md
- **feTurbulence gets slower as `numOctaves` increases.** Keep `numOctaves ≤ 3` unless there is a visible gain (the wall bump map at 5 only makes sense as a one-time rasterized tile). **[src]** same
- **Keep filter regions small.** An effect that is cheap on a small heading can become "dramatically more expensive" on a full-width hero. **[src]** same; Smashing: "SVG Filters can hurt the performance of your site drastically. Always test extensively", and Firefox caps blur at 100px. https://www.smashingmagazine.com/2021/09/deep-dive-wonderful-world-svg-displacement-filtering/
- **Data-URI `background-image` vs inline `filter:url(#id)`:**
  - A data-URI SVG used as a background is rasterized once, then cached and tiled. That makes it cheap to scroll and composite, so **use it for every static texture** (wall, paper grain, tape crepe, metal, film grain).
  - An inline `filter: url(#id)` re-runs whenever the element repaints (hover, animation, resize). Reserve it for effects that must follow the content's shape, such as displaced handwriting or toner-edge text, and only on small elements.
  - Codrops/Soueidan recommends capturing heavy filter chains as raster images for production. **[src]** https://css-tricks.com/creating-patterns-with-svg-filters/. The best option is often to render the SVG once, screenshot it or export a PNG/WebP tile, and ship that.
- **Tiles:** use 256–512px tiles with `stitchTiles="stitch"`. Do not use full-viewport SVG backgrounds, because the rasterization cost scales with pixel area × DPR. **[tune]**
- **`will-change`:** do not set it permanently. Add it just before a hover or drag interaction and remove it afterwards. **[src]** svg-filter-lab. For static overlays (grain, vignette), `position:fixed` and `pointer-events:none` are enough.
- **Animation:** animate only `transform` and `opacity`. Applying a filter to an element whose transform animates forces a filter recompute every frame. If filter parameters must animate (for example "boiling" ink), throttle the JS updates to every 100–160 ms. **[src]** svg-filter-lab
- **Blend modes:** `mix-blend-mode` creates stacking contexts and extra compositing layers. Group elements that blend onto the same backdrop. Blink and WebKit implement some blend modes slightly differently, so test in Safari. **[src]** css-tricks Grainy Gradients
- **`seed` is free.** Varying `seed` per element avoids tiled repetition at no extra cost. Varying `baseFrequency` per element creates new filter work each time.

---

## Source list
- Josh Comeau, Designing Beautiful Shadows: https://www.joshwcomeau.com/css/designing-shadows/
- Tobias Ahlin, Smoother & sharper shadows: https://tobiasahlin.com/blog/layered-smooth-box-shadows/
- Nicolas Gallagher, CSS drop-shadows without images: https://nicolasgallagher.com/css-drop-shadows-without-images/demo/
- Sara Soueidan, feTurbulence textures (Codrops): https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/
- Creative Bloq, beyond basics with SVG filters (surfaceScale 20/50): https://www.creativebloq.com/netmag/how-go-beyond-basics-svg-filters-71412280
- MDN, feSpecularLighting: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feSpecularLighting
- CSS-Tricks, Grainy Gradients: https://css-tricks.com/grainy-gradients/
- CSS-Tricks, Animated Grainy Texture: https://css-tricks.com/snippets/css/animated-grainy-texture/
- CSS-Tricks, Creating Patterns with SVG Filters: https://css-tricks.com/creating-patterns-with-svg-filters/
- freeCodeCamp, Grainy CSS backgrounds (data-URI encoding): https://www.freecodecamp.org/news/grainy-css-backgrounds-using-svg-filters/
- Frontend Masters (Ana Tudor), Pure CSS Halftone: https://frontendmasters.com/blog/pure-css-halftone-effect-in-3-declarations/
- css-tip, Adhesive tape image: https://css-tip.com/adhesive-tape-image/
- Simurai, Brushed Metal: https://simurai.com/lab/2011/08/21/brushed-metal and gist https://gist.github.com/jdrew1303/4079886
- Smashing, SVG displacement deep dive: https://www.smashingmagazine.com/2021/09/deep-dive-wonderful-world-svg-displacement-filtering/
- svg-filter-lab, performant SVG filters: https://github.com/MelodicBloom/svg-filter-lab/blob/main/docs/how-to-implement-performant-svg-filters-without-killing-your-frame-rate.md
- Post-it colour: https://brandpalettes.com/yellow-post-it-notes-colors/
- Handwriting fonts: https://www.realistichandwriting.com/blog/best-free-handwriting-fonts-2025, https://fonts.google.com/specimen/Reenie+Beanie
