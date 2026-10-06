// node tests/geo.test.mjs — the map's coordinate system must stay invertible,
// so that pins dropped by lat/lon (or by click) land where the drawing says.
import { createGeo } from '../js/map/geo.js';
import assert from 'node:assert/strict';

for (const flaws of [false, true]) {
  for (const seed of ['marco', 'x7k2q', 'another-hand']) {
    const geo = createGeo({ seed, flaws });
    let worst = 0;
    for (let lon = 60.5; lon <= 75; lon += 0.25) for (let lat = 29.4; lat <= 38.5; lat += 0.25) {
      const [lon2, lat2] = geo.fromMap(geo.toMap([lon, lat]));
      worst = Math.max(worst, Math.abs(lon2 - lon), Math.abs(lat2 - lat));
    }
    assert.ok(worst < 1e-4, `round trip error ${worst}° (flaws=${flaws}, seed=${seed})`);
    // no folds: moving east always moves right-ish, north always up-ish
    for (let lon = 60.5; lon < 75; lon += 0.5) for (let lat = 29.4; lat < 38.5; lat += 0.5) {
      const a = geo.toMap([lon, lat]), e = geo.toMap([lon + 0.05, lat]), n = geo.toMap([lon, lat + 0.05]);
      const cross = (e[0] - a[0]) * (n[1] - a[1]) - (e[1] - a[1]) * (n[0] - a[0]);
      assert.ok(cross < 0, `fold at ${lon},${lat}`);
    }
    console.log(`ok  flaws=${flaws} seed=${seed}  worst round-trip ${worst.toExponential(1)}°`);
  }
}
