#!/usr/bin/env python3
"""
Sweden's AIP data the app carries, rebuilt from LFV's eAIP:

- src/data/swedenFixes.json: the significant points (ENR 4.4, IFR/GNSS fixes)
- src/data/swedenNavaids.json: the en-route radio navaids (ENR 4.1, VOR/DME)
- src/data/swedenObstacles.json: the air navigation obstacles of 100 m (328 ft) or more (ENR 5.4,
  LFV's AREA1 obstacle dataset, a CSV in a zip on its Dataset page)

It takes the amendment in force today (the newest on the eAIP site's list), and records the AIRAC
cycle it checked: the app warns once that cycle is over, so run it each cycle. A cycle without an
amendment still moves the check on. .github/workflows/aip-data.yml runs it daily and opens a pull
request when the files change.

  python3 scripts/update-aip.py               # as of today
  python3 scripts/update-aip.py --today 2026-11-26

Python's standard library only. Exits non-zero, leaving the files alone, when the site or a page
doesn't look as expected.
"""
import argparse
import csv
import datetime as dt
import html
import io
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import zipfile

BASE = 'https://www.aro.lfv.se/content/eaip/'
LISTING = BASE + 'default_offline.html'
DATASETS = 'https://www.aro.lfv.se/Editorial/View/Dataset'
DATA = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'data'
# Any AIRAC effective date: the cycles run every 28 days from it.
AIRAC_REFERENCE = dt.date(2026, 11, 26)


def get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; aip-data-update)'})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def get(url: str) -> str:
    return get_bytes(url).decode('utf-8', 'replace')


def obstacles(today: dt.date) -> tuple[dt.date, str, list[list]]:
    """
    The newest obstacle dataset in force: (effective date, its URL, rows). Each row is
    [lat, lon, top ft MSL, height ft AGL, type, name, lit], compact as there are thousands.
    """
    page = get(DATASETS)
    found = []
    for path, wef in set(re.findall(r'href="(/Editorial/View/General/\d+/LFV_OBSTACLE_DATASET_AREA1_WEF_(\d{8})\.zip)"', page)):
        found.append((dt.datetime.strptime(wef, '%Y%m%d').date(), 'https://www.aro.lfv.se' + path))
    in_force = sorted(f for f in found if f[0] <= today)
    if not in_force:
        raise ValueError(f'No obstacle dataset in force on {today} on {DATASETS}: has the page changed?')
    effective, url = in_force[-1]
    with zipfile.ZipFile(io.BytesIO(get_bytes(url))) as z:
        name = next(n for n in z.namelist() if n.upper().endswith('.CSV'))
        text = z.read(name).decode('utf-8-sig')
    rows = []
    for r in csv.DictReader(io.StringIO(text), delimiter=';'):
        r = {k.strip(): (v or '').strip() for k, v in r.items() if k}
        if r.get('ELEVATION_UOM') != 'FT' or r.get('HEIGHT_UOM') != 'FT' or r.get('STATUS', 'COMPLETED') != 'COMPLETED':
            continue
        rows.append([round(float(r['LATITUDE_DD']), 5), round(float(r['LONGITUDE_DD']), 5), int(float(r['ELEVATION'])),
                     int(float(r['HEIGHT'])), r['OBSTACLE_TYPE'], r['NAME'], r['LIGHTING'] == 'Y'])
    if len(rows) < 1000:
        raise ValueError(f'Obstacle dataset: only {len(rows)} obstacles; has the format changed?')
    return effective, url, rows


def text_of(page: str) -> str:
    """The page's text; struck-out amendment marks dropped."""
    page = re.sub(r'<(span|div)[^>]*class="[^"]*deleted[^"]*"[^>]*>.*?</\1>', '', page, flags=re.S)
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', page)))


def amendments(listing: str) -> list[tuple[dt.date, str]]:
    """Every edition on the list as (effective date, folder), e.g. (2026-11-26, 'AIRAC AIP AMDT 7-2026_2026_11_26')."""
    out = []
    for folder in set(re.findall(r'href="([^"\\/]+_\d{4}_\d{2}_\d{2})[\\/]index-v2\.html"', listing)):
        y, m, d = map(int, folder.rsplit('_', 3)[1:])
        out.append((dt.date(y, m, d), folder))
    return sorted(out)


def airac_start(day: dt.date) -> dt.date:
    """The start of the AIRAC cycle the day is in."""
    return AIRAC_REFERENCE + dt.timedelta(days=28 * ((day - AIRAC_REFERENCE).days // 28))


def coordinate(deg: str, minutes: str, seconds: str, hemisphere: str) -> float:
    value = int(deg) + int(minutes) / 60 + float(seconds) / 3600
    return round(-value if hemisphere in 'SW' else value, 5)


def fixes(text: str) -> list[dict]:
    row = re.compile(r'\b([A-Z]{5})\s+(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])\s+(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])\s+(.*?)'
                     r'(?=\s[A-Z]{5}\s+\d{6}(?:\.\d+)?[NS]\s|$)')
    out, seen = [], set()
    for m in row.finditer(text):
        if m.group(1) in seen:
            continue
        seen.add(m.group(1))
        routes = m.group(10).split(' (')[0].strip()
        out.append({'name': m.group(1), 'lat': coordinate(*m.group(2, 3, 4, 5)), 'lon': coordinate(*m.group(6, 7, 8, 9)),
                    'routes': '' if routes == '-' else routes})
    if len(out) < 100:
        raise ValueError(f'ENR 4.4: only {len(out)} points found; has the page changed?')
    return out


STATION = re.compile(r"^(.+?) (DVOR/DME|VOR/DME|DVORTAC|VORTAC|DVOR|VOR|DME|TACAN|NDB)\b")
POSITION = re.compile(r'(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS]) (\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])')


def navaids(page: str) -> list[dict]:
    """From the table's cells: the remarks run into the next station's name in the plain text."""
    page = re.sub(r'<(span|div)[^>]*class="[^"]*deleted[^"]*"[^>]*>.*?</\1>', '', page, flags=re.S)
    out = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', page, flags=re.S):
        cells = [text_of(c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', row, flags=re.S)]
        if len(cells) < 5:
            continue
        station, at = STATION.match(cells[0]), POSITION.search(cells[4])
        if not station or not at or not re.fullmatch(r'[A-Z]{2,3}', cells[1]):
            continue
        freq = re.search(r'(\d{3}\.\d{2,3}) MHz', cells[2])
        channel = re.search(r'CH\d+[XY]', cells[2])
        out.append({'name': station.group(1), 'type': station.group(2), 'ident': cells[1],
                    'frequency': freq.group(1) if freq else None, 'channel': channel.group(0) if channel else None,
                    'lat': coordinate(*at.group(1, 2, 3, 4)), 'lon': coordinate(*at.group(5, 6, 7, 8))})
    if len(out) < 10:
        raise ValueError(f'ENR 4.1: only {len(out)} navaids found; has the page changed?')
    return out


def page_url(folder: str, section: str) -> str:
    return BASE + urllib.parse.quote(f'{folder}/eAIP/ES-{section}-en-GB.html')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--today', type=dt.date.fromisoformat, default=dt.datetime.now(dt.timezone.utc).date())
    args = parser.parse_args()

    in_force = [a for a in amendments(get(LISTING)) if a[0] <= args.today]
    if not in_force:
        sys.exit(f'No amendment in force on {args.today} on {LISTING}: has the page changed?')
    effective, folder = in_force[-1]
    label = folder.rsplit('_', 3)[0].replace('-', '/', 1) if re.search(r'\d+-\d{4}_', folder) else folder
    when = effective.strftime('%d %b %Y').upper()
    # Checked against the AIP for this cycle: the newest amendment in force, or none newer.
    checked = max(effective, airac_start(args.today)).isoformat()

    files = {
        'swedenFixes.json': ('ENR 4.4', 'name-code designators for significant points', 'points', lambda page: fixes(text_of(page))),
        'swedenNavaids.json': ('ENR 4.1', 'radio navigation aids en-route', 'navaids', navaids),
    }
    written = {}
    for name, (section, title, key, parse) in files.items():
        url = page_url(folder, section)
        items = parse(get(url))
        written[name] = {'source': f'AIP Sweden {section}, {title}, {label} ({when})', 'sourceUrl': url,
                         'effective': effective.isoformat(), 'checked': checked, key: items}
    obst_effective, obst_url, obst_rows = obstacles(args.today)
    written['swedenObstacles.json'] = {
        'source': f'AIP Sweden ENR 5.4, LFV AREA1 obstacle dataset ({obst_effective.strftime("%d %b %Y").upper()}): '
                  'obstacles of 100 m (328 ft) or more; LFV notes the set is not complete',
        'sourceUrl': obst_url, 'effective': obst_effective.isoformat(),
        'checked': max(obst_effective, airac_start(args.today)).isoformat(),
        'columns': ['lat', 'lon', 'topFtMsl', 'heightFtAgl', 'type', 'name', 'lit'], 'obstacles': obst_rows,
    }
    for name, content in written.items():
        (DATA / name).write_text(json.dumps(content, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        count = len(content.get('points') or content.get('navaids') or content.get('obstacles') or [])
        print(f'{name}: {count}, effective {content["effective"]}, checked {content["checked"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
