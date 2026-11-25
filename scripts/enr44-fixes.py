#!/usr/bin/env python3
"""
Sweden's significant points (AIP ENR 4.4, name-code designators) as src/data/swedenFixes.json,
for the navigation map. Run on each AIRAC cycle with the eAIP page's URL:

  curl -sS -o /tmp/enr44.html "https://www.aro.lfv.se/content/eaip/<AMDT folder>/eAIP/ES-ENR%204.4-en-GB.html"
  python3 scripts/enr44-fixes.py /tmp/enr44.html "<source text>" "<url>" > src/data/swedenFixes.json
"""
import html
import json
import re
import sys

page, source, url = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(page, encoding='utf-8', errors='replace').read()
# Amendment marks: a deleted entry is struck out, not gone.
s = re.sub(r'<(span|div)[^>]*class="[^"]*deleted[^"]*"[^>]*>.*?</\1>', '', s, flags=re.S)
text = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s)))
row = re.compile(r'\b([A-Z]{5})\s+(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])\s+(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])\s+(.*?)'
                 r'(?=\s[A-Z]{5}\s+\d{6}(?:\.\d+)?[NS]\s|$)')
points, seen = [], set()
for m in row.finditer(text):
    if m.group(1) in seen:
        continue
    seen.add(m.group(1))
    lat = int(m.group(2)) + int(m.group(3)) / 60 + float(m.group(4)) / 3600
    lon = int(m.group(6)) + int(m.group(7)) / 60 + float(m.group(8)) / 3600
    routes = m.group(10).split(' (')[0].strip()
    points.append({'name': m.group(1), 'lat': round(-lat if m.group(5) == 'S' else lat, 5),
                   'lon': round(-lon if m.group(9) == 'W' else lon, 5), 'routes': '' if routes == '-' else routes})
if len(points) < 100:
    sys.exit(f'Only {len(points)} points found: has the page changed?')
json.dump({'source': source, 'sourceUrl': url, 'points': points}, sys.stdout, ensure_ascii=False, separators=(',', ':'))
print()
