import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AIRSPACE_TILE_URL, fetchMapStatus, fetchPointInfo, type MapStatus, nearestAirports } from '../../api/backend';
import { parsePosition, positionCode, positionText, routeLabels } from '../../lib/routePoint';
import { pointInfoHtml } from '../../lib/frequencies';

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
}

/** Dropped this close to an airport on screen, a waypoint becomes that airport. */
const SNAP_PX = 14;
const keyOf = (airports: MapAirport[]) => airports.map(a => `${a.code}@${a.lat.toFixed(4)},${a.lon.toFixed(4)}`).join('|');

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Short, so the credits fit on one line on a phone.
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const OPENAIP_CREDIT = 'airspace &copy; <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a> '
  + '<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC</a>';
const ROUTE_COLOR = '#d946ef';

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
const RouteMap: React.FC<RouteMapProps> = ({ airports, onWaypointsChange, maxWaypoints = 18 }) => {
  const container = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const routeLayer = React.useRef<L.LayerGroup | null>(null);
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
    if (status?.airspace) {
      const airspace = L.tileLayer(AIRSPACE_TILE_URL, {
        minZoom: status.minZoom,
        maxNativeZoom: status.maxZoom,
        maxZoom: 19,
        attribution: OPENAIP_CREDIT,
        opacity: 1,
      }).addTo(map);
      // Lets the pilot hide the airspace to read the map underneath.
      L.control.layers(undefined, { Airspace: airspace }, { collapsed: true, position: 'topright' }).addTo(map);
    }
    // Top left, under the zoom buttons: the credits take the bottom edge on a phone.
    L.control.scale({ imperial: true, metric: true, position: 'topleft' }).addTo(map);
    routeLayer.current = L.layerGroup().addTo(map);
    // Clicking the map enables the mouse wheel, so scrolling past it doesn't zoom it; with the
    // airspace on, it also shows the airspace and frequencies at that spot.
    map.on('click', (e: L.LeafletMouseEvent) => {
      map.scrollWheelZoom.enable();
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
      map.remove();
      mapRef.current = null;
      routeLayer.current = null;
    };
  }, [status]);

  const editRef = React.useRef(onWaypointsChange);
  editRef.current = onWaypointsChange;
  const editable = !!onWaypointsChange && airports.length >= 2;
  // A waypoint moved on the map is drawn where it was dropped until the new route has loaded.
  const key = keyOf(airports);
  const [pending, setPending] = React.useState<{ base: string; airports: MapAirport[] } | null>(null);
  React.useEffect(() => setPending(null), [key]);
  const shown = pending && pending.base === key ? pending.airports : airports;
  const shownKey = keyOf(shown);
  // The codes after the pilot's own edit: the map keeps its view for those instead of refitting.
  const edited = React.useRef<string | null>(null);
  React.useEffect(() => {
    const map = mapRef.current;
    const group = routeLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    if (shown.length === 0) return;
    const points = shown.map(a => L.latLng(a.lat, a.lon));
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

    const labels = routeLabels(shown.map(a => a.code));
    // A position: "WP1" with where it is; an airport: its code and name.
    const info = (a: MapAirport, i: number) => {
      const where = positionText(a.code);
      return where
        ? `<strong>${labels[i]}</strong><br>${where}<br><span class="route-map-code">${escapeHtml(a.code)}</span>`
        : a.name ? `<strong>${escapeHtml(a.code)}</strong><br>${escapeHtml(a.name)}` : `<strong>${escapeHtml(a.code)}</strong>`;
    };
    shown.forEach((a, i) => {
      const end = i === 0 || i === shown.length - 1;
      const label = <T extends L.Layer>(m: T): T => {
        m.bindTooltip(labels[i], { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label' });
        return m;
      };
      if (end || !editable) {
        label(L.circleMarker([a.lat, a.lon], {
          radius: end ? 7 : 5, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1,
          // A tap on an airport shows its name, not the airspace lookup.
          bubblingMouseEvents: false,
        }))
          .bindPopup(info(a, i))
          .addTo(group);
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
    if (editable && between.length < maxWaypoints) {
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
  }, [shownKey, status, editable, maxWaypoints]);

  return (
    <div className="space-y-1">
      <div ref={container} role="region" aria-label="Route map"
        className="route-map relative z-0 h-72 w-full overflow-hidden rounded-md border border-border sm:h-96"/>
      <p className="text-[11px] text-muted-foreground">
        {status?.airspace
          ? 'Tap the map for the airspace and frequencies there. Airspace from openAIP, maintained by volunteers. Not for navigation: check the AIP, the official charts and NOTAMs.'
          : status === undefined ? '' : 'Airspace is not available right now; the map shows the route only.'}
        {editable && ' Drag a waypoint to move it, or a white dot in the middle of a leg to add one; drop it on an airport to use that airport.'}
        {L.Browser.mobile && ' Use two fingers to move the map.'}
      </p>
    </div>
  );
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
}

export default RouteMap;
