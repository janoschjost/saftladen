#!/usr/bin/env python3
"""Regenerates src/render/cityData.ts: the real neighbourhood of Bogenstrasse 7a, St. Gallen, as the game's city.

Buildings: OpenStreetMap (Overpass). Heights of the ground: swisstopo height service. Game coordinates: x east,
z south, metres. The data is turned by the angle of 7a's footprint (its smallest bounding rectangle) so that rectangle lies
axis-aligned like the office, and is centred on the rectangle: the office's main body goes there, 1:1 (the office is in real metres).

Usage: python3 scripts/city-data.py [overpass.json]  (a saved Overpass answer skips the download when that server is busy)
"""
import json, math, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

LAT0, LON0 = 47.4206566, 9.3636250  # the centre of the building (Bogenstrasse 7a)
HALF, STEP = 300, 20
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
UA = {'User-Agent': 'saftladen-city-data'}


def lv95(lat, lon):
    p = (lat * 3600 - 169028.66) / 10000
    l = (lon * 3600 - 26782.5) / 10000
    return (2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
            1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)


E0, N0 = lv95(LAT0, LON0)
local = lambda lat, lon: ((lon - LON0) * KX, -(lat - LAT0) * KY)  # east, south from the centre point


def footprint_frame(osm):
    """The angle (radians) and centre (east, south) of the smallest rectangle round Bogenstrasse 7a."""
    for e in osm['elements']:
        t = e['tags']
        if t.get('addr:street') == 'Bogenstrasse' and t.get('addr:housenumber') == '7a' and 'building' in t:
            pts = [local(p['lat'], p['lon']) for p in e['geometry']]
            def extent(a):
                c, s_ = math.cos(a), math.sin(a)
                us = [x * c + z * s_ for x, z in pts]
                vs = [-x * s_ + z * c for x, z in pts]
                return max(us) - min(us), max(vs) - min(vs), (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2

            a = min((math.radians(k / 10) for k in range(900)), key=lambda a: extent(a)[0] * extent(a)[1])
            if extent(a)[0] < extent(a)[1]:
                a += math.pi / 2  # the long side along x
            a = (a + math.pi / 2) % math.pi - math.pi / 2  # the smallest turn: north stays up
            w, d, cu, cv = extent(a)
            c, s_ = math.cos(a), math.sin(a)
            print(f'7a: {w:.1f} x {d:.1f} m, turned {math.degrees(a):.1f} deg')
            return a, cu * c - cv * s_, cu * s_ + cv * c
    raise SystemExit('7a not found')


def turn(a, cx, cz, x, z):
    """A point (east, south from the centre point) in the game's frame: relative to the rectangle's centre, turned by -a."""
    x, z = x - cx, z - cz
    return x * math.cos(a) + z * math.sin(a), -x * math.sin(a) + z * math.cos(a)


game = lambda lat, lon: turn(ANGLE, CX, CZ, *local(lat, lon))


def overpass():
    q = f'[out:json][timeout:60];(way["building"](around:{HALF},{LAT0},{LON0});way["highway"](around:{HALF},{LAT0},{LON0}););out geom tags;'
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        try:
            req = urllib.request.Request(url, urllib.parse.urlencode({'data': q}).encode(), UA)
            return json.load(urllib.request.urlopen(req, timeout=90))
        except Exception:
            pass
    raise SystemExit('overpass failed')


def height(ij):
    gx, gz = -HALF + ij[0] * STEP, -HALF + ij[1] * STEP
    rx = gx * math.cos(ANGLE) - gz * math.sin(ANGLE) + CX  # back to east, south from the centre point
    rz = gx * math.sin(ANGLE) + gz * math.cos(ANGLE) + CZ
    url = f'https://api3.geo.admin.ch/rest/services/height?easting={E0 + rx:.1f}&northing={N0 - rz:.1f}&sr=2056'
    for _ in range(4):
        try:
            return float(json.load(urllib.request.urlopen(url, timeout=20))['height'])
        except Exception:
            pass
    return None


osm = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else overpass()  # first: it fails fast when the server is busy
ANGLE, CX, CZ = footprint_frame(osm)
n = 2 * HALF // STEP + 1
with ThreadPoolExecutor(16) as ex:
    hs = list(ex.map(height, [(i, j) for j in range(n) for i in range(n)]))
c = hs[(n // 2) * n + n // 2]  # the ground at the office
grid = [round((c if h is None else h) - c, 1) for h in hs]

LEVELS = {'apartments': 4, 'office': 4, 'house': 2, 'detached': 2, 'roof': 1, 'garages': 1, 'service': 1, 'commercial': 3, 'industrial': 2, 'hotel': 5, 'church': 4}
buildings = []
for e in osm['elements']:
    t = e['tags']
    if 'building' not in t:
        continue
    if t.get('addr:street') == 'Bogenstrasse' and t.get('addr:housenumber') == '7a':
        continue  # the office takes its place
    g = [game(p['lat'], p['lon']) for p in e['geometry']][:-1]
    if len(g) < 3 or min(math.hypot(x, z) for x, z in g) > HALF - 20:
        continue
    try:
        h = float(t['height'].split()[0])
    except Exception:
        try:
            h = float(t['building:levels']) * 3.2 + 1.5
        except Exception:
            h = LEVELS.get(t['building'], 3) * 3.2 + 1.5
    buildings.append((round(h, 1), [round(v, 1) for p in g for v in p]))

ROAD_WIDTH = {'primary': 9, 'secondary': 9, 'tertiary': 7, 'residential': 5.5, 'unclassified': 5.5, 'living_street': 5}
roads = []
for e in osm['elements']:
    t = e['tags']
    if t.get('highway') not in ROAD_WIDTH or t.get('tunnel') in ('yes', 'building_passage'):
        continue
    run = []
    for p in e['geometry'] + [None]:
        g = game(p['lat'], p['lon']) if p else None
        if g and abs(g[0]) < HALF and abs(g[1]) < HALF:
            run.append(g)
            continue
        if len(run) > 1:
            roads.append((ROAD_WIDTH[t['highway']], [round(v, 1) for q in run for v in q]))
        run = []

rows = '\n'.join('    ' + ', '.join(str(v) for v in grid[j * n:(j + 1) * n]) + ',' for j in range(n))
roads_ts = '\n'.join(f'  {{ w: {w}, p: [{", ".join(map(str, p))}] }},' for w, p in roads)
blds = '\n'.join(f'  {{ h: {h}, p: [{", ".join(map(str, p))}] }},' for h, p in buildings)
open('src/render/cityData.ts', 'w').write(f'''/**
 * The neighbourhood of the real office (Bogenstrasse 7a, St. Gallen) as data, generated by `scripts/city-data.py` from
 * OpenStreetMap buildings (© OpenStreetMap contributors, ODbL) and the swisstopo height model (© swisstopo).
 * Metres, relative to the real building's centre, turned by the angle of the real footprint (about 26°) so it lies
 * axis-aligned like the office (x east, z south), centred on it.
 */

/** The terrain: heights (m, relative to the office's ground) on a grid of `step` m, `n` x `n` points, from `-half` to `half` in x and z (row by row in z). */
export const TERRAIN = {{
  half: {HALF},
  step: {STEP},
  n: {n},
  heights: [
{rows}
  ],
}};

/** The buildings: a height above the ground (m) and the footprint as x, z pairs. */
export const BUILDINGS: ReadonlyArray<{{ h: number; p: readonly number[] }}> = [
{blds}
];

/** The roads (primary, secondary, tertiary and residential streets, no tunnels): a width (m) and the centre line as x, z pairs. */
export const ROADS: ReadonlyArray<{{ w: number; p: readonly number[] }}> = [
{roads_ts}
];
''')
print(len(buildings), 'buildings,', len(roads), 'road pieces, ground', min(grid), max(grid))
