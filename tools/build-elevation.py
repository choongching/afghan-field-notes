"""Build data/afg-elevation.json: an elevation grid for Afghanistan.

    python3 tools/build-elevation.py

Source: AWS Terrain Tiles (Mapzen "terrarium" encoding, public, no key)
  https://registry.opendata.aws/terrain-tiles/
  elevation_m = R * 256 + G + B / 256 - 32768
Output grid is equirectangular (lon/lat), `step` degrees per cell, int16 metres,
little-endian, base64 — small enough to ship to the browser.
"""
import base64, json, math, os, struct, urllib.request
from io import BytesIO
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'data')
CACHE = os.path.join(ROOT, 'raw', 'terrain')
os.makedirs(CACHE, exist_ok=True)

Z = 7
BOUNDS = (60.3, 29.2, 75.2, 38.7)  # lon0, lat0, lon1, lat1
STEP = 0.025                        # degrees (~2.3 km E–W, 2.8 km N–S)
N = 2 ** Z

def tile_xy(lon, lat):
    x = (lon + 180) / 360 * N
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * N
    return x, y

tiles = {}
def tile(tx, ty):
    if (tx, ty) not in tiles:
        path = os.path.join(CACHE, f'{Z}_{tx}_{ty}.png')
        if not os.path.exists(path):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
            with urllib.request.urlopen(url, timeout=30) as r, open(path, 'wb') as f:
                f.write(r.read())
        tiles[(tx, ty)] = Image.open(path).convert('RGB').load()
    return tiles[(tx, ty)]

def elevation(lon, lat):
    x, y = tile_xy(lon, lat)
    tx, ty = int(x), int(y)
    px, py = min(255, int((x - tx) * 256)), min(255, int((y - ty) * 256))
    R, G, B = tile(tx, ty)[px, py]
    return R * 256 + G + B / 256 - 32768

w = round((BOUNDS[2] - BOUNDS[0]) / STEP)
h = round((BOUNDS[3] - BOUNDS[1]) / STEP)
vals = []
for j in range(h):
    lat = BOUNDS[3] - (j + 0.5) * STEP   # row 0 = north
    for i in range(w):
        lon = BOUNDS[0] + (i + 0.5) * STEP
        vals.append(max(-500, min(9000, round(elevation(lon, lat)))))

out = {
    'source': 'AWS Terrain Tiles (terrarium), zoom 7',
    'bounds': BOUNDS, 'step': STEP, 'w': w, 'h': h,
    'min': min(vals), 'max': max(vals),
    'int16': base64.b64encode(struct.pack(f'<{len(vals)}h', *vals)).decode(),
}
with open(os.path.join(ROOT, 'afg-elevation.json'), 'w') as f:
    json.dump(out, f)

# quick greyscale preview for eyeballing
img = Image.new('L', (w, h))
img.putdata([int(255 * max(0, v) / 7500) for v in vals])
img.save(os.path.join(ROOT, 'raw', 'elevation-preview.png'))
print(f'{w}x{h} cells, {len(tiles)} tiles, {out["min"]}..{out["max"]} m, '
      f'{os.path.getsize(os.path.join(ROOT, "afg-elevation.json")) // 1024} KB')
