import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AIRSPACE_TILE_URL, fetchMapStatus, type MapStatus } from '../../api/backend';
import { routeLabels } from '../../lib/routePoint';
import type { AerodromeInfo } from '../../types/route';

export interface BriefingMapPoint {
  code: string;
  lat: number;
  lon: number;
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ROUTE_COLOR = '#d946ef';
/** The departure and arrival maps: about 15 NM across at Scandinavian latitudes. */
const AREA_ZOOM = 10;
/** Printed anyway if the tiles take longer than this. */
const TILE_TIMEOUT_MS = 12_000;

let statusPromise: Promise<MapStatus | null> | null = null;
const mapStatus = () => (statusPromise ??= fetchMapStatus().catch(() => null));

type View = { kind: 'fit' } | { kind: 'centre'; at: BriefingMapPoint; zoom: number; around?: Array<{ lat: number; lon: number }> };
type Vrp = AerodromeInfo['reportingPoints'][number];

/**
 * One printed map: the route on OpenStreetMap with openAIP's airspace, fixed and without controls.
 * Marks itself data-map-ready once its tiles are in, so printing can wait for it.
 */
const PrintMap: React.FC<{ points: BriefingMapPoint[]; view: View; height: number; title: string; vrps?: Vrp[] }> = ({
  points, view, height, title, vrps = [],
}) => {
  const el = React.useRef<HTMLDivElement>(null);
  const [ready, setReady] = React.useState(false);
  const [scale, setScale] = React.useState<{ px: number; nm: number } | null>(null);

  React.useEffect(() => {
    let live = true;
    let map: L.Map | null = null;
    const timeout = window.setTimeout(() => { if (live) setReady(true); }, TILE_TIMEOUT_MS);
    mapStatus().then(status => {
      if (!live || !el.current) return;
      map = L.map(el.current, {
        zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, touchZoom: false, zoomAnimation: false, fadeAnimation: false, inertia: false, zoomSnap: 0.25,
      });
      const latLngs = points.map(p => L.latLng(p.lat, p.lon));
      if (view.kind === 'fit') map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 11 });
      else if (view.around?.length) {
        // The aerodrome and its reporting points, at least as close as the usual zoom.
        const b = L.latLngBounds([L.latLng(view.at.lat, view.at.lon), ...view.around.map(p => L.latLng(p.lat, p.lon))]);
        map.fitBounds(b, { padding: [28, 28], maxZoom: view.zoom });
      } else map.setView([view.at.lat, view.at.lon], view.zoom);

      const layers = [L.tileLayer(OSM_URL, { maxZoom: 19 })];
      if (status?.airspace) {
        layers.push(L.tileLayer(AIRSPACE_TILE_URL, { minZoom: status.minZoom, maxNativeZoom: status.maxZoom, maxZoom: 19 }));
      }
      let loading = layers.length;
      layers.forEach(l => {
        l.once('load', () => { loading -= 1; if (loading === 0 && live) setReady(true); });
        l.addTo(map as L.Map);
      });

      L.polyline(latLngs, { color: '#ffffff', weight: 6, opacity: 0.9 }).addTo(map);
      L.polyline(latLngs, { color: ROUTE_COLOR, weight: 3 }).addTo(map);
      const labels = routeLabels(points.map(p => p.code));
      points.forEach((p, i) => {
        L.circleMarker([p.lat, p.lon], { radius: i === 0 || i === points.length - 1 ? 6 : 4, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1 })
          .bindTooltip(labels[i], { permanent: true, direction: 'right', offset: [7, 0], className: 'route-map-label' })
          .addTo(map as L.Map);
      });

      // Visual reporting points: a triangle, filled when compulsory.
      vrps.forEach(p => {
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({ className: p.compulsory ? 'vrp-marker vrp-marker--compulsory' : 'vrp-marker', iconSize: [12, 11] }),
          keyboard: false, interactive: false,
        })
          .bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -4], className: 'route-map-label vrp-label' })
          .addTo(map as L.Map);
      });

      // A scale bar in nautical miles: a round number of NM about 100 px long.
      const size = map.getSize();
      if (size.x > 0) {
        const y = size.y / 2;
        const nmPer100 = map.distance(map.containerPointToLatLng([0, y]), map.containerPointToLatLng([100, y])) / 1852;
        const nm = [1, 2, 5, 10, 20, 25, 50, 100].reduce((best, n) => (Math.abs(n - nmPer100) < Math.abs(best - nmPer100) ? n : best));
        setScale({ px: (nm / nmPer100) * 100, nm });
      }
    });
    return () => {
      live = false;
      window.clearTimeout(timeout);
      map?.remove();
    };
    // Drawn once: the pack is printed and then taken away.
  }, []);

  return (
    <figure className="break-inside-avoid">
      <figcaption className="mb-0.5 font-semibold">{title}</figcaption>
      <div className="relative">
        <div ref={el} data-map-ready={ready ? 'true' : 'false'} role="img" aria-label={`Map: ${title}`}
          className="route-map w-full border border-black" style={{ height }}/>
        {scale && (
          <div className="absolute bottom-1 left-1 z-[1000] bg-white/90 px-1 text-[7.5pt]">
            <div className="border-x-2 border-b-2 border-black" style={{ width: scale.px, height: 5 }}/>
            {scale.nm} NM
          </div>
        )}
      </div>
    </figure>
  );
};

const CREDIT = (
  <p className="text-[7.5pt]">
    Map © OpenStreetMap contributors; airspace and reporting points © openAIP (CC BY-NC), maintained by volunteers. Not for
    navigation: use the official charts.
  </p>
);

/** The whole route on one page. */
export const RouteChart: React.FC<{ points: BriefingMapPoint[] }> = ({ points }) => (
  <div className="space-y-1">
    <PrintMap points={points} view={{ kind: 'fit' }} height={880} title="Route"/>
    {CREDIT}
  </div>
);

/** The departure and arrival side by side, each with its reporting points. */
export const AirfieldMaps: React.FC<{ points: BriefingMapPoint[]; local: boolean; vrps: Record<string, Vrp[]> }> = ({ points, local, vrps }) => {
  const dep = points[0], arr = points[points.length - 1];
  const map = (at: BriefingMapPoint, label: string) => (
    <PrintMap points={points} vrps={vrps[at.code] ?? []} height={270} title={`${label}: ${at.code}`}
      view={{ kind: 'centre', at, zoom: AREA_ZOOM, around: vrps[at.code] }}/>
  );
  return (
    <div className="space-y-1">
      <div className={local ? '' : 'grid grid-cols-2 gap-2'}>
        {map(dep, local ? 'Aerodrome' : 'Departure')}
        {!local && map(arr, 'Arrival')}
      </div>
      {CREDIT}
    </div>
  );
};
