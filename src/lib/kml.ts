import type { TrackPoint } from '../api/backend';
import { type BlockTimes, utcTime } from './blockTimes';

const FT_TO_M = 0.3048;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const c6 = (d: number) => d.toFixed(6);

/**
 * A flown track as KML for Google Earth, made on the device (no account or connection needed): a
 * timed track at its GPS altitude, the start and end, and the logged times where the aircraft was
 * at each. The same as the server's (Kml.java).
 */
export function flightKml(name: string, points: TrackPoint[], times?: BlockTimes | null): string {
  const alt = points.length > 0 && points.every(p => p.altFt != null);
  const mode = alt ? 'absolute' : 'clampToGround';
  const z = (p: TrackPoint) => (alt ? Math.round((p.altFt as number) * FT_TO_M) : 0);
  const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z');
  const mark = (label: string, p: TrackPoint, at = p.at) =>
    `  <Placemark><name>${esc(label)}</name><TimeStamp><when>${iso(at)}</when></TimeStamp><Point><altitudeMode>${mode}</altitudeMode>`
    + `<coordinates>${c6(p.lon)},${c6(p.lat)},${z(p)}</coordinates></Point></Placemark>\n`;
  const nearest = (t: number) => points.reduce((b, p) => (Math.abs(p.at - t) < Math.abs(b.at - t) ? p : b), points[0]);
  let out = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>${esc(name)}</name>
  <Style id="track"><LineStyle><color>ffef46d9</color><width>4</width></LineStyle><PolyStyle><color>40ef46d9</color></PolyStyle><IconStyle><scale>0</scale></IconStyle></Style>
  <Placemark>
    <name>${esc(name)}</name>
    <styleUrl>#track</styleUrl>
    <gx:Track>
      <extrude>${alt ? 1 : 0}</extrude>
      <altitudeMode>${mode}</altitudeMode>
${points.map(p => `      <when>${iso(p.at)}</when>`).join('\n')}
${points.map(p => `      <gx:coord>${c6(p.lon)} ${c6(p.lat)} ${z(p)}</gx:coord>`).join('\n')}
    </gx:Track>
  </Placemark>
`;
  if (points.length) {
    out += mark('Start', points[0]) + mark('End', points[points.length - 1]);
    ([['Off block', times?.offBlock], ['Takeoff', times?.takeoff], ['Landing', times?.landing], ['On block', times?.onBlock]] as const)
      .forEach(([label, t]) => { if (t) { const at = new Date(t).getTime(); out += mark(`${label} ${utcTime(at)}`, nearest(at), at); } });
  }
  return `${out}</Document>\n</kml>\n`;
}

/** Hands the browser a file to save. */
export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "flight-2026-11-27-1405.kml", by the first point (UTC). */
export function kmlFileName(points: TrackPoint[]): string {
  const d = new Date(points[0]?.at ?? Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  return `flight-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.kml`;
}
