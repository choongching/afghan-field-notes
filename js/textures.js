// Procedural textures, generated once as SVG data URIs and exposed as CSS custom
// properties. Everything is feTurbulence-based so there are no image downloads and
// every surface gets its own physically-motivated micro-structure.

const svgUrl = (w, h, body) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`
  )}")`;

const filterRect = (filter) =>
  `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${filter}</filter><rect width='100%' height='100%' filter='url(#f)'/>`;

// Grey value noise, luminance copied into RGB, fully opaque.
const GREY = `<feColorMatrix type='matrix' values='1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1'/>`;

export const textures = {
  // Painted drywall: fine "orange peel" bump, lit by a distant light from above-left.
  // Rendered at full stage size (no tiling) because lighting filters seam when stitched.
  wallBump: (w, h) =>
    svgUrl(w, h, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='7' result='n'/>
      <feDiffuseLighting in='n' surfaceScale='0.9' diffuseConstant='1' lighting-color='#fff'>
        <feDistantLight azimuth='255' elevation='58'/>
      </feDiffuseLighting>`)),

  // Same orange peel as a 512px tile for the wall far outside the collage. Lighting
  // filters can seam faintly at tile edges; that's only ever seen small, in the wide shot.
  wallBumpTile: () =>
    svgUrl(512, 512, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='7' stitchTiles='stitch' result='n'/>
      <feDiffuseLighting in='n' surfaceScale='0.9' diffuseConstant='1' lighting-color='#fff'>
        <feDistantLight azimuth='255' elevation='58'/>
      </feDiffuseLighting>`)),

  // Low-frequency roller/patching blotches in the paint (seamless tile, no lighting).
  wallMottle: () =>
    svgUrl(1024, 1024, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.0039 0.0049' numOctaves='3' seed='11' stitchTiles='stitch'/>${GREY}`)),

  // Paper tooth: fine grey noise, applied with soft-light (0.5 grey = no change).
  paper: () =>
    svgUrl(240, 240, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' seed='3' stitchTiles='stitch'/>${GREY}`)),

  // Fibrous, directional structure (paper grain / cellulose streaks).
  fibre: () =>
    svgUrl(300, 300, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.035 0.18' numOctaves='3' seed='5' stitchTiles='stitch'/>${GREY}`)),

  // Masking tape crepe: fine creases perpendicular to the tape's length.
  crepe: () =>
    svgUrl(220, 60, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.75 0.035' numOctaves='3' seed='9' stitchTiles='stitch'/>${GREY}`)),

  // Brushed stainless: long vertical streaks.
  brushed: () =>
    svgUrl(160, 240, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.9 0.006' numOctaves='2' seed='2' stitchTiles='stitch'/>${GREY}`)),

  // Sensor/film grain for the whole "photograph".
  grain: () =>
    svgUrl(220, 220, filterRect(`
      <feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='4' stitchTiles='stitch'/>${GREY}`)),
};

// Cost control: the full-resolution lit wall is rendered only behind the collage
// (stage + 100px margin). The rest of the wall uses cheap seamless tiles.
export const WALL_CORE_MARGIN = 100;

export function installTextures(root = document.documentElement, stage = { w: 2000, h: 1300 }) {
  const s = root.style;
  s.setProperty('--tex-wall-bump', textures.wallBump(stage.w + 2 * WALL_CORE_MARGIN, stage.h + 2 * WALL_CORE_MARGIN));
  s.setProperty('--tex-wall-bump-tile', textures.wallBumpTile());
  s.setProperty('--tex-wall-mottle', textures.wallMottle());
  s.setProperty('--tex-paper', textures.paper());
  s.setProperty('--tex-fibre', textures.fibre());
  s.setProperty('--tex-crepe', textures.crepe());
  s.setProperty('--tex-brushed', textures.brushed());
  s.setProperty('--tex-grain', textures.grain());
}
