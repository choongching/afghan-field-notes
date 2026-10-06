"""Cut tiles/raw/<tier>_<z>.png into 256 px WebP tiles: tiles/<tier>/<z>/<x>/<y>.webp
Fully transparent tiles are skipped (the viewer shows nothing there anyway).
    python3 tools/slice-tiles.py
"""
import glob, os, re
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'tiles')
TILE = 256
# pencil marks on transparent paper: the alpha channel needn't be lossless (it was ~half of every file);
# quality 70 alpha is visually identical (mean diff <0.3/255) and halves the bytes. method 6 = slower, smaller.
WEBP = dict(quality=80, method=6, alpha_quality=70)
total = skipped = 0
for path in sorted(glob.glob(os.path.join(ROOT, 'raw', 't*_*.png'))):
    tier, z = re.match(r'(t\d)_(-?\d+)\.png', os.path.basename(path)).groups()
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    for tx in range((W + TILE - 1) // TILE):
        for ty in range((H + TILE - 1) // TILE):
            tile = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
            tile.paste(im.crop((tx * TILE, ty * TILE, min(W, (tx + 1) * TILE), min(H, (ty + 1) * TILE))), (0, 0))
            total += 1
            if tile.getchannel('A').getbbox() is None:
                skipped += 1
                continue
            out = os.path.join(ROOT, tier, z, str(tx))
            os.makedirs(out, exist_ok=True)
            tile.save(os.path.join(out, f'{ty}.webp'), 'WEBP', **WEBP)
    print(f'{tier} z{z}: {W}x{H}')
# opening-scene plates: one image each, shown whole at the overview
os.makedirs(os.path.join(ROOT, 'intro'), exist_ok=True)
for path in sorted(glob.glob(os.path.join(ROOT, 'raw', 'intro_*.png'))):
    name = os.path.basename(path)[6:-4]
    Image.open(path).convert('RGBA').save(os.path.join(ROOT, 'intro', f'{name}.webp'), 'WEBP', quality=72, method=6, alpha_quality=70)
    print(f'intro {name}: {os.path.getsize(os.path.join(ROOT, "intro", name + ".webp")) / 1e3:.0f} kB')
size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(ROOT, 't*', '**', '*.webp'), recursive=True))
print(f'{total - skipped} tiles written ({skipped} empty skipped), {size / 1e6:.1f} MB')
