import L from 'leaflet';
import { type AirportLayout, holdingBar, isUnpaved, metersPerPixel, runwayEnds, taxiwayLabels } from '../../lib/airportLayout';

/** From this zoom in, the fields' runways and taxiways are drawn over the base map. */
export const LAYOUT_MIN_ZOOM = 13;
/** Taxiway letters from this zoom in, holding position names from the next. */
const TAXIWAY_LABEL_ZOOM = 15;
/** The panes: the drawing under the route and the aircraft, its labels above the route line. */
export const LAYOUT_PANE = 'airportLayout';
export const LAYOUT_LABEL_PANE = 'airportLayoutLabels';

export function addLayoutPanes(map: L.Map): void {
  if (!map.getPane(LAYOUT_PANE)) map.createPane(LAYOUT_PANE).style.zIndex = '350';
  if (!map.getPane(LAYOUT_LABEL_PANE)) {
    const pane = map.createPane(LAYOUT_LABEL_PANE);
    pane.style.zIndex = '450';
    pane.style.pointerEvents = 'none';
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const label = (at: [number, number], text: string, kind: 'rwy' | 'twy' | 'hold') => L.marker(at, {
  pane: LAYOUT_LABEL_PANE, interactive: false, keyboard: false,
  icon: L.divIcon({ className: `apt-label apt-label--${kind}`, iconSize: [0, 0], html: `<span class="upright">${esc(text)}</span>` }),
});

/**
 * Draws the fields as a chart would: aprons grey, taxiways dark with a yellow centre line, runways
 * dark (green-brown when unpaved) with white edges, centre line and their numbers at each end, and
 * holding positions as red bars across the taxiway. Widths are true to scale, never thinner than a
 * few pixels. Drawn afresh at each zoom.
 */
export function drawAirportLayouts(group: L.LayerGroup, layouts: AirportLayout[], zoom: number): void {
  group.clearLayers();
  // Before the map has a view its zoom is undefined.
  if (!Number.isFinite(zoom) || zoom < LAYOUT_MIN_ZOOM) return;
  const line = (pts: Array<[number, number]>, o: L.PolylineOptions) =>
    group.addLayer(L.polyline(pts, { pane: LAYOUT_PANE, interactive: false, lineCap: 'butt', lineJoin: 'round', ...o }));
  for (const layout of layouts) {
    const lat = layout.features.find(f => f.points.length)?.points[0][0];
    if (lat === undefined) continue;
    const mpp = metersPerPixel(lat, zoom);
    const px = (m: number, min: number) => Math.max(min, m / mpp);
    const of = (kind: string) => layout.features.filter(f => f.kind === kind);
    const runways = of('runway'), taxiways = of('taxiway');

    of('apron').forEach(a => group.addLayer(L.polygon(a.points, {
      pane: LAYOUT_PANE, interactive: false, stroke: false, fillColor: '#64748b', fillOpacity: 0.45,
    })));
    taxiways.forEach(t => line(t.points, { color: '#475569', weight: px(t.widthM ?? 15, 3), opacity: 0.9, lineCap: 'round' }));
    taxiways.forEach(t => line(t.points, { color: '#facc15', weight: zoom >= TAXIWAY_LABEL_ZOOM ? 2 : 1.25, opacity: 0.95 }));
    runways.forEach(r => line(r.points, { color: '#ffffff', weight: px(r.widthM ?? 30, 6) + 3, opacity: 0.95 }));
    runways.forEach(r => line(r.points, { color: isUnpaved(r) ? '#4d7c0f' : '#1f2937', weight: px(r.widthM ?? 30, 6), opacity: 1 }));
    if (zoom >= 14) runways.forEach(r => line(r.points, { color: '#ffffff', weight: 1.5, dashArray: '10 8', opacity: 0.9 }));
    of('holding').forEach(h => {
      const bar = holdingBar(h, taxiways);
      if (!bar) return;
      line(bar, { color: '#dc2626', weight: zoom >= 16 ? 4 : 3, opacity: 1, lineCap: 'round' });
      if (zoom >= TAXIWAY_LABEL_ZOOM + 1 && h.ref) group.addLayer(label(bar[0], h.ref, 'hold'));
    });

    runways.forEach(r => runwayEnds(r, Math.max(40, 14 * mpp)).forEach(e => group.addLayer(label(e.at, e.label, 'rwy'))));
    if (zoom >= TAXIWAY_LABEL_ZOOM) taxiwayLabels(taxiways, Math.max(250, 120 * mpp)).forEach(l => group.addLayer(label(l.at, l.label, 'twy')));
  }
}
