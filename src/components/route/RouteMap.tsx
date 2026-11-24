import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AIRSPACE_TILE_URL, fetchMapStatus, type MapStatus } from '../../api/backend';

export interface MapAirport {
  code: string;
  name?: string;
  lat: number;
  lon: number;
}

interface RouteMapProps {
  /** Departure, any waypoints and arrival, in order. */
  airports: MapAirport[];
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const OPENAIP_CREDIT = 'Airspace &copy; <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a> '
  + '(<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a>)';
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
const RouteMap: React.FC<RouteMapProps> = ({ airports }) => {
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
    });
    // Leaflet needs a view before anything is drawn; the route effect fits it to the route.
    map.setView([60, 15], 5);
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_CREDIT, className: 'basemap-tiles' }).addTo(map);
    if (status?.airspace) {
      const airspace = L.tileLayer(AIRSPACE_TILE_URL, {
        minZoom: status.minZoom,
        maxNativeZoom: status.maxZoom,
        maxZoom: 19,
        attribution: OPENAIP_CREDIT,
        opacity: 0.9,
      }).addTo(map);
      // Lets the pilot hide the airspace to read the map underneath.
      L.control.layers(undefined, { Airspace: airspace }, { collapsed: true, position: 'topright' }).addTo(map);
    }
    L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);
    routeLayer.current = L.layerGroup().addTo(map);
    // Clicking the map enables the mouse wheel, so scrolling past it doesn't zoom it.
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      routeLayer.current = null;
    };
  }, [status]);

  const key = airports.map(a => `${a.code}@${a.lat.toFixed(4)},${a.lon.toFixed(4)}`).join('|');
  React.useEffect(() => {
    const map = mapRef.current;
    const group = routeLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    if (airports.length === 0) return;
    const points = airports.map(a => L.latLng(a.lat, a.lon));
    if (points.length > 1) {
      L.polyline(points, { color: '#ffffff', weight: 6, opacity: 0.8, interactive: false }).addTo(group);
      L.polyline(points, { color: ROUTE_COLOR, weight: 3, opacity: 1, interactive: false }).addTo(group);
    }
    airports.forEach((a, i) => {
      const end = i === 0 || i === airports.length - 1;
      L.circleMarker([a.lat, a.lon], {
        radius: end ? 7 : 5, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1,
      })
        .bindTooltip(a.code, { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label' })
        .bindPopup(a.name ? `<strong>${escapeHtml(a.code)}</strong><br>${escapeHtml(a.name)}` : escapeHtml(a.code))
        .addTo(group);
    });
    const bounds = L.latLngBounds(points);
    const size = map.getSize();
    const tiny = bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 5000;
    if (size.x === 0 || size.y === 0 || tiny) {
      // A local flight, or a map that isn't laid out yet (fitBounds needs a size).
      map.setView(bounds.getCenter(), tiny ? 10 : 8);
    } else {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
    }
  }, [key, status]);

  return (
    <div className="space-y-1">
      <div ref={container} role="region" aria-label="Route map"
        className="route-map relative z-0 h-72 w-full overflow-hidden rounded-md border border-border sm:h-96"/>
      <p className="text-[11px] text-muted-foreground">
        {status?.airspace
          ? 'Airspace from openAIP, maintained by volunteers. Not for navigation: check the AIP, the official charts and NOTAMs.'
          : status === undefined ? '' : 'Airspace is not available right now; the map shows the route only.'}
        {L.Browser.mobile && ' Use two fingers to move the map.'}
      </p>
    </div>
  );
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
}

export default RouteMap;
