import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Radio, TriangleAlert, X } from 'lucide-react';
import {
  acceptNavTerms, AIRSPACE_TILE_URL, airspacesFetchedAt as fetchedAtOf, BASEMAP_TILE_URL, downloadTrackKml, fetchAirportsAlong, fetchAirspacesAlong, fetchMapArea,
  fetchMapStatus, type MapStatus, saveTrack, type TrackPoint,
} from '../../api/backend';
import { clearTrack, loadTrack, storeTrack, thinned, trackName, trackStats } from '../../lib/flightTrack';
import { clearNavSession, type NavSession, saveNavSession, updateNavSession } from '../../lib/navSession';
import { AIRAC_DAYS, acceptedHere, dataAgeDays, markAcceptedHere, NAV_TERMS, NAV_TERMS_VERSION } from '../../lib/navTerms';
import { useAuth } from '../../api/useAuth';
import { fixesAiracText, fixesNear, fixesOutOfDate } from '../../lib/swedenFixes';
import { navaidPopup, navaidsAiracText, navaidsNear, navaidsOutOfDate, navaidSvg, navaidText } from '../../lib/swedenNavaids';
import { labelsByZoom } from '../../lib/mapLabels';
import { canKeepOffline, keepOffline, type OfflineProgress, tilesAlong, tileUrl } from '../../lib/offlineMap';
import type { AirportInfo, AirspaceView, RouteWeather } from '../../types/route';
import type { RouteReportingPoint } from '../../lib/useRouteWeather';
import { type SwedenControlLeg, swedenControlAt, swedenControlText } from '../../lib/swedenControl';
import { atisAndGround, contactFrequencies, frequencyText } from '../../lib/frequencies';
import { adviceFor, crossingsAlong } from '../../lib/airspace';
import { routeLabels } from '../../lib/routePoint';
import type { RoutePosition } from '../../lib/openMeteo';
import { GENERIC_EMERGENCY_CHECKLIST, MAYDAY_CALL } from '../../lib/emergencyChecklist';
import { fullScreen, isNative, keepScreenOn, watchPosition } from '../../lib/native';
import { cachedTileLayer } from '../../lib/tileCache';
import { departureClimb, departureClimbLabel, DEPARTURE_TURN_FT } from '../../lib/departure';
import { loadObstacles, OBSTACLE_MARGIN_FT, obstacleAhead, obstacleKind, obstaclePopup, obstaclesAlong, obstacleSvg, obstacleText } from '../../lib/obstacles';
import {
  activeLeg, airspacesHere, ARRIVAL_MARGIN_FT, bearingDistance, DEFAULT_GLIDE_RATIO, eteText, type Fix, fixFrom,
  areaAround, demoAltitudeFt, glideRangeNm, isControlled, nearestAirfields, NEXT_AIRSPACE_NM, nextAirspace, pad3, pointAhead, positionAlong,
  roundedRoute, routeLengthNm, turnRadiusNm,
} from '../../lib/navigation';
import { distanceNm } from '../../lib/openMeteo';

export interface NavigationModeProps {
  /** The planned flight; null flies without a route (GPS only): everything around the aircraft instead. */
  trip: RouteWeather | null;
  airspaces: AirspaceView[] | null;
  /** When the airspace was downloaded, for showing its age. */
  airspacesFetchedAt?: number | null;
  reportingPoints: RouteReportingPoint[];
  swedenControl: SwedenControlLeg[];
  /** The aircraft's best glide speed, if known. */
  bestGlideKt: number | null;
  /** For the demo flight. */
  cruiseKt: number;
  cruiseAltFt: number;
  /** The aircraft's climb (ft/min) at Vy (kt), for the climb-out on the runway heading. */
  climb?: { fpm: number; kt: number } | null;
  /** Signed in: a flight flown with GPS can be saved to the account when it ends. */
  signedIn?: boolean;
  /** A GPS flight in progress before the page reloaded: offered to carry on, with what it had loaded. */
  resumed?: Pick<NavSession, 'airfields' | 'nearVrps'>;
  onClose: () => void;
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const OPENAIP_CREDIT = 'airspace &copy; <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a>';
const ROUTE_COLOR = '#d946ef';
/** The demo flight runs this many times faster than real time. */
const DEMO_SPEEDUP = 4;
const RATIO_KEY = 'nav.glideRatio';
/** Base map tiles kept for offline from this zoom; airspace tiles up to AIRSPACE_MAX_ZOOM (shown enlarged beyond). */
const OFFLINE_MIN_ZOOM = 6;
const AIRSPACE_MAX_ZOOM = 10;
/** Visual reporting points this far either side of the route are drawn, whichever airport they belong to. */
const VRP_CORRIDOR_NM = 15;
const SHOW_VRP_KEY = 'nav.showVrp';
const SHOW_FIX_KEY = 'nav.showIfrFixes';
const SHOW_NAVAID_KEY = 'nav.showNavaids';
/** Radio navaids this far from the route are drawn: a VOR is used well off it. */
const NAVAID_RANGE_NM = 40;
const SHOW_OBSTACLE_KEY = 'nav.showObstacles';
/** Without a route: what's loaded around the aircraft, NM either way, ... */
const AREA_NM = 25;
/** ... and loaded again once it's this far from where it was. */
const AREA_RELOAD_NM = 15;
/** The obstacles drawn: this far either side of the route. */
const OBSTACLE_RANGE_NM = 10;
type Vrp = { name: string; lat: number; lon: number; compulsory: boolean };

/** Every visual reporting point near the route: the map area around it, asked in parts the server allows (5° × 10°). */
async function reportingPointsNear(route: Array<{ lat: number; lon: number }>): Promise<Vrp[]> {
  const pad = VRP_CORRIDOR_NM / 60;
  const lats = route.map(a => a.lat), lons = route.map(a => a.lon);
  const south = Math.min(...lats) - pad, north = Math.max(...lats) + pad;
  const lonPad = pad / Math.max(0.2, Math.cos((Math.max(Math.abs(south), Math.abs(north)) * Math.PI) / 180));
  const west = Math.min(...lons) - lonPad, east = Math.max(...lons) + lonPad;
  const parts: Array<Promise<Vrp[]>> = [];
  for (let s = south; s < north; s += 5) {
    for (let w = west; w < east; w += 10) {
      parts.push(fetchMapArea(s, w, Math.min(north, s + 5), Math.min(east, w + 10))
        .then(a => a?.reportingPoints ?? [], () => []));
    }
  }
  return (await Promise.all(parts)).flat().filter(p => (route.length < 2
    ? Math.hypot(p.lat - route[0].lat, (p.lon - route[0].lon) / 2) * 60 <= VRP_CORRIDOR_NM
    : (activeLeg(route, p)?.offNm ?? Infinity) <= VRP_CORRIDOR_NM));
}
const PROTOMAPS_CREDIT = '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> '
  + '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Whether the self-hosted base map covers the whole route. */
const basemapCovers = (status: MapStatus | null | undefined, route: Array<{ lat: number; lon: number }>) => {
  const b = status?.basemap?.bounds;
  return !!b && route.every(p => p.lon >= b[0] && p.lat >= b[1] && p.lon <= b[2] && p.lat <= b[3]);
};
/** A light aircraft from above, nose up: turned to the track on the map. */
const AIRPLANE_SVG = '<svg viewBox="0 0 32 32" width="32" height="32"><path d="M16 2c1.2 0 1.6 1.2 1.6 2.5V10l11.4.5v3l-11.4.5-.2 9.5 4.6.7v2.4l-5 .4-1 2-1-2-5-.4v-2.4l4.6-.7-.2-9.5L3 13.5v-3l11.4-.5V4.5C14.4 3.2 14.8 2 16 2z" fill="#0f172a" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
/** A new trail point once the aircraft has moved this far. */
const TRAIL_STEP_M = 30;

const ft = (n: number) => Math.round(n).toLocaleString('en');
const nmText = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

/** Keeps the screen on while the mode is open (where the browser can). */
function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    if (isNative()) {
      keepScreenOn(true);
      return () => { keepScreenOn(false); };
    }
    if (!('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let live = true;
    const ask = () => {
      (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
        .wakeLock.request('screen').then(l => { if (live) lock = l; else l.release().catch(() => undefined); }, () => undefined);
    };
    ask();
    // The lock goes when the page is hidden; ask again when it's back.
    const again = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', again);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', again);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}

/** A map layer shown or not, as the pilot last chose on this device. */
function useShown(key: string, initial: boolean): [boolean, () => void] {
  const [shown, setShown] = React.useState(() => {
    try { const v = localStorage.getItem(key); return v == null ? initial : v === 'yes'; } catch { return initial; }
  });
  const toggle = () => setShown(v => {
    try { localStorage.setItem(key, v ? 'no' : 'yes'); } catch { /* private mode */ }
    return !v;
  });
  return [shown, toggle];
}

function useGlideRatio(): [number, (n: number) => void] {
  const [ratio, setRatio] = React.useState(() => {
    try { const n = Number(localStorage.getItem(RATIO_KEY)); return n >= 3 && n <= 30 ? n : DEFAULT_GLIDE_RATIO; } catch { return DEFAULT_GLIDE_RATIO; }
  });
  const set = (n: number) => {
    if (!(n >= 3 && n <= 30)) return;
    setRatio(n);
    try { localStorage.setItem(RATIO_KEY, String(n)); } catch { /* private mode */ }
  };
  return [ratio, set];
}

/**
 * Experimental navigation mode: the map full screen with the GPS's speed, track and altitude, the
 * airspace the aircraft is in, the frequencies along the route and an emergency page with the
 * nearest airfields. Situational awareness only.
 */
const NavigationMode: React.FC<NavigationModeProps> = ({
  trip, airspaces, airspacesFetchedAt = null, reportingPoints, swedenControl, bestGlideKt, cruiseKt, cruiseAltFt, climb = null, signedIn = false, resumed, onClose,
}) => {
  const { user } = useAuth();
  const termsAccepted = !!user && ((user.navTermsVersion ?? 0) >= NAV_TERMS_VERSION || acceptedHere(user.id));
  const [agreed, setAgreed] = React.useState(false);
  const route = React.useMemo(() => (trip ? [trip.departure, ...(trip.waypoints ?? []), trip.arrival] : []), [trip]);
  const labels = React.useMemo(() => routeLabels(route.map(a => a.code)), [route]);
  // The route as flown: out on the runway heading to 700 ft first, then on course.
  const climbOut = React.useMemo(() => (trip ? departureClimb(trip.departure,
    trip.points?.find(p => p.role === 'DEPARTURE')?.metar ?? null, route[1] ?? trip.arrival, climb) : null), [trip, route, climb]);
  const flown = React.useMemo(() => (climbOut
    ? [route[0], { ...route[0], code: departureClimbLabel(climbOut), name: departureClimbLabel(climbOut), lat: climbOut.lat, lon: climbOut.lon, type: 'point' }, ...route.slice(1)]
    : route), [route, climbOut]);
  const flownLabels = React.useMemo(() => (climbOut ? [labels[0], `RWY ${climbOut.runway} · ${DEPARTURE_TURN_FT} ft`, ...labels.slice(1)] : labels), [labels, climbOut]);
  const [started, setStarted] = React.useState<null | 'gps' | 'demo'>(null);
  const [fix, setFix] = React.useState<Fix | null>(null);
  const [gpsError, setGpsError] = React.useState<string | null>(null);
  const [follow, setFollow] = React.useState(true);
  const [sheet, setSheet] = React.useState<null | 'freq' | 'emergency' | 'end'>(null);
  const [directTo, setDirectTo] = React.useState<AirportInfo | null>(null);
  const [airfields, setAirfields] = React.useState<AirportInfo[]>(() => resumed?.airfields?.length ? resumed.airfields : route.filter(a => a.type !== 'point'));
  const [airfieldsState, setAirfieldsState] = React.useState<'loading' | 'ok' | 'error'>(resumed?.airfields?.length ? 'ok' : 'loading');
  const [ratio, setRatio] = useGlideRatio();
  // Without a route: everything around the aircraft (airspace, airfields, points, obstacles), loaded
  // again once it has gone AREA_RELOAD_NM from where it was last loaded.
  const [areaCenter, setAreaCenter] = React.useState<{ lat: number; lon: number } | null>(null);
  React.useEffect(() => {
    if (trip || !fix) return;
    if (!areaCenter || distanceNm(areaCenter.lat, areaCenter.lon, fix.lat, fix.lon) > AREA_RELOAD_NM) setAreaCenter({ lat: fix.lat, lon: fix.lon });
  }, [trip, fix, areaCenter]);
  /** What the lists near "the route" are near: the route, or the area around the aircraft. */
  const area = React.useMemo(() => (trip ? route : areaCenter ? areaAround(areaCenter, AREA_NM) : []), [trip, route, areaCenter]);
  const [areaAirspaces, setAreaAirspaces] = React.useState<AirspaceView[] | null>(null);
  React.useEffect(() => {
    if (trip || area.length === 0) return;
    let live = true;
    fetchAirspacesAlong(area).then(list => { if (live) setAreaAirspaces(list); }, () => undefined);
    return () => { live = false; };
  }, [trip, area]);
  const airspacesNow = trip ? airspaces : areaAirspaces;
  const airspacesAt = trip ? airspacesFetchedAt : areaAirspaces ? fetchedAtOf(areaAirspaces) : null;
  const closeRef = React.useRef<() => void>(onClose);
  useWakeLock(started !== null);

  // Escape closes; the page doesn't scroll underneath.
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (sheet) setSheet(null); else closeRef.current(); } };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; };
  }, [sheet, onClose]);

  // Every airfield along the route (or around the aircraft), kept for the emergency list.
  React.useEffect(() => {
    if (area.length === 0) return;
    let live = true;
    Promise.resolve().then(() => fetchAirportsAlong(area, 25))
      .then(list => { if (live && list?.length) { setAirfields(list); setAirfieldsState('ok'); } else if (live) setAirfieldsState(s => (s === 'ok' ? s : 'error')); })
      // Offline after a reload: the list kept with the flight stands.
      .catch(() => { if (live) setAirfieldsState(s => (s === 'ok' ? s : 'error')); });
    return () => { live = false; };
  }, [area]);

  // The app's whole screen while flying: no status bar (the browser's full screen needs a tap, in begin).
  React.useEffect(() => {
    if (!started || !isNative()) return;
    fullScreen(true);
    return () => { fullScreen(false); };
  }, [started]);

  // The GPS.
  React.useEffect(() => {
    if (started !== 'gps') return;
    if (!isNative() && !navigator.geolocation) { setGpsError('This browser has no location service.'); return; }
    return watchPosition(
      p => { setGpsError(null); setFix(prev => fixFrom(p.coords, p.timestamp || Date.now(), prev)); },
      e => setGpsError(e.denied
        ? (isNative() ? 'Location is off for this app: allow it in Settings.' : 'Location is blocked for this site: allow it in the browser settings.')
        : 'No GPS position yet.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [started]);

  // The demo flight: along the route at the cruise speed, climbing and descending at 500 ft/min.
  React.useEffect(() => {
    if (started !== 'demo' || !trip) return;
    const kt = cruiseKt > 40 ? cruiseKt : 100;
    const depFt = trip.departure.elevationFt ?? 0;
    const arrFt = trip.arrival.elevationFt ?? 0;
    // Flown with standard-rate turns at the corners, not on the spot.
    const path = roundedRoute(flown, turnRadiusNm(kt));
    const totalNm = routeLengthNm(path);
    const t0 = Date.now();
    const tick = () => {
      const nm = ((Date.now() - t0) / 3_600_000) * DEMO_SPEEDUP * kt;
      const p = positionAlong(path, nm);
      setFix({
        lat: p.lat, lon: p.lon, speedKt: p.done ? 0 : kt, trackDeg: p.trackDeg,
        altFt: demoAltitudeFt(nm, totalNm, kt, depFt, arrFt, cruiseAltFt), accuracyM: 5, at: Date.now(),
      });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [started, flown, cruiseKt, cruiseAltFt, trip]);

  // The map.
  const container = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  /** The reporting points, a layer of their own so they can be switched off; it outlives a redrawn map. */
  const vrpLayer = React.useRef(L.layerGroup());
  const fixLayer = React.useRef(L.layerGroup());
  const navaidLayer = React.useRef(L.layerGroup());
  const obstacleLayer = React.useRef(L.layerGroup());
  const own = React.useRef<{ marker: L.Marker; glide: L.Circle; direct: L.Polyline; trail: L.Polyline } | null>(null);
  /** Where the aircraft has been, for the trail on the map. */
  const trailRef = React.useRef<TrackPoint[]>([]);
  /** What the server has: the airspace overlay, and the self-hosted base map (undefined until asked). */
  const [status, setStatus] = React.useState<MapStatus | null | undefined>(undefined);
  React.useEffect(() => {
    let live = true;
    Promise.resolve().then(() => fetchMapStatus()).then(s => { if (live) setStatus(s ?? null); }, () => { if (live) setStatus(null); });
    return () => { live = false; };
  }, []);
  const ownBasemap = basemapCovers(status, route);
  React.useEffect(() => {
    if (!started || !container.current || status === undefined) return;
    const map = L.map(container.current, { zoomSnap: 0.5, minZoom: 5, maxZoom: 13, attributionControl: false, zoomControl: false });
    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    let live = true;
    const airspace = () => {
      if (live && status?.airspace) {
        cachedTileLayer(AIRSPACE_TILE_URL, {
          minZoom: status.minZoom, maxNativeZoom: Math.min(status.maxZoom, AIRSPACE_MAX_ZOOM), maxZoom: 19, attribution: OPENAIP_CREDIT,
        }).addTo(map);
      }
    };
    const osm = () => {
      if (live) L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_CREDIT, className: 'basemap-tiles' }).addTo(map);
    };
    // Our own vector base map where it covers the route (kept offline); else OpenStreetMap's, online only.
    if (ownBasemap && status?.basemap) {
      const { maxZoom } = status.basemap;
      import('protomaps-leaflet')
        .then(({ leafletLayer }) => {
          if (!live) return;
          (leafletLayer({
            url: BASEMAP_TILE_URL, maxDataZoom: maxZoom, maxZoom: 19, lang: 'en', attribution: PROTOMAPS_CREDIT,
            flavor: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          }) as unknown as L.Layer).addTo(map);
        }, osm)
        .then(airspace);
    } else {
      osm();
      airspace();
    }
    labelsByZoom(map, container.current);
    const pts = flown.map(a => L.latLng(a.lat, a.lon));
    // Without a route the map starts over Sweden, and follows the aircraft once the GPS has it.
    const startAt = pts[0] ?? L.latLng(fix?.lat ?? 62, fix?.lon ?? 16);
    if (pts.length > 1) {
      L.polyline(pts, { color: '#ffffff', weight: 7, opacity: 0.8, interactive: false }).addTo(map);
      L.polyline(pts, { color: ROUTE_COLOR, weight: 4, interactive: false }).addTo(map);
    }
    flown.forEach((a, i) => L.circleMarker([a.lat, a.lon], { radius: a.type === 'point' && i === 1 && climbOut ? 4 : 6, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1 })
      .bindTooltip(flownLabels[i], { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label' }).addTo(map));
    obstacleLayer.current.addTo(map);
    navaidLayer.current.addTo(map);
    fixLayer.current.addTo(map);
    vrpLayer.current.addTo(map);
    const trail = L.polyline(trailRef.current.map(p => [p.lat, p.lon] as [number, number]),
      { color: '#1e3a8a', weight: 3, opacity: 0.75, interactive: false }).addTo(map);
    const glide = L.circle(startAt, { radius: 0, color: '#16a34a', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
    const direct = L.polyline([], { color: '#dc2626', weight: 4, dashArray: '10 8', interactive: false }).addTo(map);
    const marker = L.marker(startAt, {
      icon: L.divIcon({ className: 'nav-ownship', iconSize: [32, 32], html: AIRPLANE_SVG }),
      keyboard: false, interactive: false, zIndexOffset: 1000,
    }).addTo(map);
    own.current = { marker, glide, direct, trail };
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 10 });
    else map.setView(startAt, fix ? 10 : 6);
    map.on('dragstart', () => setFollow(false));
    mapRef.current = map;
    // The map's box changes when a page opens below it or the tablet turns: Leaflet must measure again.
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.invalidateSize());
    resized?.observe(container.current);
    return () => { live = false; resized?.disconnect(); map.remove(); mapRef.current = null; own.current = null; };
  }, [started, status, ownBasemap, route, flown, flownLabels, climbOut]);

  // Visual reporting points: the route's airports' (given), and every other one near the route. Shown or not, as the pilot likes.
  const [nearVrps, setNearVrps] = React.useState<Vrp[]>(() => resumed?.nearVrps ?? []);
  React.useEffect(() => {
    let live = true;
    if (area.length === 0) return;
    Promise.resolve().then(() => reportingPointsNear(area)).then(list => { if (live && list.length) setNearVrps(list); }, () => undefined);
    return () => { live = false; };
  }, [route]);
  const vrps = React.useMemo(() => {
    const seen = new Set<string>();
    return [...reportingPoints, ...nearVrps].filter(p => {
      const key = `${p.name}@${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
      return !seen.has(key) && !!seen.add(key);
    });
  }, [reportingPoints, nearVrps]);
  const [showVrp, toggleVrp] = useShown(SHOW_VRP_KEY, true);
  // The AIP's IFR/GNSS fixes near the route.
  const [showFix, toggleFix] = useShown(SHOW_FIX_KEY, true);
  const fixes = React.useMemo(() => fixesNear(area, VRP_CORRIDOR_NM), [area]);
  React.useEffect(() => {
    const layer = fixLayer.current;
    layer.clearLayers();
    if (!showFix) return;
    fixes.forEach(p => L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: 'fix-marker', iconSize: [9, 9] }), keyboard: false, interactive: false,
    }).bindTooltip(p.name, { permanent: true, direction: 'right', offset: [4, 0], className: 'route-map-label fix-label' }).addTo(layer));
  }, [fixes, showFix]);
  // The AIP's en-route radio navaids (VOR, DME) near the route, labelled with what to tune.
  const [showNavaid, toggleNavaid] = useShown(SHOW_NAVAID_KEY, true);
  const navaids = React.useMemo(() => navaidsNear(area, NAVAID_RANGE_NM), [area]);
  React.useEffect(() => {
    const layer = navaidLayer.current;
    layer.clearLayers();
    if (!showNavaid) return;
    navaids.forEach(n => L.marker([n.lat, n.lon], {
      icon: L.divIcon({ className: 'navaid-marker', iconSize: [22, 22], html: navaidSvg(n) }), keyboard: false, title: navaidText(n),
    }).bindTooltip(`${n.ident} ${n.frequency ?? n.channel ?? ''}`.trim(), { permanent: true, direction: 'right', offset: [6, 0], className: 'route-map-label navaid-label' })
      .bindPopup(navaidPopup(n), { className: 'navaid-popup', closeButton: false, autoPan: false })
      .addTo(layer));
  }, [navaids, showNavaid]);
  // The AIP's obstacles of 100 m or more: on the map near the route, and called out when one is ahead.
  const [showObstacle, toggleObstacle] = useShown(SHOW_OBSTACLE_KEY, true);
  const [obstacleData, setObstacleData] = React.useState<Awaited<ReturnType<typeof loadObstacles>> | null>(null);
  React.useEffect(() => {
    let live = true;
    loadObstacles().then(d => { if (live) setObstacleData(d); }, () => undefined);
    return () => { live = false; };
  }, []);
  const routeObstacles = React.useMemo(
    () => (obstacleData ? obstaclesAlong(obstacleData.obstacles, area, () => cruiseAltFt, OBSTACLE_RANGE_NM) : []),
    [obstacleData, area, cruiseAltFt]);
  React.useEffect(() => {
    const layer = obstacleLayer.current;
    layer.clearLayers();
    if (!showObstacle || !obstacleData) return;
    routeObstacles.forEach(o => {
      const warn = o.clearanceFt < OBSTACLE_MARGIN_FT;
      L.marker([o.lat, o.lon], {
        icon: L.divIcon({ className: warn ? 'obstacle-marker obstacle-marker--warn' : 'obstacle-marker', iconSize: [22, 22], html: obstacleSvg(o, warn) }),
        keyboard: false, title: obstacleText(o),
      }).bindPopup(obstaclePopup(o, obstacleData.dates), { className: 'navaid-popup', closeButton: false, autoPan: false }).addTo(layer);
    });
  }, [routeObstacles, showObstacle, obstacleData]);
  // Whatever the layer shows: the one ahead is always called out.
  const ahead = React.useMemo(
    () => (fix && obstacleData ? obstacleAhead(obstacleData.obstacles, fix, fix.trackDeg, fix.altFt) : null),
    [fix, obstacleData]);
  const aipStale = (showFix && fixes.length > 0 && fixesOutOfDate()) ? fixesAiracText()
    : (showNavaid && navaids.length > 0 && navaidsOutOfDate()) ? navaidsAiracText() : null;
  React.useEffect(() => {
    const layer = vrpLayer.current;
    layer.clearLayers();
    if (!showVrp) return;
    vrps.forEach(p => L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: p.compulsory ? 'vrp-marker vrp-marker--compulsory' : 'vrp-marker', iconSize: [12, 11] }),
      keyboard: false, interactive: false,
    }).bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -4], className: 'route-map-label vrp-label nav-vrp-label' }).addTo(layer));
  }, [vrps, showVrp]);

  // A GPS flight keeps what it shows on the device as it loads, for carrying on after a reload.
  React.useEffect(() => {
    if (started === 'gps') updateNavSession({ airfields, nearVrps });
  }, [started, airfields, nearVrps]);

  // On start, the route's map is kept for flying without a connection.
  const [offline, setOffline] = React.useState<OfflineProgress | null>(null);
  React.useEffect(() => {
    // Without a route there is nothing to know ahead: the map is online only.
    if (!started || !trip || status === undefined || !canKeepOffline()) return;
    const urls: string[] = [];
    if (ownBasemap && status?.basemap) {
      const max = status.basemap.maxZoom;
      tilesAlong(route, Math.max(OFFLINE_MIN_ZOOM, status.basemap.minZoom), max).forEach(t => urls.push(tileUrl(BASEMAP_TILE_URL, t)));
    }
    if (status?.airspace) {
      tilesAlong(route, Math.max(OFFLINE_MIN_ZOOM, status.minZoom), Math.min(status.maxZoom, AIRSPACE_MAX_ZOOM))
        .forEach(t => urls.push(tileUrl(AIRSPACE_TILE_URL, t)));
    }
    if (!urls.length) return;
    const abort = new AbortController();
    setOffline({ done: 0, total: urls.length, failed: 0 });
    keepOffline(urls, setOffline, abort.signal).then(setOffline, () => undefined);
    return () => abort.abort();
  }, [started, trip, status, ownBasemap, route]);

  // Where everything is now.
  const leg = fix && flown.length > 1 ? activeLeg(flown, fix) : null;
  const target = directTo ?? (flown.length === 0 ? null : leg ? flown[leg.index + 1] : flown[flown.length - 1]);
  const targetLabel = directTo ? directTo.code : flown.length === 0 ? 'none' : leg ? flownLabels[leg.index + 1] : flownLabels[flownLabels.length - 1];
  const toTarget = fix && target ? bearingDistance(fix, target) : null;
  const here = fix && airspacesNow ? airspacesHere(airspacesNow, fix, fix.altFt) : null;
  const sweden = fix ? swedenControlAt(fix.lat, fix.lon) : null;
  // The next controlled airspace within 10 NM, along the route or straight to the Direct-to field.
  const routeCrossings = React.useMemo(() => crossingsAlong(flown, airspacesNow ?? []), [flown, airspacesNow]);
  // Without a route: straight ahead on the track.
  const ahead10 = fix && flown.length === 0 && fix.trackDeg != null
    ? [{ code: 'here', lat: fix.lat, lon: fix.lon }, { code: 'ahead', ...pointAhead(fix, fix.trackDeg, NEXT_AIRSPACE_NM) }] : null;
  const insideIds = new Set((here?.inside ?? []).map(a => a.id));
  const next = !fix || !airspacesNow ? null
    : directTo ? nextAirspace(crossingsAlong([{ code: 'here', lat: fix.lat, lon: fix.lon }, directTo], airspacesNow), 0, fix.altFt, insideIds)
      : ahead10 ? nextAirspace(crossingsAlong(ahead10, airspacesNow), 0, fix.altFt, insideIds)
        : leg ? nextAirspace(routeCrossings, leg.alongNm, fix.altFt, insideIds) : null;
  const nearest = React.useMemo(() => (fix ? nearestAirfields(airfields, fix, fix.altFt, ratio, 8) : []), [fix, airfields, ratio]);
  const groundFt = nearest[0]?.airport.elevationFt ?? null;
  const glideNm = fix?.altFt != null && groundFt != null ? glideRangeNm(fix.altFt - groundFt, ratio) : null;

  React.useEffect(() => {
    const map = mapRef.current, o = own.current;
    if (!map || !o || !fix) return;
    const at = L.latLng(fix.lat, fix.lon);
    o.marker.setLatLng(at);
    const last = trailRef.current[trailRef.current.length - 1];
    if (!last || at.distanceTo([last.lat, last.lon]) >= TRAIL_STEP_M) {
      trailRef.current = thinned([...trailRef.current, { lat: fix.lat, lon: fix.lon, altFt: fix.altFt == null ? null : Math.round(fix.altFt), at: fix.at }]);
      o.trail.addLatLng(at);
      // A GPS flight is kept on the device as it goes (every few points), so a reload doesn't lose it.
      if (started === 'gps' && trailRef.current.length % 5 === 0) storeTrack(trailRef.current);
    }
    const svg = o.marker.getElement()?.querySelector('svg');
    if (svg) {
      svg.style.transform = `rotate(${fix.trackDeg ?? 0}deg)`;
      svg.style.opacity = fix.trackDeg == null ? '0.6' : '1';
    }
    o.glide.setLatLng(at).setRadius((glideNm ?? 0) * 1852);
    o.direct.setLatLngs(directTo ? [at, [directTo.lat, directTo.lon]] : []);
    if (follow) map.panTo(at, { animate: true });
  }, [fix, glideNm, directTo, follow, started]);

  const recenter = () => {
    setFollow(true);
    if (fix && mapRef.current) mapRef.current.panTo([fix.lat, fix.lon]);
  };

  /** Starts, the terms accepted first: saved to the account, and on this device in case there's no connection. */
  const begin = (mode: 'gps' | 'demo') => {
    if (user && (user.navTermsVersion ?? 0) < NAV_TERMS_VERSION) {
      markAcceptedHere(user.id);
      acceptNavTerms(NAV_TERMS_VERSION).catch(() => undefined);
    }
    if (mode === 'gps') {
      // A flight recorded in the last half hour (the page reloaded) carries on.
      trailRef.current = loadTrack();
      // A flight with a route carries on after a reload with what it loaded; without one it loads afresh.
      if (trip) {
        saveNavSession({
          trip, airspaces, airspacesFetchedAt, reportingPoints, swedenControl, bestGlideKt, cruiseKt, cruiseAltFt, airfields, nearVrps, climb,
        });
      }
      fullScreen(true);
    }
    setStarted(mode);
  };

  if (!started) {
    const canStart = !!user && (termsAccepted || agreed);
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4 text-slate-100" role="dialog" aria-modal="true" aria-label="Navigation mode">
        <div className="max-w-lg space-y-4">
          <h2 className="text-xl font-semibold">Navigation mode <span className="rounded bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white">BETA</span></h2>
          {resumed && trip && (
            <p className="rounded-md border border-emerald-500 p-3 text-sm font-semibold">
              Your flight {trip.departure.code} → {trip.arrival.code} was still going when the page closed: carry on with GPS,
              its track and map kept.
            </p>
          )}
          <p className="text-sm">
            A VFR navigation aid: the route on a moving map with your GPS speed, track and altitude, the airspace you&apos;re in,
            the frequencies along the way, and an emergency page with the nearest airfields.
          </p>
          {!user ? (
            <p className="rounded-md border border-amber-500 p-3 text-sm">Sign in to use navigation mode.</p>
          ) : termsAccepted ? (
            <p className="text-sm text-slate-300">
              You remain responsible for the flight: check the AIP and NOTAMs, and navigate by what you see, the official charts
              and your instruments.
            </p>
          ) : (
            <div className="space-y-2 rounded-md border border-slate-600 p-3 text-sm">
              <p className="font-semibold">Before you use it (asked once):</p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                {NAV_TERMS.map(t => <li key={t}>{t}</li>)}
              </ul>
              <label className="flex items-center gap-2 pt-1 font-semibold">
                <input type="checkbox" className="h-5 w-5" checked={agreed} onChange={e => setAgreed(e.target.checked)}/>
                I understand and accept this
              </label>
            </div>
          )}
          <p className="text-xs text-slate-400">
            {trip
              ? <>The route&apos;s map is saved when you start, for flying without a connection: start while you still have one.</>
              : <>No route planned: the airspace, airfields and obstacles around you load as you fly, so keep a connection.</>}
            {' '}Keep the app in front with the screen on.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canStart} className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              onClick={() => begin('gps')}>
              {resumed ? 'Resume with GPS' : 'Start with GPS'}
            </button>
            {trip && (
              <button type="button" disabled={!canStart} className="rounded-md border border-slate-500 px-4 py-2 hover:bg-slate-800 disabled:opacity-40"
                onClick={() => begin('demo')}>
                Demo flight
              </button>
            )}
            <button type="button" className="rounded-md px-4 py-2 text-slate-300 hover:bg-slate-800" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const exit = () => {
    fullScreen(false);
    onClose();
  };
  // A GPS flight ends on its own page: save it (signed in) or let it go.
  const close = () => {
    if (started === 'gps' && trailRef.current.length >= 2) setSheet('end');
    else exit();
  };
  closeRef.current = close;
  const cell = 'flex flex-col items-center justify-center bg-slate-950 px-1 py-1 lg:landscape:py-2';
  const big = 'text-xl font-bold tabular-nums leading-tight sm:text-2xl lg:landscape:text-3xl';
  const small = 'text-[10px] uppercase tracking-wide text-slate-400';
  const inside = here?.inside ?? [];
  const severityClass = (a: AirspaceView) => ({
    prohibited: 'bg-red-700', restricted: 'bg-orange-600', clearance: 'bg-blue-700', contact: 'bg-amber-600', info: 'bg-slate-700',
  }[adviceFor(a).severity]);

  return (
    <div className="safe-area fixed inset-0 z-[2000] flex flex-col bg-slate-950 text-slate-100 lg:landscape:flex-row" role="dialog" aria-modal="true" aria-label="Navigation mode">
      {/* Portrait: everything stacked around the map. Landscape (a tablet on the knee): the map, and this panel on the right. */}
      <aside className="contents lg:landscape:order-2 lg:landscape:flex lg:landscape:w-[380px] lg:landscape:shrink-0 lg:landscape:flex-col lg:landscape:border-l lg:landscape:border-slate-700">
        {/* Speed, track, altitude and where to. */}
        <div className="order-1 grid grid-cols-[1fr_1fr_1fr_1.6fr_auto] gap-px border-b border-slate-700 bg-slate-700 lg:landscape:grid-cols-2">
          <div className={cell}><span className={small}>GS kt</span><span className={big}>{fix?.speedKt != null ? Math.round(fix.speedKt) : '-'}</span></div>
          <div className={cell}><span className={small}>TRK °T</span><span className={big}>{fix?.trackDeg != null ? pad3(fix.trackDeg) : '-'}</span></div>
          <div className={cell}><span className={small}>GPS alt ft</span><span className={big}>{fix?.altFt != null ? ft(fix.altFt) : '-'}</span></div>
          <div className={`${cell} ${directTo ? '!bg-red-900' : ''}`}>
            <span className={small}>{directTo ? 'Direct to' : 'Next'} {targetLabel}</span>
            <span className={big}>{toTarget ? `${nmText(toTarget.nm)} NM` : '-'}</span>
            <span className="text-xs tabular-nums text-slate-300">
              {toTarget ? `${pad3(toTarget.deg)}° · ${eteText(toTarget.nm, fix?.speedKt ?? null)}` : ''}
            </span>
          </div>
          <button type="button" aria-label="Close navigation mode" onClick={close}
            className="flex items-center justify-center gap-1 bg-slate-950 px-3 hover:bg-slate-800 lg:landscape:order-first lg:landscape:col-span-2 lg:landscape:justify-end lg:landscape:py-1.5 lg:landscape:text-sm">
            <span className="hidden lg:landscape:inline">Close</span><X className="h-5 w-5"/>
          </button>
        </div>

        {/* The airspace here. */}
        <div className="order-2 space-y-px text-sm" role="status" aria-label="Airspace here">
          {!fix ? (
            <div className="bg-slate-800 px-3 py-1.5">{gpsError ?? (started === 'demo' ? 'Starting the demo…' : 'Waiting for GPS…')}</div>
          ) : airspacesNow == null ? (
            <div className="bg-slate-800 px-3 py-1.5">Airspace not loaded.</div>
          ) : (
            <>
              {inside.map(a => <AirspaceRow key={a.id} airspace={a} className={severityClass(a)}/>)}
              {/* Not in controlled airspace: class G, and in Sweden whom to call there. */}
              {!inside.some(isControlled) && (
                <div className="flex flex-wrap items-baseline gap-x-2 bg-emerald-800 px-3 py-1.5">
                  <strong>{inside.length ? 'Class G around' : 'Uncontrolled (class G)'}</strong>
                  {sweden && <span className="ml-auto font-semibold tabular-nums">{swedenControlText(sweden.sector)}</span>}
                  {sweden && (sweden.sector.alternative || sweden.nearby.length > 0) && (
                    <span className="w-full text-right text-xs tabular-nums text-emerald-100">
                      or {[...(sweden.sector.alternative ? [sweden.sector.alternative] : []), ...sweden.nearby].map(swedenControlText).join(' / ')} (sector boundary)
                    </span>
                  )}
                </div>
              )}
              {next && (
                <AirspaceRow airspace={next.airspace} className="bg-sky-900" label={`Next in ${nmText(next.inNm)} NM`}/>
              )}
            </>
          )}
          {fix && here && here.above.length > 0 && (
            <div className="bg-slate-800 px-3 py-1 text-xs text-slate-300">
            Above: {here.above.slice(0, 2).map(a => `${a.name} from ${a.lower.label}`).join(' · ')}
            </div>
          )}
          {airspacesNow != null && airspacesAt != null && (
            <div className={`px-3 py-0.5 text-[11px] ${dataAgeDays(airspacesAt) > AIRAC_DAYS ? 'bg-amber-600 font-semibold text-white' : 'bg-slate-900 text-slate-400'}`}>
              {dataAgeDays(airspacesAt) > AIRAC_DAYS
                ? `Airspace data is ${dataAgeDays(airspacesAt)} days old: update it with a connection. `
                : 'Airspace: openAIP (volunteers), '}
            downloaded {new Date(airspacesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. No NOTAMs: check them.
            </div>
          )}
        </div>

        {ahead && (
          <div role="alert" className="order-2 flex flex-wrap items-baseline gap-x-2 bg-red-700 px-3 py-1.5 font-semibold text-white">
            <TriangleAlert className="h-4 w-4 self-center"/>
            <span>OBSTACLE {nmText(ahead.nm)} NM {pad3(ahead.bearingDeg)}°</span>
            <span className="font-normal">{obstacleKind(ahead.type)} {ahead.name}</span>
            <span className="ml-auto tabular-nums">
              top {ft(ahead.topFt)} ft MSL · {ahead.clearanceFt >= 0 ? `${ft(ahead.clearanceFt)} ft below you` : `${ft(-ahead.clearanceFt)} ft above you`}
            </span>
          </div>
        )}
        {aipStale && (
          <div className="order-2 bg-amber-600 px-3 py-0.5 text-[11px] font-semibold text-white">
            IFR fixes and navaids are from {aipStale}, out of date now: check the AIP before using them.
          </div>
        )}

        {/* Takes the rest of the panel in landscape when no page is open, keeping the buttons at the bottom. */}
        {!sheet && <div className="order-4 hidden lg:landscape:block lg:landscape:flex-1"/>}
        {sheet === 'freq' && (
          <Sheet title="Frequencies" onClose={() => setSheet(null)}>
            <FrequencyList route={trip ? flown : (ahead10 ?? [])} airspaces={airspacesNow} swedenControl={swedenControl}
              alongNm={trip ? leg?.alongNm ?? null : 0}/>
          </Sheet>
        )}
        {sheet === 'end' && (
          <Sheet title="End flight" onClose={() => setSheet(null)}>
            <EndFlight points={trailRef.current} signedIn={signedIn}
              defaultName={trip ? trackName(trip.departure.code, trip.arrival.code, trailRef.current[0]?.at ?? Date.now())
                : trackName(nearest[0]?.airport.code ?? 'GPS', 'free flight', trailRef.current[0]?.at ?? Date.now())}
              onDone={() => { clearTrack(); clearNavSession(); exit(); }} onKeepFlying={() => setSheet(null)}/>
          </Sheet>
        )}
        {sheet === 'emergency' && (
          <Sheet title="Emergency" tone="red" onClose={() => setSheet(null)}>
            <div className="space-y-3 text-sm">
              <p className="font-semibold">121.500 MHz · squawk 7700 · {bestGlideKt ? `best glide ${Math.round(bestGlideKt)} kt` : 'best glide speed'}</p>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                Glide ratio
                <input type="number" min={3} max={30} step={0.5} value={ratio} onChange={e => setRatio(Number(e.target.value))}
                  className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-slate-100"/>
                : 1 {glideNm != null && <span>· about {nmText(glideNm)} NM in still air</span>}
              </label>
              {!fix && <p>Waiting for a position.</p>}
              <ul className="divide-y divide-slate-700">
                {nearest.map(n => (
                  <li key={n.airport.code} className="flex items-center gap-2 py-2">
                    <div className="flex-1">
                      <div><strong>{n.airport.code}</strong> <span className="text-slate-300">{n.airport.name}</span></div>
                      <div className="text-xs tabular-nums text-slate-300">
                        {nmText(n.nm)} NM · {pad3(n.deg)}° · {eteText(n.nm, fix?.speedKt ?? bestGlideKt)}
                        {n.runway && ` · ${n.runway.lengthFt ? `${ft(n.runway.lengthFt)} ft` : 'runway'} ${n.runway.surface.toLowerCase()}`}
                        {n.airport.elevationFt != null && ` · elev ${ft(n.airport.elevationFt)} ft`}
                      </div>
                    </div>
                    {n.reachable != null && (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${n.reachable ? 'bg-emerald-600' : 'bg-slate-700 text-slate-300'}`}>
                        {n.reachable ? 'In glide' : 'Beyond glide'}
                      </span>
                    )}
                    <button type="button" className="rounded-md bg-red-700 px-3 py-1.5 font-semibold hover:bg-red-600"
                      onClick={() => { setDirectTo(n.airport); setFollow(true); setSheet(null); }}>
                      Direct to
                    </button>
                  </li>
                ))}
              </ul>
              {airfieldsState === 'error' && <p className="text-xs text-amber-300">Only the route&apos;s own airports: the airfield list couldn&apos;t be loaded.</p>}
              <p className="text-xs text-slate-400">
                In glide: a still-air glide at {ratio}:1 from GPS altitude, arriving {ARRIVAL_MARGIN_FT} ft above the field. No wind,
                no terrain. There is no data on fields for an off-airport landing: choose one by eye, into wind.
              </p>
              {nearest[0] && fix && (
                <div className="rounded-md border border-red-700 p-2">
                  <p className="mb-1 font-semibold">MAYDAY</p>
                  <ol className="list-decimal space-y-0.5 pl-5 text-xs">
                    {MAYDAY_CALL.map((line, i) => (
                      <li key={i}>
                        {line}
                        {i === 4 && (
                          <span className="font-semibold">
                            {`: ${nmText(nearest[0].nm)} NM ${compass((nearest[0].deg + 180) % 360)} of ${nearest[0].airport.name}`}
                            {fix.altFt != null && `, ${ft(fix.altFt)} ft`}
                            {fix.trackDeg != null && `, track ${pad3(fix.trackDeg)}`}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <details>
                <summary className="cursor-pointer font-semibold">Checklists (generic; your POH comes first)</summary>
                {GENERIC_EMERGENCY_CHECKLIST.map(s => (
                  <div key={s.title} className="mt-2">
                    <p className="font-semibold">{s.title}</p>
                    <ul className="text-xs">
                      {s.items.map(it => <li key={it.item} className="flex justify-between gap-2"><span>{it.item}</span><span className="font-semibold">{it.action}</span></li>)}
                    </ul>
                    {s.note && <p className="text-xs text-slate-400">{s.note}</p>}
                  </div>
                ))}
              </details>
            </div>
          </Sheet>
        )}
        <div className="order-5 grid grid-cols-3 gap-2 border-t border-slate-700 p-2">
          <button type="button" className="flex items-center justify-center gap-2 rounded-md bg-slate-800 py-3 font-semibold hover:bg-slate-700"
            onClick={() => setSheet(sheet === 'freq' ? null : 'freq')}>
            <Radio className="h-5 w-5"/> Frequencies
          </button>
          <button type="button" className="rounded-md bg-slate-800 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
            disabled={!directTo} onClick={() => setDirectTo(null)}>
            {directTo ? (trip ? 'Back to route' : 'Cancel direct') : trip ? 'On route' : 'No route'}
          </button>
          <button type="button" className="flex items-center justify-center gap-2 rounded-md bg-red-700 py-3 font-bold hover:bg-red-600"
            onClick={() => setSheet(sheet === 'emergency' ? null : 'emergency')}>
            <TriangleAlert className="h-5 w-5"/> EMERGENCY
          </button>
        </div>
      </aside>

      <div className="relative order-3 min-h-0 flex-1 lg:landscape:order-1">
        <div ref={container} className="route-map absolute inset-0" aria-label="Navigation map"/>
        <div className="pointer-events-none absolute left-2 top-2 z-[1000] flex flex-col gap-1 text-xs">
          <span className="rounded bg-slate-900/80 px-1.5 py-0.5 font-semibold text-slate-100">VFR navigation aid · beta</span>
          {offline && (
            <span className={`rounded px-1.5 py-0.5 font-semibold text-white ${offline.done < offline.total ? 'bg-slate-700' : offline.failed ? 'bg-amber-600' : 'bg-emerald-700'}`}>
              {offline.done < offline.total
                ? `Saving the map for offline… ${Math.round((offline.done / offline.total) * 100)}%`
                : offline.failed
                  ? `Map offline, ${offline.failed} tiles missing`
                  : ownBasemap ? 'Map saved for offline' : 'Airspace saved for offline (base map needs a connection here)'}
            </span>
          )}
          {started === 'demo' && <span className="rounded bg-sky-600 px-1.5 py-0.5 font-semibold text-white">DEMO FLIGHT ({DEMO_SPEEDUP}× speed)</span>}
          {fix?.accuracyM != null && fix.accuracyM > 50 && <span className="rounded bg-red-700 px-1.5 py-0.5 text-white">GPS ±{Math.round(fix.accuracyM)} m</span>}
        </div>
        <div className="absolute right-[10px] top-[84px] z-[1000] flex flex-col gap-1">
          <button type="button" aria-pressed={showVrp} onClick={toggleVrp} title="Visual reporting points"
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showVrp ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            VRP
          </button>
          <button type="button" aria-pressed={showFix} onClick={toggleFix} title="IFR/GNSS fixes (AIP ENR 4.4)"
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showFix ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            IFR
          </button>
          <button type="button" aria-pressed={showNavaid} onClick={toggleNavaid} title="Radio navaids: VOR, DME (AIP ENR 4.1)"
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showNavaid ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            NAV
          </button>
          <button type="button" aria-pressed={showObstacle} onClick={toggleObstacle} title="Obstacles of 100 m or more (AIP ENR 5.4)"
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showObstacle ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            OBS
          </button>
        </div>
        {!follow && fix && (
          <button type="button" onClick={recenter} className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-sm shadow-lg">
            <Crosshair className="h-4 w-4"/> Centre
          </button>
        )}
      </div>
    </div>
  );
};

/** Ending a GPS flight: save it to the account (then get its KML), or close without. */
const EndFlight: React.FC<{
  points: TrackPoint[]; signedIn: boolean; defaultName: string; onDone: () => void; onKeepFlying: () => void;
}> = ({ points, signedIn, defaultName, onDone, onKeepFlying }) => {
  const [name, setName] = React.useState(defaultName);
  const [state, setState] = React.useState<'idle' | 'saving' | { id: number } | { error: string }>('idle');
  const stats = trackStats(points);
  const save = () => {
    setState('saving');
    saveTrack(name.trim() || defaultName, points).then(
      t => { clearTrack(); clearNavSession(); setState({ id: t.id }); },
      e => setState({ error: e instanceof Error && e.message ? `${e.message} The flight stays on this device: try again when you have a connection.` : 'Could not save the flight.' }),
    );
  };
  const btn = 'rounded-md px-4 py-2 font-semibold';
  const saved = typeof state === 'object' && 'id' in state ? state.id : null;
  return (
    <div className="space-y-3 text-sm">
      <p className="tabular-nums">{nmText(stats.nm)} NM in {stats.minutes} min, {points.length} points.</p>
      {saved != null ? (
        <>
          <p className="font-semibold text-emerald-400">Saved to My flights.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-slate-700 hover:bg-slate-600`}
              onClick={() => { downloadTrackKml(saved).catch(() => undefined); }}>
              Download KML (Google Earth)
            </button>
            <button type="button" className={`${btn} bg-emerald-600 hover:bg-emerald-500`} onClick={onDone}>Close navigation mode</button>
          </div>
        </>
      ) : signedIn ? (
        <>
          <label className="block text-xs text-slate-300">
            Name
            <input value={name} maxLength={100} onChange={e => setName(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"/>
          </label>
          {typeof state === 'object' && 'error' in state && <p className="text-amber-300" role="alert">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60`} disabled={state === 'saving'} onClick={save}>
              {state === 'saving' ? 'Saving…' : 'Save flight'}
            </button>
            <button type="button" className={`${btn} bg-slate-700 hover:bg-slate-600`} onClick={onKeepFlying}>Keep flying</button>
            <button type="button" className={`${btn} text-slate-300 hover:bg-slate-800`} onClick={onDone}>Close without saving</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-slate-300">Sign in to save your flights and download them as KML for Google Earth.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-slate-700 hover:bg-slate-600`} onClick={onKeepFlying}>Keep flying</button>
            <button type="button" className={`${btn} text-slate-300 hover:bg-slate-800`} onClick={onDone}>Close</button>
          </div>
        </>
      )}
    </div>
  );
};

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** "south-west": where the aircraft is from the airfield. */
const compass = (deg: number) => POINTS[Math.round(deg / 45) % 8];

/** An airspace in the strip: its name, class and limits, whom to call, and for a tower's zone its ATIS and ground. */
const AirspaceRow: React.FC<{ airspace: AirspaceView; className: string; label?: string }> = ({ airspace: a, className, label }) => {
  const f = contactFrequencies(a.frequencies)[0];
  const extra = atisAndGround(a.frequencies);
  return (
    <div className={`${className} flex flex-wrap items-baseline gap-x-2 px-3 py-1.5`}>
      {label && <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</span>}
      <strong>{a.name}</strong>
      <span>{a.icaoClass ? `class ${a.icaoClass}` : a.type} · {a.lower.label}–{a.upper.label}</span>
      {f && <span className="ml-auto font-semibold tabular-nums">{frequencyText(f)}</span>}
      {extra.length > 0 && (
        <span className="w-full text-right text-xs tabular-nums opacity-90">
          {extra.map(x => `${x.kind} ${x.value}`).join(' · ')}
        </span>
      )}
    </div>
  );
};

const Sheet: React.FC<{ title: string; tone?: 'red'; onClose: () => void; children: React.ReactNode }> = ({ title, tone, onClose, children }) => (
  <div className={`order-4 max-h-[55%] shrink-0 overflow-y-auto border-t-4 bg-slate-900 p-3 lg:landscape:max-h-none lg:landscape:min-h-0 lg:landscape:flex-1 lg:landscape:shrink ${tone === 'red' ? 'border-red-600' : 'border-slate-500'}`}
    role="region" aria-label={title}>
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-lg font-bold">{title}</h3>
      <button type="button" aria-label={`Close ${title.toLowerCase()}`} className="rounded p-1 hover:bg-slate-800" onClick={onClose}><X className="h-5 w-5"/></button>
    </div>
    {children}
  </div>
);

/** The frequencies along the route in order: airspaces with their own or an airport's, and Sweden Control's sectors. */
const FrequencyList: React.FC<{
  route: RoutePosition[]; airspaces: AirspaceView[] | null; swedenControl: SwedenControlLeg[]; alongNm: number | null;
}> = ({ route, airspaces, swedenControl, alongNm }) => {
  const rows = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ key: string; name: string; fromNm: number; toNm: number; freqs: string[] }> = [];
    for (const c of crossingsAlong(route, airspaces ?? [])) {
      const freqs = contactFrequencies(c.airspace.frequencies).slice(0, 2).map(frequencyText);
      if (!freqs.length || seen.has(c.airspace.id)) continue;
      seen.add(c.airspace.id);
      list.push({ key: c.airspace.id, name: `${c.airspace.name} (${c.airspace.lower.label}–${c.airspace.upper.label})`, fromNm: c.fromNm, toNm: c.toNm, freqs });
    }
    swedenControl.forEach((s, i) => list.push({
      key: `sc-${i}`, name: `Class G: ${s.sector.sector}`, fromNm: s.fromNm, toNm: s.toNm, freqs: [swedenControlText(s.sector)],
    }));
    return list.sort((a, b) => a.fromNm - b.fromNm);
  }, [route, airspaces, swedenControl]);
  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold tabular-nums">Emergency 121.500</p>
      {airspaces == null && <p className="text-slate-400">Airspace not loaded.</p>}
      <ul className="divide-y divide-slate-700">
        {rows.map(r => {
          const now = alongNm != null && alongNm >= r.fromNm && alongNm <= r.toNm;
          const passed = alongNm != null && alongNm > r.toNm;
          return (
            <li key={r.key} className={`py-1.5 ${passed ? 'opacity-50' : ''} ${now ? 'border-l-4 border-emerald-500 pl-2' : ''}`}>
              <div className="flex justify-between gap-2">
                <span>{r.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {now ? 'now' : passed ? 'passed' : alongNm != null ? `in ${nmText(r.fromNm - alongNm)} NM` : `at ${nmText(r.fromNm)} NM`}
                </span>
              </div>
              <div className="font-semibold tabular-nums">{r.freqs.join(' · ')}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default NavigationMode;
