import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AIRSPACE_TILE_URL, fetchMapArea, fetchMapStatus, fetchPointInfo, type MapStatus, nearestAirports } from '../../api/backend';
import { parsePosition, positionCode, positionText, routeLabels } from '../../lib/routePoint';
import { pointInfoHtml } from '../../lib/frequencies';
import { asRoutePoint, type RouteReportingPoint } from '../../lib/useRouteWeather';
import type { MapArea } from '../../types/route';
import { fixesIn, type SignificantPoint } from '../../lib/swedenFixes';
import { courseDeg, distanceNm } from '../../lib/openMeteo';

export interface MapAirport {
  code: string;
  name?: string;
  lat: number;
  lon: number;
}

interface RouteMapProps {
  /** Departure, any waypoints and arrival, in order. */
  airports: MapAirport[];
  /**
   * Makes the waypoints draggable and adds a handle mid-leg to drag out a new one; called with the
   * waypoints' codes (airports, or positions like 5912N01734E) after each change.
   */
  onWaypointsChange?: (via: string[]) => void;
  maxWaypoints?: number;
  /** Visual reporting points to show; with onWaypointsChange, the route can go through them. */
  reportingPoints?: RouteReportingPoint[];
  /** Makes the arrival draggable: dropped on another airport, called with that airport's code. */
  onArrivalChange?: (code: string) => void;
}

/** Reporting point names show from this zoom in; further out, on hover only. */
const VRP_LABEL_ZOOM = 9;
/** Whether the IFR/GNSS fixes layer is on, as last chosen on this device (on at first). */
const SHOW_FIX_KEY = 'map.showIfrFixes';
const fixesWanted = () => { try { return localStorage.getItem(SHOW_FIX_KEY) !== 'no'; } catch { return true; } };

type At = { lat: number; lon: number };
const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');
/** "ESSX → WP1: 23 NM, 045° true", as the route list says it. */
export function legText(from: string, to: string, a: At, b: At): string {
  const nm = distanceNm(a.lat, a.lon, b.lat, b.lon);
  return `${from} → ${to}: ${nm < 10 ? nm.toFixed(1) : Math.round(nm)} NM, ${pad3(courseDeg(a.lat, a.lon, b.lat, b.lon))}° true`;
}

/** Where a new waypoint adds the least distance: the index in the waypoints to put it at. */
export function bestInsert(route: Array<{ lat: number; lon: number }>, at: { lat: number; lon: number }): number {
  const d = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => L.latLng(a.lat, a.lon).distanceTo([b.lat, b.lon]);
  let best = 0, extra = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const e = d(route[i], at) + d(at, route[i + 1]) - d(route[i], route[i + 1]);
    if (e < extra) { extra = e; best = i; }
  }
  return best;
}

/** Dropped this close to an airport on screen, a waypoint becomes that airport. */
const SNAP_PX = 14;
/** The arrival is dropped on an airport this close on screen, or one this near; else it goes back. */
const ARRIVAL_SNAP_PX = 40;
const ARRIVAL_SNAP_NM = 5;

/** From this zoom in, the map shows every airport in view and their reporting points. */
export const AREA_ZOOM = 8;
/** The part of the map asked for is rounded out to this grid, so a small pan asks nothing new. */
const AREA_GRID = 0.25;
type Area = { airports: MapArea['airports']; points: RouteReportingPoint[] };
const NO_AREA: Area = { airports: [], points: [] };
const areas = new Map<string, Promise<Area | null>>();

/** The airports and reporting points in (a little more than) these bounds; null when too big an area. */
export function areaOf(b: L.LatLngBounds): Promise<Area | null> | null {
  const south = Math.max(-90, Math.floor(b.getSouth() / AREA_GRID) * AREA_GRID);
  const north = Math.min(90, Math.ceil(b.getNorth() / AREA_GRID) * AREA_GRID);
  const west = Math.floor(b.getWest() / AREA_GRID) * AREA_GRID;
  const east = Math.ceil(b.getEast() / AREA_GRID) * AREA_GRID;
  if (north - south > 5 || east - west > 10) return null;
  const wrap = (lon: number) => L.Util.wrapNum(lon, [-180, 180], true);
  const box: [number, number, number, number] = [south, wrap(west), north, wrap(east)];
  const key = box.join(',');
  let p = areas.get(key);
  if (!p) {
    if (areas.size > 100) areas.clear();
    p = Promise.resolve().then(() => fetchMapArea(...box)).then(a => (a ? {
      airports: a.airports,
      points: a.reportingPoints.map(r => asRoutePoint(r.airport, r)),
    } : null), () => null);
    areas.set(key, p);
    // A failure is asked again next time.
    p.then(a => { if (!a) areas.delete(key); });
  }
  return p;
}

/** Test hook. */
export function resetAreas(): void {
  areas.clear();
}
const keyOf = (airports: MapAirport[]) => airports.map(a => `${a.code}@${a.lat.toFixed(4)},${a.lon.toFixed(4)}`).join('|');

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Short, so the credits fit on one line on a phone.
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const OPENAIP_CREDIT = 'airspace &copy; <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a> '
  + '<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC</a>';
const ROUTE_COLOR = '#d946ef';
const AIRPORT_COLOR = '#0d9488';

let statusPromise: Promise<MapStatus | null> | null = null;
/** Asked once per page load; a failure means "no overlay". */
function mapStatus(): Promise<MapStatus | null> {
  if (!statusPromise) statusPromise = fetchMapStatus().catch(() => null);
  return statusPromise;
}

/** Test hook. */
export function resetMapStatus(): void {
  statusPromise = null;
}

/** The route on a map, with openAIP's airspace on top. */
const RouteMap: React.FC<RouteMapProps> = ({
  airports, onWaypointsChange, maxWaypoints = 18, reportingPoints = [], onArrivalChange,
}) => {
  const container = React.useRef<HTMLDivElement>(null);
  /** While plotting a course: what a click on the map does. */
  const plotClick = React.useRef<((at: L.LatLng) => void) | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const routeLayer = React.useRef<L.LayerGroup | null>(null);
  /** The airports in view and their reporting points, under the route. */
  const areaLayer = React.useRef<L.LayerGroup | null>(null);
  const [area, setArea] = React.useState<Area>(NO_AREA);
  const areaRef = React.useRef<Area>(NO_AREA);
  areaRef.current = area;
  /** What tapping an airport or reporting point does: set by the route's drawing. */
  const pickRef = React.useRef<((p: MapAirport, html: string, kind: 'airport' | 'vrp') => void) | null>(null);
  const [status, setStatus] = React.useState<MapStatus | null | undefined>(undefined);

  React.useEffect(() => {
    let live = true;
    mapStatus().then(s => { if (live) setStatus(s); });
    return () => { live = false; };
  }, []);

  // The map itself, once the overlay status is known.
  React.useEffect(() => {
    if (status === undefined || !container.current) return;
    const touch = L.Browser.mobile;
    const map = L.map(container.current, {
      // One finger scrolls the page on a phone; two move and zoom the map.
      dragging: !touch,
      scrollWheelZoom: false,
      zoomSnap: 0.5,
      minZoom: 4,
      maxZoom: 13,
      worldCopyJump: true,
      attributionControl: false,
    });
    L.control.attribution({ prefix: false }).addTo(map);
    // Leaflet needs a view before anything is drawn; the route effect fits it to the route.
    map.setView([60, 15], 5);
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_CREDIT, className: 'basemap-tiles' }).addTo(map);
    // Sweden's IFR/GNSS fixes (AIP ENR 4.4) in view, close enough in; tap one to route via it.
    const fixes = L.layerGroup();
    const overlays: Record<string, L.Layer> = {};
    if (status?.airspace) {
      overlays.Airspace = L.tileLayer(AIRSPACE_TILE_URL, {
        minZoom: status.minZoom,
        maxNativeZoom: status.maxZoom,
        maxZoom: 19,
        attribution: OPENAIP_CREDIT,
        opacity: 1,
      }).addTo(map);
    }
    overlays['IFR fixes'] = fixes;
    if (fixesWanted()) fixes.addTo(map);
    // Lets the pilot hide the airspace to read the map underneath, or the fixes.
    L.control.layers(undefined, overlays, { collapsed: true, position: 'topright' }).addTo(map);
    const drawFixes = () => {
      fixes.clearLayers();
      if (!map.hasLayer(fixes) || map.getZoom() < AREA_ZOOM) return;
      const b = map.getBounds().pad(0.1);
      fixesIn(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()).forEach(f => {
        const p = asRoutePoint('', { ...f, compulsory: false });
        fixMarker(f).on('click', () => pickRef.current?.({ code: p.code, name: f.name, lat: f.lat, lon: f.lon }, fixHtml(f, p.code), 'vrp'))
          .addTo(fixes);
      });
    };
    map.on('moveend', drawFixes);
    const fixesSwitched = (e: L.LayersControlEvent) => {
      if (e.layer !== fixes) return;
      try { localStorage.setItem(SHOW_FIX_KEY, e.type === 'overlayadd' ? 'yes' : 'no'); } catch { /* private mode */ }
      drawFixes();
    };
    map.on('overlayadd', fixesSwitched);
    map.on('overlayremove', fixesSwitched);
    // Top left, under the zoom buttons: the credits take the bottom edge on a phone.
    L.control.scale({ imperial: true, metric: true, position: 'topleft' }).addTo(map);
    areaLayer.current = L.layerGroup().addTo(map);
    routeLayer.current = L.layerGroup().addTo(map);
    const far = () => container.current?.classList.toggle('route-map--far', map.getZoom() < VRP_LABEL_ZOOM);
    map.on('zoomend', far);
    far();
    // Close enough in, the airports in view and their reporting points; asked a moment after the map stops.
    let asked = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadArea = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const n = ++asked;
        const size = map.getSize();
        const p = map.getZoom() >= AREA_ZOOM && size.x > 0 && size.y > 0 ? areaOf(map.getBounds()) : null;
        if (!p) { setArea(NO_AREA); return; }
        p.then(a => { if (n === asked && a) setArea(a); });
      }, 250);
    };
    map.on('moveend', loadArea);
    // Clicking the map enables the mouse wheel, so scrolling past it doesn't zoom it; with the
    // airspace on, it also shows the airspace and frequencies at that spot.
    map.on('click', (e: L.LeafletMouseEvent) => {
      map.scrollWheelZoom.enable();
      if (plotClick.current) {
        plotClick.current(e.latlng);
        return;
      }
      if (!status?.airspace) return;
      // As tall as the map allows (it scrolls inside); the map buttons hide while it's open.
      const popup = L.popup({
        maxWidth: 260, maxHeight: Math.max(120, map.getSize().y - 70), className: 'point-info-popup', autoPanPadding: [8, 8],
      })
        .setLatLng(e.latlng).setContent('<div class="point-info">Loading airspace…</div>').openOn(map);
      fetchPointInfo(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true))
        .then(info => { if (map.hasLayer(popup)) popup.setContent(pointInfoHtml(info)); })
        .catch(() => { if (map.hasLayer(popup)) popup.setContent('<div class="point-info">Could not load the airspace here.</div>'); });
    });
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    map.on('popupopen', () => container.current?.classList.add('route-map--popup'));
    map.on('popupclose', () => container.current?.classList.remove('route-map--popup'));
    mapRef.current = map;
    return () => {
      clearTimeout(timer);
      asked = -1;
      map.remove();
      mapRef.current = null;
      routeLayer.current = null;
      areaLayer.current = null;
    };
  }, [status]);

  const editRef = React.useRef(onWaypointsChange);
  editRef.current = onWaypointsChange;
  const arrivalRef = React.useRef(onArrivalChange);
  arrivalRef.current = onArrivalChange;
  const editable = !!onWaypointsChange && airports.length >= 2;
  const canMoveArrival = !!onArrivalChange && airports.length >= 2;
  // A waypoint moved on the map is drawn where it was dropped until the new route has loaded.
  const key = keyOf(airports);
  const [pending, setPending] = React.useState<{ base: string; airports: MapAirport[] } | null>(null);
  React.useEffect(() => setPending(null), [key]);
  const shown = pending && pending.base === key ? pending.airports : airports;
  const shownKey = keyOf(shown);
  const vrpKey = reportingPoints.map(p => p.code).join('|');
  // The codes after the pilot's own edit: the map keeps its view for those instead of refitting.
  const edited = React.useRef<string | null>(null);
  /**
   * Plotting a new course from the departure, a click at a time; `before` is the waypoints to go
   * back to on cancel, `committed` whether the route has been changed yet.
   */
  const [plotting, setPlotting] = React.useState<{ before: MapAirport[] } | null>(null);
  const plotted = React.useRef<MapAirport[]>([]);
  const plotQueue = React.useRef<Promise<void>>(Promise.resolve());
  if (plotting && !editable) setPlotting(null);
  /** The route the view was last fitted to. */
  const fitted = React.useRef<{ map: L.Map; key: string } | null>(null);
  React.useEffect(() => {
    const map = mapRef.current;
    const group = routeLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    plotClick.current = null;
    if (shown.length === 0) return;
    const points = shown.map(a => L.latLng(a.lat, a.lon));
    const off: Array<() => void> = [];
    const lines = points.length > 1 ? [
      L.polyline(points, { color: '#ffffff', weight: 6, opacity: 0.8, interactive: false }).addTo(group),
      L.polyline(points, { color: ROUTE_COLOR, weight: 3, opacity: 1, interactive: false }).addTo(group),
    ] : [];
    const redraw = (pts: L.LatLng[]) => lines.forEach(l => l.setLatLngs(pts));
    const between = shown.slice(1, -1);
    const commit = (waypoints: MapAirport[]) => {
      const next = [shown[0], ...waypoints, shown[shown.length - 1]];
      edited.current = next.map(a => a.code).join('|');
      setPending({ base: key, airports: next });
      editRef.current?.(waypoints.map(a => a.code));
    };
    // Dropped right on an airport (on screen): that airport; otherwise the position.
    const dropped = async (at: L.LatLng): Promise<MapAirport> => {
      const lon = L.Util.wrapNum(at.lng, [-180, 180], true);
      const code = positionCode(at.lat, lon);
      const exact = parsePosition(code) ?? { lat: at.lat, lon };
      const px = map.latLngToContainerPoint(at);
      const vrp = [...reportingPoints, ...areaRef.current.points]
        .map(p => ({ p, d: map.latLngToContainerPoint([p.lat, p.lon]).distanceTo(px) }))
        .filter(x => x.d <= SNAP_PX)
        .sort((a, b) => a.d - b.d)[0]?.p;
      if (vrp) return { code: vrp.code, name: vrp.name, lat: vrp.lat, lon: vrp.lon };
      const shownAirport = nearestOnScreen(areaRef.current.airports, px, SNAP_PX);
      if (shownAirport) return { code: shownAirport.code, name: shownAirport.name, lat: shownAirport.lat, lon: shownAirport.lon };
      try {
        const near = (await nearestAirports(at.lat, lon))[0]?.airport;
        if (near && map.latLngToContainerPoint([near.lat, near.lon]).distanceTo(map.latLngToContainerPoint(at)) <= SNAP_PX) {
          return { code: near.code, name: near.name, lat: near.lat, lon: near.lon };
        }
      } catch {
        // No airport list: the position it is.
      }
      return { code, name: positionText(code) ?? code, ...exact };
    };
    const nearestOnScreen = <T extends At>(list: T[], px: L.Point, within: number): T | undefined => list
      .map(a => ({ a, d: map.latLngToContainerPoint([a.lat, a.lon]).distanceTo(px) }))
      .filter(x => x.d <= within)
      .sort((a, b) => a.d - b.d)[0]?.a;
    /** The airport the arrival was dropped on, or null when none is near. */
    const airportAt = async (at: L.LatLng): Promise<MapAirport | null> => {
      const px = map.latLngToContainerPoint(at);
      const shownAirport = nearestOnScreen(areaRef.current.airports, px, ARRIVAL_SNAP_PX);
      if (shownAirport) return { code: shownAirport.code, name: shownAirport.name, lat: shownAirport.lat, lon: shownAirport.lon };
      try {
        const near = (await nearestAirports(at.lat, L.Util.wrapNum(at.lng, [-180, 180], true)))[0];
        if (near && (near.distanceNm <= ARRIVAL_SNAP_NM
          || map.latLngToContainerPoint([near.airport.lat, near.airport.lon]).distanceTo(px) <= ARRIVAL_SNAP_PX)) {
          return { code: near.airport.code, name: near.airport.name, lat: near.airport.lat, lon: near.airport.lon };
        }
      } catch {
        // No airport list: nowhere to go.
      }
      return null;
    };
    const moveArrival = (to: MapAirport) => {
      const next = [...shown.slice(0, -1), to];
      edited.current = next.map(a => a.code).join('|');
      setPending({ base: key, airports: next });
      arrivalRef.current?.(to.code);
    };
    // Tapping an airport or reporting point: the next turning point while plotting, else what it is
    // and what can be done with it.
    const pick = (p: MapAirport, html: string, kind: 'airport' | 'vrp') => {
      if (plotting) { plot(p); return; }
      const box = document.createElement('div');
      box.innerHTML = html;
      const action = (text: string, act: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'route-map-remove';
        b.textContent = text;
        b.addEventListener('click', () => { map.closePopup(); act(); });
        box.appendChild(document.createElement('br'));
        box.appendChild(b);
      };
      if (editable && between.length < maxWaypoints) {
        action(kind === 'vrp' ? 'Route via this point' : 'Route via this airport', () => {
          const i = bestInsert(shown, p);
          commit([...between.slice(0, i), p, ...between.slice(i)]);
        });
      }
      if (kind === 'airport' && canMoveArrival) action('Fly here instead', () => moveArrival(p));
      L.popup({ offset: [0, -4] }).setLatLng([p.lat, p.lon]).setContent(box).openOn(map);
    };
    pickRef.current = pick;

    // Reporting points first, so the route draws over them.
    const onRoute = new Set(shown.map(a => a.code));
    reportingPoints.forEach(p => {
      if (onRoute.has(p.code)) return;
      vrpMarker(p).on('click', () => pick({ code: p.code, name: p.name, lat: p.lat, lon: p.lon }, vrpHtml(p), 'vrp')).addTo(group);
    });

    const labels = routeLabels(shown.map(a => a.code));
    // A position: "WP1" with where it is; an airport: its code and name.
    const info = (a: MapAirport, i: number) => {
      const where = positionText(a.code);
      return where
        ? `<strong>${labels[i]}</strong><br>${where}<br><span class="route-map-code">${escapeHtml(a.code)}</span>`
        : a.name ? `<strong>${escapeHtml(a.code)}</strong><br>${escapeHtml(a.name)}` : `<strong>${escapeHtml(a.code)}</strong>`;
    };
    // Each leg, wide and unseen: hovering it says how long it is.
    for (let i = 0; i < shown.length - 1; i++) {
      L.polyline([points[i], points[i + 1]], { color: '#000000', weight: 18, opacity: 0, className: 'route-map-leg' })
        .bindTooltip(legText(labels[i], labels[i + 1], shown[i], shown[i + 1]), { sticky: true, direction: 'top', offset: [0, -8] })
        .addTo(group);
    }

    // Plotting: each click is the next turning point (snapped to an airport or reporting point
    // nearby); a dashed line follows the pointer from the last one.
    const plot = (at: L.LatLng | MapAirport) => {
      plotQueue.current = plotQueue.current.then(async () => {
        const p = at instanceof L.LatLng ? await dropped(at) : at;
        plotted.current = [...plotted.current, p];
        commit(plotted.current);
        if (plotted.current.length >= maxWaypoints) setPlotting(null);
      });
    };
    if (plotting) {
      plotClick.current = plot;
      const last = plotted.current[plotted.current.length - 1] ?? shown[0];
      const band = L.polyline([], { color: ROUTE_COLOR, weight: 2, dashArray: '6 6', interactive: false }).addTo(group);
      const from = plotted.current.length ? labels[shown.length - 2] : labels[0];
      const move = (e: L.LeafletMouseEvent) => {
        band.setLatLngs([[last.lat, last.lon], e.latlng]);
        const text = legText(from, 'here', last, { lat: e.latlng.lat, lon: e.latlng.lng });
        // Bound once the line has points (Leaflet can't place a label on an empty one).
        if (band.getTooltip()) band.setTooltipContent(text);
        else band.bindTooltip(text, { permanent: true, direction: 'right', offset: [12, 0], className: 'route-map-label' });
        band.openTooltip(e.latlng);
      };
      map.on('mousemove', move);
      off.push(() => map.off('mousemove', move));
    }

    shown.forEach((a, i) => {
      const end = i === 0 || i === shown.length - 1;
      const label = <T extends L.Layer>(m: T): T => {
        m.bindTooltip(labels[i], { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label' });
        return m;
      };
      if (i === shown.length - 1 && i > 0 && canMoveArrival && !plotting) {
        // The arrival: drag it onto another airport to fly there instead.
        const m = label(L.marker([a.lat, a.lon], {
          icon: L.divIcon({ className: 'route-map-end route-map-arrival', iconSize: [14, 14] }),
          draggable: true, autoPan: true, keyboard: false, title: 'Drag onto another airport to fly there instead',
        }));
        m.bindPopup(info(a, i));
        m.on('drag', () => redraw(points.map((p, j) => (j === i ? m.getLatLng() : p))));
        m.on('dragend', () => {
          airportAt(m.getLatLng()).then(to => {
            if (to && to.code !== a.code) { moveArrival(to); return; }
            // Not on an airport: back where it was.
            m.setLatLng(points[i]);
            redraw(points);
          });
        });
        m.addTo(group);
        return;
      }
      if (end || !editable || plotting) {
        const m = label(L.circleMarker([a.lat, a.lon], {
          radius: end ? 7 : 5, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1,
          // A tap on an airport shows its name, not the airspace lookup.
          bubblingMouseEvents: false,
          className: editable && end ? 'route-map-end' : '',
        }));
        if (plotting) {
          // The arrival (or the departure again) ends it; a waypoint already plotted does nothing.
          if (end) m.on('click', () => stopRef.current(false));
        } else if (editable && i === 0) {
          m.on('click', () => {
            map.closePopup();
            plotted.current = [];
            setPending({ base: key, airports: [shown[0], shown[shown.length - 1]] });
            setPlotting({ before: between });
          });
        } else {
          m.bindPopup(info(a, i));
        }
        m.addTo(group);
        return;
      }
      // A waypoint: drag it somewhere else, or remove it from its popup.
      const w = i - 1;
      const marker = L.marker([a.lat, a.lon], {
        icon: L.divIcon({ className: 'route-map-waypoint', iconSize: [14, 14] }), draggable: true, autoPan: true, keyboard: false,
      });
      label(marker);
      const popup = document.createElement('div');
      popup.innerHTML = info(a, i);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'route-map-remove';
      remove.textContent = 'Remove waypoint';
      remove.addEventListener('click', () => {
        map.closePopup();
        commit(between.filter((_, j) => j !== w));
      });
      popup.appendChild(remove);
      marker.bindPopup(popup);
      marker.on('drag', () => redraw(points.map((p, j) => (j === i ? marker.getLatLng() : p))));
      marker.on('dragend', () => {
        dropped(marker.getLatLng()).then(p => commit(between.map((b, j) => (j === w ? p : b))));
      });
      marker.addTo(group);
    });
    // A handle in the middle of each leg: drag it out to add a waypoint there.
    if (editable && !plotting && between.length < maxWaypoints) {
      for (let i = 0; i < points.length - 1; i++) {
        const mid = L.latLng((points[i].lat + points[i + 1].lat) / 2, (points[i].lng + points[i + 1].lng) / 2);
        const handle = L.marker(mid, {
          icon: L.divIcon({ className: 'route-map-insert', iconSize: [12, 12] }), draggable: true, autoPan: true, keyboard: false,
          title: 'Drag to add a waypoint',
        });
        handle.on('drag', () => redraw([...points.slice(0, i + 1), handle.getLatLng(), ...points.slice(i + 1)]));
        handle.on('dragend', () => {
          dropped(handle.getLatLng()).then(p => commit([...between.slice(0, i), p, ...between.slice(i)]));
        });
        handle.addTo(group);
      }
    }

    const fit = () => {
      // Only the reporting points came in, or plotting started or stopped: keep the view.
      if (fitted.current?.map === map && fitted.current.key === shownKey) return;
      fitted.current = { map, key: shownKey };
      if (plotting) return;
      if (edited.current === shown.map(a => a.code).join('|')) return; // the pilot's own change: keep the view
      edited.current = null;
      const bounds = L.latLngBounds(points);
      const size = map.getSize();
      const tiny = bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 5000;
      if (size.x === 0 || size.y === 0 || tiny) {
        // A local flight, or a map that isn't laid out yet (fitBounds needs a size).
        map.setView(bounds.getCenter(), tiny ? 10 : 8);
      } else {
        // Room for the zoom buttons and scale (top left), the layers button (top right), the
        // labels right of each airport, and the credits along the bottom.
        map.fitBounds(bounds, { paddingTopLeft: [60, 64], paddingBottomRight: [72, 36], maxZoom: 11 });
      }
    };
    fit();
    return () => off.forEach(f => f());
  }, [shownKey, vrpKey, status, editable, canMoveArrival, maxWaypoints, plotting]);

  // The airports in view and their reporting points, except those the route already shows.
  React.useEffect(() => {
    const group = areaLayer.current;
    if (!group) return;
    group.clearLayers();
    const onRoute = new Set(shown.map(a => a.code));
    const routeVrps = new Set(reportingPoints.map(p => p.code));
    area.airports.forEach(a => {
      if (onRoute.has(a.code)) return;
      const big = a.type === 'large' || a.type === 'medium';
      const m = L.circleMarker([a.lat, a.lon], {
        radius: big ? 6 : 4.5, color: '#ffffff', weight: 1.5, fillColor: AIRPORT_COLOR, fillOpacity: 1,
        bubblingMouseEvents: false, className: 'area-airport',
      });
      m.bindTooltip(a.code, { permanent: true, direction: 'right', offset: [6, 0], className: 'route-map-label area-airport-label' });
      m.on('click', () => pickRef.current?.({ code: a.code, name: a.name, lat: a.lat, lon: a.lon },
        `<strong>${escapeHtml(a.code)}</strong><br>${escapeHtml(a.name)}`, 'airport'));
      m.addTo(group);
    });
    area.points.forEach(p => {
      if (onRoute.has(p.code) || routeVrps.has(p.code)) return;
      vrpMarker(p).on('click', () => pickRef.current?.({ code: p.code, name: p.name, lat: p.lat, lon: p.lon }, vrpHtml(p), 'vrp'))
        .addTo(group);
    });
  }, [area, shownKey, vrpKey, status]);

  const stopPlotting = (cancel: boolean) => {
    if (!plotting) return;
    if (cancel) {
      const before = plotting.before;
      plotQueue.current = plotQueue.current.then(() => {
        if (plotted.current.length === 0) { setPending(null); return; }
        const ends = [shown[0], shown[shown.length - 1]];
        edited.current = [ends[0], ...before, ends[1]].map(a => a.code).join('|');
        setPending({ base: key, airports: [ends[0], ...before, ends[1]] });
        editRef.current?.(before.map(a => a.code));
      });
    } else {
      // Done before a single point: the route as it was.
      plotQueue.current = plotQueue.current.then(() => { if (plotted.current.length === 0) setPending(null); });
    }
    setPlotting(null);
  };
  const undo = () => {
    plotQueue.current = plotQueue.current.then(() => {
      if (plotted.current.length === 0) return;
      plotted.current = plotted.current.slice(0, -1);
      const ends = [shown[0], shown[shown.length - 1]];
      const next = [ends[0], ...plotted.current, ends[1]];
      edited.current = next.map(a => a.code).join('|');
      setPending({ base: key, airports: next });
      editRef.current?.(plotted.current.map(a => a.code));
    });
  };
  const stopRef = React.useRef(stopPlotting);
  stopRef.current = stopPlotting;
  // Escape cancels the plotting.
  React.useEffect(() => {
    if (!plotting) return;
    container.current?.classList.add('route-map--plotting');
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') stopRef.current(true); };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      container.current?.classList.remove('route-map--plotting');
    };
  }, [plotting]);
  const labels = routeLabels(shown.map(a => a.code));

  return (
    <div className="space-y-1">
      <div className="relative">
        <div ref={container} role="region" aria-label="Route map"
          className="route-map relative z-0 h-72 w-full overflow-hidden rounded-md border border-border sm:h-96"/>
        {plotting && (
          <div role="status" className="absolute inset-x-2 bottom-6 z-[1000] mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
            <span className="flex-1">
              Plotting from {labels[0]}: {L.Browser.mobile ? 'tap' : 'click'} the map for each turning point (airports and reporting
              points snap). {L.Browser.mobile ? 'Tap' : 'Click'} {labels[labels.length - 1]} or Done to finish.
            </span>
            <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={undo}>Undo</button>
            <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={() => stopPlotting(true)}>Cancel</button>
            <button type="button" className="rounded bg-primary px-2 py-1 text-primary-foreground" onClick={() => stopPlotting(false)}>Done</button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {status?.airspace
          ? 'Tap the map for the airspace and frequencies there. Airspace from openAIP, maintained by volunteers: check the AIP, the official charts and NOTAMs.'
          : status === undefined ? '' : 'Airspace is not available right now; the map shows the route only.'}
        {!L.Browser.mobile && shown.length > 1 && ' Hover a leg for its length and course.'}
        {editable && ` ${L.Browser.mobile ? 'Tap' : 'Click'} ${labels[0]} to plot a new course from it, point by point.`}
        {canMoveArrival && ` Drag ${labels[labels.length - 1]} onto another airport to fly there instead.`}
        {area.airports.length > 0 && ' Airports in view are green dots: tap one, or a reporting point, to route via it.'}
        {editable && ' Drag a waypoint to move it, or a white dot in the middle of a leg to add one; drop it on an airport or reporting point (blue triangle) to use it, or tap a reporting point to route via it.'}
        {L.Browser.mobile && ' Use two fingers to move the map.'}
      </p>
    </div>
  );
};

/** An IFR/GNSS fix: a small grey diamond with its name beside it. */
function fixMarker(f: SignificantPoint): L.Marker {
  const m = L.marker([f.lat, f.lon], {
    icon: L.divIcon({ className: 'fix-marker', iconSize: [9, 9] }), keyboard: false, bubblingMouseEvents: false, title: f.name,
  });
  m.bindTooltip(f.name, { permanent: true, direction: 'right', offset: [4, 0], className: 'route-map-label fix-label' });
  return m;
}

const fixHtml = (f: SignificantPoint, code: string) =>
  `<strong>${escapeHtml(f.name)}</strong><br>IFR/GNSS fix (AIP ENR 4.4)${f.routes ? `: ${escapeHtml(f.routes)}` : ''}`
  + `<br>${positionText(code) ?? ''}`;

/** A reporting point: a blue triangle (filled when compulsory) with its name beside it. */
function vrpMarker(p: RouteReportingPoint): L.Marker {
  const m = L.marker([p.lat, p.lon], {
    icon: L.divIcon({ className: p.compulsory ? 'vrp-marker vrp-marker--compulsory' : 'vrp-marker', iconSize: [12, 11] }),
    keyboard: false, bubblingMouseEvents: false, title: `${p.name} (${p.airport})`,
  });
  m.bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -4], className: 'route-map-label vrp-label' });
  return m;
}

const vrpHtml = (p: RouteReportingPoint) =>
  `<strong>${escapeHtml(p.name)}</strong><br>${p.compulsory ? 'Compulsory' : 'Visual'} reporting point, ${escapeHtml(p.airport)}`
  + `<br>${positionText(p.code) ?? ''}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
}

export default RouteMap;
