"""Build data/afghanistan.json from Natural Earth 10m (public domain).

    python3 tools/build-map-data.py

Raw files live in data/raw/ (see README in this script's docstring for sources:
https://github.com/nvkelso/natural-earth-vector/tree/master/geojson).
Output is lon/lat, simplified (Ramer–Douglas–Peucker) — projection happens in JS.
"""
import json, math, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'data')
RAW = os.path.join(ROOT, 'raw')
BB = (58.0, 27.5, 77.5, 40.5)  # generous: neighbours fade out past the frame

def load(name):
    with open(os.path.join(RAW, name + '.geojson')) as f:
        return json.load(f)['features']

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[: idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def lines(geom):
    """Every ring / linestring of a geometry as a list of [lon, lat]."""
    t, c = geom['type'], geom['coordinates']
    if t == 'LineString': return [c]
    if t == 'MultiLineString': return c
    if t == 'Polygon': return c
    if t == 'MultiPolygon': return [r for p in c for r in p]
    return []

def inside(pts):
    return any(BB[0] <= x <= BB[2] and BB[1] <= y <= BB[3] for x, y in pts)

def simp(pts, eps):
    pts = [tuple(p) for p in pts]
    if len(pts) > 3 and pts[0] == pts[-1]:
        # closed ring: RDP needs distinct endpoints, so simplify two halves
        m = len(pts) // 2
        out = rdp(pts[: m + 1], eps)[:-1] + rdp(pts[m:], eps)
    else:
        out = rdp(pts, eps)
    return [[round(x, 3), round(y, 3)] for x, y in out]

out = {'source': 'Natural Earth 10m (public domain) + hand-traced approximations where noted'}

countries = load('ne_10m_admin_0_countries')
afg = next(f for f in countries if f['properties']['ADMIN'] == 'Afghanistan')
out['afghanistan'] = [simp(r, 0.012) for r in lines(afg['geometry']) if len(r) > 20]
out['neighbours'] = [simp(r, 0.03) for f in countries if f['properties']['ADMIN'] != 'Afghanistan'
                     for r in lines(f['geometry']) if inside(r) and len(r) > 30]

rivers = []
for f in load('ne_10m_rivers_lake_centerlines'):
    n = f['properties'].get('name')
    if n and f['geometry']:
        for r in lines(f['geometry']):
            if inside(r):
                rivers.append({'name': n.replace('  ', ' '), 'rank': f['properties'].get('scalerank'), 'pts': simp(r, 0.015)})
# Hand-traced (approximate) — Natural Earth 10m omits these, but they shape the country.
APPROX = {
    'Kabul': [[68.35, 34.45], [68.9, 34.52], [69.2, 34.53], [69.6, 34.5], [70.0, 34.45], [70.45, 34.42], [70.9, 34.28], [71.1, 34.1], [71.55, 34.02]],
    'Arghandab': [[67.9, 33.4], [67.3, 32.9], [66.8, 32.45], [66.2, 31.95], [65.75, 31.65], [65.2, 31.3], [64.5, 31.1]],
    'Kunduz': [[67.9, 34.8], [68.3, 35.3], [68.6, 35.9], [68.85, 36.45], [68.75, 36.95], [68.3, 37.25]],
    'Balkh': [[67.1, 35.3], [67.0, 35.75], [66.9, 36.2], [66.85, 36.6]],
    'Kokcha': [[70.8, 36.2], [70.6, 36.8], [69.9, 37.1], [69.55, 37.3]],
}
for n, pts in APPROX.items():
    rivers.append({'name': n, 'rank': 7, 'approx': True, 'pts': pts})
out['rivers'] = rivers

out['lakes'] = [{'name': 'Band-e Amir', 'approx': True, 'at': [67.2, 34.84]}]

# Marco Polo's route across northern Afghanistan, c. 1272 (approximate, after
# the Travels: Sapurgan → Balc → Taican → Casem → Badashan → Vokhan → Pamier).
out['marcoPolo'] = [[65.75, 36.67], [66.9, 36.76], [68.0, 36.75], [69.53, 36.74], [70.0, 36.95],
                    [70.58, 37.12], [71.3, 36.95], [71.6, 36.7], [72.5, 36.95], [73.5, 37.1], [74.5, 37.3]]

regions = []
for f in load('ne_10m_geography_regions_polys'):
    p = f['properties']
    if p.get('FEATURECLA') in ('Range/mtn', 'Desert') and f['geometry']:
        rings = [r for r in lines(f['geometry']) if inside(r)]
        if rings:
            regions.append({'name': p['NAME'].title().replace(' .', '.').replace('Ra.', 'Range'),
                            'kind': 'mountains' if p['FEATURECLA'] == 'Range/mtn' else 'desert',
                            'rings': [simp(r, 0.03) for r in rings]})
out['regions'] = regions

out['cities'] = sorted([
    {'name': f['properties']['name'], 'rank': f['properties']['scalerank'],
     'at': [round(f['geometry']['coordinates'][0], 3), round(f['geometry']['coordinates'][1], 3)]}
    for f in load('ne_10m_populated_places_simple') if f['properties']['adm0name'] == 'Afghanistan'
], key=lambda c: c['rank'])

with open(os.path.join(ROOT, 'afghanistan.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print({k: len(v) for k, v in out.items() if isinstance(v, list)}, os.path.getsize(os.path.join(ROOT, 'afghanistan.json')) // 1024, 'KB')
