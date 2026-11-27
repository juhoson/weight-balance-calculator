import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Radio, TriangleAlert, X } from 'lucide-react';
import {
  acceptNavTerms, AIRSPACE_TILE_URL, airspacesFetchedAt as fetchedAtOf, BASEMAP_TILE_URL, fetchAirportsAlong, fetchAirspacesAlong, fetchMapArea,
  fetchMapStatus, fetchTraffic, type MapStatus, saveTrack, type Traffic, type TrackPoint,
} from '../../api/backend';
import { clearTrack, loadTrack, storeTrack, thinned, trackName, trackStats } from '../../lib/flightTrack';
import { type BlockLog, blockTimesOf, clearBlockLog, finishBlockLog, loadBlockLog, newBlockLog, nextBlockLog, storeBlockLog, utcTime } from '../../lib/blockTimes';
import { flightKml, kmlFileName } from '../../lib/kml';
import { saveFile } from '../../lib/share';
import DebriefPack, { TimesTable } from './DebriefPack';
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
import { relativeAltText, TRAFFIC_ALERT_FT, TRAFFIC_RANGE_NM, trafficName, trafficNear } from '../../lib/traffic';
import { departureClimb, departureClimbLabel, DEPARTURE_TURN_FT } from '../../lib/departure';
import Hud from './Hud';
import { nextBearing, TRACK_UP_AT, trackUpFrame } from '../../lib/trackUp';
import { bankFor, nextTurn, pathAngle, type TurnState } from '../../lib/hud';
import { type AirportLayout, keepLoadingLayouts } from '../../lib/airportLayout';
import { addLayoutPanes, drawAirportLayouts } from './airportLayer';
import { loadAerodrome, useArrivalPlan } from '../../lib/useArrivalPlan';
import { type FiledPlan, loadFiledPlan, storeFiledPlan } from '../../lib/icaoFlightPlan';
import { type ApproachWatch, newApproachWatch, overRunway, runwayZoom, watchApproach } from '../../lib/airportPhase';
import { type ArrivalPoint, circuitPattern, isControlledField, runwayAlong, STANDARD_CIRCUIT_AGL_FT } from '../../lib/arrival';
import RouteProfileChart from '../route/RouteProfileChart';
import { loadObstacles, OBSTACLE_AHEAD_NM, OBSTACLE_MARGIN_FT, obstacleAhead, obstacleKind, obstaclePopup, obstaclesAlong, obstacleSvg, obstacleText } from '../../lib/obstacles';
import {
  activeLeg, airspacesHere, ARRIVAL_MARGIN_FT, bearingDistance, DEFAULT_GLIDE_RATIO, eteText, type Fix, fixFrom,
  areaAround, demoStart, demoStep, glideRangeNm, isControlled, nearestAirfields, NEXT_AIRSPACE_NM, nextAirspace, pad3, pointAhead, positionAlong,
  roundedRoute, routeLengthNm, turnRadiusNm,
} from '../../lib/navigation';
import { distanceNm, type Forecast, forecastAt, fromOf, speedOf, type Wind, windNow } from '../../lib/openMeteo';
import { fetchTerrain, glideArea, type GlideInput, headingFor, reachesField, terrainAlert, type TerrainGrid, terrainGridFor, turnTo } from '../../lib/glide';

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
  /** The aircraft's approach speed, kt (the demo's final approach). */
  approachKt?: number | null;
  /** Signed in: a flight flown with GPS can be saved to the account when it ends. */
  signedIn?: boolean;
  /** A GPS flight in progress before the page reloaded: offered to carry on, with what it had loaded. */
  resumed?: Pick<NavSession, 'airfields' | 'nearVrps'>;
  /** The route from the side (terrain, cloud, the planned path), shown along the bottom on a tablet. */
  profile?: NavProfile | null;
  /** The landing runway the pilot picked while planning; null: into the wind. */
  landingRunway?: string | null;
  onClose: () => void;
}

/** What the planning page's route profile draws, for the strip along the bottom of the map. */
export type NavProfile = Omit<React.ComponentProps<typeof RouteProfileChart>, 'aircraft' | 'compact' | 'avoid' | 'onLegAltitude'>;

/** The profile strip shows when the map is at least this big (a tablet), this tall. */
const PROFILE_MIN_W = 700, PROFILE_MIN_H = 560, PROFILE_H = 150;

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const OPENAIP_CREDIT = 'airspace &copy; <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a>';
const ROUTE_COLOR = '#d946ef';
/** The demo flight runs this many times faster than real time. */
const DEMO_SPEEDUP = 4;
const RATIO_KEY = 'nav.glideRatio';
/**
 * Base map tiles kept for offline from this zoom; openAIP's airspace picture up to AIRSPACE_MAX_ZOOM.
 * Closer in it is not shown (enlarged, its navaid and airfield symbols would cover the field): the
 * airspace borders are drawn from the airspace data instead.
 */
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
const SHOW_HUD_KEY = 'nav.showHud';
const SHOW_PROFILE_KEY = 'nav.showProfile';
const TRACK_UP_KEY = 'nav.trackUp';
const SHOW_TRAFFIC_KEY = 'nav.showTraffic';
/** The trend line's ticks: where the aircraft will be in this many minutes. */
const TREND_MINUTES = [1, 2, 3];
/** Not drawn slower than this (taxiing, or standing). */
const TREND_MIN_KT = 20;
/** Auto-zoom: slower than this is on the ground (zoom 13); within this of the departure or arrival and lower than this above it, zoom 12. */
const AUTO_ZOOM_SLOW_KT = 50;
const AUTO_ZOOM_NEAR_NM = 3;
const AUTO_ZOOM_LOW_FT = 1500;
/** Slow within this of a field with its layout drawn: zoomed in to taxi. */
const TAXI_ZOOM_NM = 2;
const TAXI_ZOOM = 16;
/** "Join left downwind 19" → "join DW": short enough for the Next box ("ESSB join DW"). */
const shortArrivalLabel = (label: string) => label
  .replace(/^Join (left|right) downwind .*/, 'join DW').replace(/^Downwind .*/, 'DW').replace(/^Base .*/, 'base')
  .replace(/^Final .*/, 'final');
/** From this close to the threshold, the landing runway is asked about. */
const LANDING_ASK_NM = 10;
/** Over our own base map, OpenStreetMap's tiles from this zoom in (online). */
const CLOSE_TILES_ZOOM = 13;
/** Traffic asked this often while flying, ms. */
const TRAFFIC_POLL_MS = 5000;
const TRAFFIC_CREDIT = 'traffic &copy; <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (ODbL)';
/** Without a route: what's loaded around the aircraft, NM either way, ... */
const AREA_NM = 25;
/** ... and loaded again once it's this far from where it was. */
const AREA_RELOAD_NM = 15;
/** Without a route, the map kept for offline: this far around the aircraft. */
const OFFLINE_AREA_NM = 50;
/** The ground under the glide: fetched this far either side of the route, or around the aircraft without one. */
const TERRAIN_ROUTE_NM = 6;
const TERRAIN_AROUND_NM = 10;
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
/** "240/18": where the wind comes from (true) and its speed. */
const windText = (w: Wind) => `${pad3(fromOf(w))}/${Math.round(speedOf(w))} kt`;
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

/** A label's text in its own box, which track-up turns back upright (the tooltip itself turns with the map). */
const upright = (html: string) => `<span class="upright">${html}</span>`;

/** A map layer shown or not, as the pilot last chose on this device. */
/**
 * An airspace's border, in openAIP's colours: blue for controlled airspace, red for restricted, danger
 * and prohibited areas, purple for the rest (TMZ, RMZ, ...); dashed when it is only active at times.
 */
export function airspaceBorder(a: Pick<AirspaceView, 'type' | 'icaoClass' | 'activation'>): L.PathOptions {
  const color = ['R', 'D', 'P'].includes(a.type) ? '#dc2626'
    : a.icaoClass && a.icaoClass !== 'G' ? '#1d4ed8' : '#7c3aed';
  return { color, weight: 2, opacity: 0.8, dashArray: a.activation ? '8 6' : undefined };
}

/** The circuit shown after a go-around. */
interface GoAroundCircuit {
  code: string;
  runway: string;
  side: 'LEFT' | 'RIGHT';
  /** The side is the field's own (openAIP); else the standard left. */
  published: boolean;
  /** In a control zone: ATC says how. */
  controlled: boolean;
  /** Standard height above the field (none is published in openAIP), as an altitude. */
  circuitFt: number;
  points: ArrivalPoint[];
}

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
  trip, airspaces, airspacesFetchedAt = null, reportingPoints, swedenControl, bestGlideKt, cruiseKt, cruiseAltFt, climb = null, approachKt = null, signedIn = false, resumed, profile = null, landingRunway = null, onClose,
}) => {
  const { user } = useAuth();
  const termsAccepted = !!user && ((user.navTermsVersion ?? 0) >= NAV_TERMS_VERSION || acceptedHere(user.id));
  const [agreed, setAgreed] = React.useState(false);
  const route = React.useMemo(() => (trip ? [trip.departure, ...(trip.waypoints ?? []), trip.arrival] : []), [trip]);
  const labels = React.useMemo(() => routeLabels(route.map(a => a.code)), [route]);
  // The route as flown: out on the runway heading to 700 ft first, then on course.
  const climbOut = React.useMemo(() => (trip ? departureClimb(trip.departure,
    trip.points?.find(p => p.role === 'DEPARTURE')?.metar ?? null, route[1] ?? trip.arrival, climb) : null), [trip, route, climb]);
  const flownBase = React.useMemo(() => (climbOut
    ? [route[0], { ...route[0], code: departureClimbLabel(climbOut), name: departureClimbLabel(climbOut), lat: climbOut.lat, lon: climbOut.lon, type: 'point' }, ...route.slice(1)]
    : route), [route, climbOut]);
  const baseLabels = React.useMemo(() => (climbOut ? [labels[0], `RWY ${climbOut.runway} · ${DEPARTURE_TURN_FT} ft`, ...labels.slice(1)] : labels), [labels, climbOut]);
  // …and in at the end: the way in to the landing runway's threshold (asked again on the way in).
  const [landingPick, setLandingPick] = React.useState<string | null>(landingRunway);
  const [landingConfirmed, setLandingConfirmed] = React.useState(false);
  const { plan: arrival, options: landingChoices } = useArrivalPlan(trip, airspaces, landingPick);
  const flown = React.useMemo(() => (arrival && flownBase.length > 1
    ? [...flownBase.slice(0, -1), ...arrival.points.map((p, i, all) => (i === all.length - 1
      ? { ...flownBase[flownBase.length - 1], lat: p.lat, lon: p.lon }
      : { ...flownBase[flownBase.length - 1], code: p.label, name: p.label, lat: p.lat, lon: p.lon, type: 'point' }))]
    : flownBase), [flownBase, arrival]);
  const flownLabels = React.useMemo(() => (arrival && flownBase.length > 1
    ? [...baseLabels.slice(0, -1), ...arrival.points.map(p => `${baseLabels[baseLabels.length - 1]} ${shortArrivalLabel(p.label)}`)]
    : baseLabels), [baseLabels, flownBase, arrival]);
  const flownRef = React.useRef(flown);
  flownRef.current = flown;
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
  // The forecast wind where the aircraft is (again after AREA_RELOAD_NM or half an hour), for the glide and headings.
  const [forecast, setForecast] = React.useState<{ f: Forecast; at: { lat: number; lon: number }; when: number } | null>(null);
  React.useEffect(() => {
    if (!started || !fix) return;
    if (forecast && distanceNm(forecast.at.lat, forecast.at.lon, fix.lat, fix.lon) < AREA_RELOAD_NM && Date.now() - forecast.when < 30 * 60_000) return;
    const at = { lat: fix.lat, lon: fix.lon };
    let live = true;
    forecastAt(at).then(f => { if (live && f) setForecast({ f, at, when: Date.now() }); }, () => undefined);
    return () => { live = false; };
  }, [started, fix, forecast]);
  const wind = forecast && fix?.altFt != null ? windNow(forecast.f, fix.altFt) : null;
  // The ground under the glide: fetched for the route (or the area around the aircraft) while online.
  const [terrain, setTerrain] = React.useState<TerrainGrid | null>(null);
  React.useEffect(() => {
    const around = trip ? route : areaCenter ? [areaCenter] : [];
    if (!started || around.length === 0) return;
    const grid = terrainGridFor(around, trip ? TERRAIN_ROUTE_NM : TERRAIN_AROUND_NM);
    if (!grid) return;
    const abort = new AbortController();
    fetchTerrain(grid, abort.signal).then(setTerrain, () => undefined);
    return () => abort.abort();
  }, [started, trip, route, areaCenter]);
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

  // The demo flight: from standstill on the runway, climbing at Vy, cruising, descending at 500 ft/min
  // and down a 3.5° approach at the approach speed to a stop, the corners flown as standard-rate turns.
  React.useEffect(() => {
    if (started !== 'demo' || !trip) return;
    const cruise = cruiseKt > 40 ? cruiseKt : 100;
    // The path is made again when the way in changes (another runway): the flight carries on along it.
    let pathOf = flownRef.current;
    let path = roundedRoute(pathOf, turnRadiusNm(cruise));
    const plan = {
      totalNm: routeLengthNm(path), depFt: trip.departure.elevationFt ?? 0, arrFt: trip.arrival.elevationFt ?? 0,
      cruiseFt: cruiseAltFt, cruiseKt: cruise,
      climbKt: climb && climb.kt > 30 ? climb.kt : Math.round(cruise * 0.7), climbFpm: climb && climb.fpm > 0 ? climb.fpm : 600,
      approachKt: approachKt && approachKt > 30 ? approachKt : Math.round(cruise * 0.6),
    };
    let st = demoStart(plan);
    let last = Date.now();
    const tick = () => {
      if (pathOf !== flownRef.current) {
        pathOf = flownRef.current;
        path = roundedRoute(pathOf, turnRadiusNm(cruise));
        plan.totalNm = routeLengthNm(path);
      }
      const now = Date.now();
      st = demoStep(st, ((now - last) / 1000) * DEMO_SPEEDUP, plan);
      last = now;
      const p = positionAlong(path, st.nm);
      setFix({ lat: p.lat, lon: p.lon, speedKt: Math.round(st.kt), trackDeg: p.trackDeg, altFt: st.altFt, accuracyM: 5, at: now, vsFpm: st.vsFpm });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [started, cruiseKt, cruiseAltFt, trip, climb, approachKt]);

  // The map.
  const container = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  /** Holds the map's controls, outside the element that turns in track-up. */
  const chrome = React.useRef<HTMLDivElement>(null);
  /** The map's frame, to size the turning square. */
  const frame = React.useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = React.useState<{ w: number; h: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setFrameSize(s => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [started]);
  /** The reporting points, a layer of their own so they can be switched off; it outlives a redrawn map. */
  const vrpLayer = React.useRef(L.layerGroup());
  const fixLayer = React.useRef(L.layerGroup());
  const navaidLayer = React.useRef(L.layerGroup());
  /** The airspace borders, drawn closer in than openAIP's picture goes. */
  const borderLayer = React.useRef(L.layerGroup());
  const obstacleLayer = React.useRef(L.layerGroup());
  const trafficLayer = React.useRef(L.layerGroup());
  /** The last leg and the way in to the runway: drawn by itself, as it changes with the runway. */
  const arrivalLayer = React.useRef(L.layerGroup());
  /** After a go-around: the circuit to fly round again. */
  const circuitLayer = React.useRef(L.layerGroup());
  /** The fields' runways and taxiways (OpenStreetMap), drawn when zoomed in. */
  const layoutLayer = React.useRef(L.layerGroup());
  const [layouts, setLayouts] = React.useState<Record<string, AirportLayout>>({});
  const layoutsRef = React.useRef(layouts);
  /** Counts the maps made, so what's set on the map is set again on a new one. */
  const [mapGen, setMapGen] = React.useState(0);
  layoutsRef.current = layouts;
  /** The map zooms itself by the phase of flight until the pilot zooms. */
  const autoZoom = React.useRef(true);
  /** Set while the map zooms itself, so its own zoom isn't taken for the pilot's. */
  const zooming = React.useRef(false);
  /** Close in when slow (on the ground), closer when low near the departure or arrival; 10 en route. */
  const zoomFor = (f: Fix): number => {
    if ((f.speedKt ?? 0) < AUTO_ZOOM_SLOW_KT) {
      // Taxiing, rolling or landing at a field whose layout is drawn: close enough to read the taxiways.
      const atField = Object.values(layoutsRef.current).some(l => {
        const p = l.features.find(x => x.kind === 'runway')?.points[0];
        return p && distanceNm(p[0], p[1], f.lat, f.lon) <= TAXI_ZOOM_NM;
      });
      return atField ? TAXI_ZOOM : 13;
    }
    // Taking off (until past the runway's end or 300 ft up) and low on the way in: the field's layout in view.
    const fieldAt = Object.values(layoutsRef.current).find(l => {
      const p = l.features.find(x => x.kind === 'runway')?.points[0];
      return p && distanceNm(p[0], p[1], f.lat, f.lon) <= TAXI_ZOOM_NM;
    });
    const elevation = fieldAt ? [...route, ...airfields].find(a => a.code === fieldAt.code)?.elevationFt : null;
    if (fieldAt && elevation != null && f.altFt != null) {
      const z = runwayZoom({ aglFt: f.altFt - elevation, vsFpm: f.vsFpm, overRunway: overRunway([fieldAt], f) });
      if (z != null) return z;
    }
    const fields = route.length ? [route[0], route[route.length - 1]] : [];
    const nearField = fields.find(a => distanceNm(a.lat, a.lon, f.lat, f.lon) <= AUTO_ZOOM_NEAR_NM);
    if (nearField && f.altFt != null && f.altFt - (nearField.elevationFt ?? 0) < AUTO_ZOOM_LOW_FT) return 12;
    return 10;
  };
  const own = React.useRef<{
    marker: L.Marker; glide: L.Polygon; direct: L.Polyline; trail: L.Polyline; trend: L.Polyline; ticks: L.Marker[];
  } | null>(null);
  /** Where the aircraft has been, for the trail on the map. */
  const trailRef = React.useRef<TrackPoint[]>([]);
  /** Off block, takeoff, landing and on block, as the fixes come (kept on the device for a reload). */
  const blockRef = React.useRef<BlockLog>(newBlockLog());
  const [blockLog, setBlockLog] = React.useState<BlockLog>(blockRef.current);
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
    const map = L.map(container.current, { zoomSnap: 0.5, minZoom: 5, maxZoom: 18, attributionControl: false, zoomControl: false });
    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    // The zoom buttons and credits stay put when the map turns: their box moves out of the map's element.
    const controls = (map as unknown as { _controlContainer?: HTMLElement })._controlContainer;
    if (controls && chrome.current) chrome.current.appendChild(controls);
    let live = true;
    const airspace = () => {
      if (live && status?.airspace) {
        cachedTileLayer(AIRSPACE_TILE_URL, {
          minZoom: status.minZoom, maxZoom: Math.min(status.maxZoom, AIRSPACE_MAX_ZOOM), attribution: OPENAIP_CREDIT,
          className: 'airspace-tiles',
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
          // Its data goes to zoom 11: closer in (at a field), OpenStreetMap's own tiles over it when online (credited above).
          L.tileLayer(OSM_URL, { minZoom: CLOSE_TILES_ZOOM, maxZoom: 19, className: 'basemap-tiles' }).addTo(map);
        }, osm)
        .then(airspace);
    } else {
      osm();
      airspace();
    }
    labelsByZoom(map, container.current);
    const pts = flownBase.map(a => L.latLng(a.lat, a.lon));
    // Without a route the map starts over Sweden, and follows the aircraft once the GPS has it.
    const startAt = pts[0] ?? L.latLng(fix?.lat ?? 62, fix?.lon ?? 16);
    // Up to the last point before the arrival: the way in is drawn by itself (it changes with the runway).
    const body = pts.slice(0, -1);
    if (body.length > 1) {
      L.polyline(body, { color: '#ffffff', weight: 7, opacity: 0.8, interactive: false, className: 'nav-route-casing' }).addTo(map);
      L.polyline(body, { color: ROUTE_COLOR, weight: 4, interactive: false, className: 'nav-route-line' }).addTo(map);
    }
    flownBase.slice(0, -1).forEach((a, i) => L.circleMarker([a.lat, a.lon], { radius: a.type === 'point' && i === 1 && climbOut ? 4 : 6, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1 })
      .bindTooltip(upright(baseLabels[i]), { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label' }).addTo(map));
    // Closer in than openAIP's picture: the airspace borders, under the route.
    const borders = () => {
      if (map.getZoom() > AIRSPACE_MAX_ZOOM) borderLayer.current.addTo(map); else borderLayer.current.remove();
    };
    borders();
    map.on('zoomend', borders);
    arrivalLayer.current.addTo(map);
    circuitLayer.current.addTo(map);
    addLayoutPanes(map);
    layoutLayer.current.addTo(map);
    map.on('zoomend', () => drawAirportLayouts(layoutLayer.current, Object.values(layoutsRef.current), map.getZoom()));
    obstacleLayer.current.addTo(map);
    trafficLayer.current.addTo(map);
    map.attributionControl?.addAttribution(TRAFFIC_CREDIT);
    navaidLayer.current.addTo(map);
    fixLayer.current.addTo(map);
    vrpLayer.current.addTo(map);
    const trail = L.polyline(trailRef.current.map(p => [p.lat, p.lon] as [number, number]),
      { color: '#1e3a8a', weight: 3, opacity: 0.75, interactive: false }).addTo(map);
    const glide = L.polygon([], { color: '#16a34a', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
    const direct = L.polyline([], { color: '#dc2626', weight: 4, dashArray: '10 8', interactive: false }).addTo(map);
    const marker = L.marker(startAt, {
      icon: L.divIcon({ className: 'nav-ownship', iconSize: [32, 32], html: AIRPLANE_SVG }),
      keyboard: false, interactive: false, zIndexOffset: 1000,
    }).addTo(map);
    // Where the aircraft will be on this track at this ground speed: a line to 3 minutes, ticks at each minute.
    const trend = L.polyline([], { color: '#0f172a', weight: 2.5, opacity: 0.8, dashArray: '6 6', interactive: false, className: 'nav-trend' }).addTo(map);
    const ticks = TREND_MINUTES.map(() => L.marker(startAt, {
      icon: L.divIcon({ className: 'trend-tick', iconSize: [12, 12], html: '<span></span>' }),
      keyboard: false, interactive: false, opacity: 0,
    }).addTo(map));
    own.current = { marker, glide, direct, trail, trend, ticks };
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 10 });
    else map.setView(startAt, fix ? 10 : 6);
    drawAirportLayouts(layoutLayer.current, Object.values(layoutsRef.current), map.getZoom());
    map.on('dragstart', () => setFollow(false));
    // A zoom the pilot made (not ours) stops the automatic one until Centre.
    map.on('zoomstart', () => { if (!zooming.current) autoZoom.current = false; });
    map.on('zoomend', () => { zooming.current = false; });
    mapRef.current = map;
    setMapGen(g => g + 1);
    // The map's box changes when a page opens below it or the tablet turns: Leaflet must measure again.
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.invalidateSize());
    resized?.observe(container.current);
    return () => { live = false; resized?.disconnect(); map.remove(); mapRef.current = null; own.current = null; };
  }, [started, status, ownBasemap, route, flownBase, baseLabels, climbOut]);

  // The last leg and the way in to the runway, redrawn when the runway changes.
  React.useEffect(() => {
    const group = arrivalLayer.current;
    group.clearLayers();
    if (!mapRef.current || flownBase.length < 2) return;
    const from = flownBase.length - 2;
    const tail = flown.slice(from), names = flownLabels.slice(from);
    const line = tail.map(a => L.latLng(a.lat, a.lon));
    L.polyline(line, { color: '#ffffff', weight: 7, opacity: 0.8, interactive: false, className: 'nav-route-casing' }).addTo(group);
    L.polyline(line, { color: ROUTE_COLOR, weight: 4, interactive: false, className: 'nav-route-line' }).addTo(group);
    tail.slice(1).forEach((a, j) => {
      const i = j + 1, end = i === tail.length - 1, join = i === 1 && tail.length > 2;
      L.circleMarker([a.lat, a.lon], { radius: end ? 6 : join ? 4 : 3, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1 })
        .bindTooltip(upright(names[i]), { permanent: true, direction: 'right', offset: [8, 0], className: `route-map-label${end || join ? '' : ' nav-arrival-turn'}` })
        .addTo(group);
    });
  }, [flown, flownLabels, flownBase, mapGen]);

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
    }).bindTooltip(upright(p.name), { permanent: true, direction: 'right', offset: [4, 0], className: 'route-map-label fix-label' }).addTo(layer));
  }, [fixes, showFix]);
  React.useEffect(() => {
    const layer = borderLayer.current;
    layer.clearLayers();
    (airspacesNow ?? []).forEach(a => {
      if (a.polygon.length < 3) return;
      L.polygon(a.polygon.map(([lon, lat]) => [lat, lon] as [number, number]), { ...airspaceBorder(a), fill: false, interactive: false })
        .addTo(layer);
    });
  }, [airspacesNow]);
  // The AIP's en-route radio navaids (VOR, DME) near the route, labelled with what to tune.
  const [showNavaid, toggleNavaid] = useShown(SHOW_NAVAID_KEY, true);
  const navaids = React.useMemo(() => navaidsNear(area, NAVAID_RANGE_NM), [area]);
  React.useEffect(() => {
    const layer = navaidLayer.current;
    layer.clearLayers();
    if (!showNavaid) return;
    navaids.forEach(n => L.marker([n.lat, n.lon], {
      icon: L.divIcon({ className: 'navaid-marker', iconSize: [22, 22], html: navaidSvg(n) }), keyboard: false, title: navaidText(n),
    }).bindTooltip(upright(`${n.ident} ${n.frequency ?? n.channel ?? ''}`.trim()), { permanent: true, direction: 'right', offset: [6, 0], className: 'route-map-label navaid-label' })
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
  // Other traffic (ADS-B, online only), asked every few seconds around the aircraft.
  const [showTraffic, toggleTraffic] = useShown(SHOW_TRAFFIC_KEY, true);
  const [showHud, toggleHud] = useShown(SHOW_HUD_KEY, false);
  const [trackUp, toggleTrackUp] = useShown(TRACK_UP_KEY, true);
  const [showProfile, toggleProfile] = useShown(SHOW_PROFILE_KEY, true);
  const profileFits = !!profile && profile.legs.length > 0 && !!frameSize && frameSize.w >= PROFILE_MIN_W && frameSize.h >= PROFILE_MIN_H;
  const strip = profileFits && showProfile && !!started ? PROFILE_H + 12 : 0;
  // Turned while following the aircraft; looking round (a drag) shows north up until Centre.
  const rotated = trackUp && follow && !!started && !!frameSize;
  const bearingRef = React.useRef(0);
  const bearing = React.useMemo(() => {
    bearingRef.current = rotated ? nextBearing(bearingRef.current, fix?.trackDeg ?? null) : 0;
    return bearingRef.current;
  }, [rotated, fix?.trackDeg]);
  // With the profile along the bottom, the aircraft sits low in what is left of the view above it.
  const trackUpAt = frameSize && strip ? (TRACK_UP_AT * (frameSize.h - strip)) / frameSize.h : TRACK_UP_AT;
  const box = rotated && frameSize ? trackUpFrame(frameSize.w, frameSize.h, trackUpAt) : null;
  // Turned, Leaflet would read a drag the wrong way round: it doesn't drag, a drag shows north up instead,
  // and pinches zoom about the aircraft.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    container.current?.classList.toggle('nav-track-up', rotated);
    const opts = map.options as L.MapOptions;
    if (rotated) { map.dragging.disable(); map.doubleClickZoom.disable(); opts.touchZoom = 'center'; opts.scrollWheelZoom = 'center'; }
    else { map.dragging.enable(); map.doubleClickZoom.enable(); opts.touchZoom = true; opts.scrollWheelZoom = true; }
    map.invalidateSize({ pan: false });
    if (fix) map.panTo([fix.lat, fix.lon], { animate: false });
  }, [rotated, box?.size, mapGen]);
  const press = React.useRef<{ x: number; y: number; id: number } | null>(null);
  // The turn rate from the track as the fixes come, for the HUD's bank.
  const turn = React.useRef<TurnState | null>(null);
  const turnDps = React.useMemo(() => {
    if (!fix) return 0;
    // The demo flies DEMO_SPEEDUP times faster than the clock: its turn rate is in its own seconds.
    const at = started === 'demo' ? fix.at * DEMO_SPEEDUP : fix.at;
    if (turn.current?.at !== at) turn.current = nextTurn(turn.current, fix.trackDeg, at, fix.speedKt);
    return turn.current.dps;
  }, [fix]);
  const [trafficList, setTrafficList] = React.useState<Traffic[] | null>(null);
  const [trafficFailed, setTrafficFailed] = React.useState(false);
  const fixRef = React.useRef<Fix | null>(null);
  fixRef.current = fix;
  const hasFix = fix != null;
  React.useEffect(() => {
    // From the first position on (not before: it's asked around the aircraft).
    if (!started || !hasFix) return;
    let live = true;
    const ask = () => {
      const f = fixRef.current;
      if (!f) return;
      fetchTraffic(f.lat, f.lon, TRAFFIC_RANGE_NM).then(
        list => { if (live) { setTrafficList(list); setTrafficFailed(false); } },
        () => { if (live) setTrafficFailed(true); });
    };
    ask();
    const id = setInterval(ask, TRAFFIC_POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [started, hasFix]);
  const traffic = React.useMemo(() => (fix && trafficList ? trafficNear(fix, trafficList) : []), [fix, trafficList]);
  const conflict = traffic.find(t => t.conflict) ?? null;
  React.useEffect(() => {
    const layer = trafficLayer.current;
    layer.clearLayers();
    if (!showTraffic) return;
    traffic.forEach(t => {
      const near = t.dAltFt != null && Math.abs(t.dAltFt) <= TRAFFIC_ALERT_FT;
      const cls = t.conflict ? 'traffic-marker traffic-marker--conflict' : near ? 'traffic-marker traffic-marker--near' : 'traffic-marker';
      L.marker([t.lat, t.lon], {
        icon: L.divIcon({ className: cls, iconSize: [26, 26],
          html: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style="transform: rotate(${t.trackDeg ?? 0}deg)">`
            + '<path d="M13 3 L19 21 L13 17 L7 21 Z"/></svg>' }),
        keyboard: false, title: `${trafficName(t)} ${t.type ?? ''}`.trim(), zIndexOffset: 500,
      }).bindTooltip(upright(`${relativeAltText(t)} ${trafficName(t)}`.trim()), { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label traffic-label' })
        .addTo(layer);
    });
  }, [traffic, showTraffic]);
  // Whatever the layer shows: the one ahead is always called out.
  const ahead = React.useMemo(
    () => (fix && obstacleData
      ? obstacleAhead(obstacleData.obstacles, fix, fix.trackDeg, fix.altFt, Math.max(OBSTACLE_AHEAD_NM, ((fix.speedKt ?? 0) * 1.5) / 60))
      : null),
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
    }).bindTooltip(upright(p.name), { permanent: true, direction: 'top', offset: [0, -4], className: 'route-map-label vrp-label nav-vrp-label' }).addTo(layer));
  }, [vrps, showVrp]);

  // A GPS flight keeps what it shows on the device as it loads, for carrying on after a reload.
  React.useEffect(() => {
    if (started === 'gps') updateNavSession({ airfields, nearVrps });
  }, [started, airfields, nearVrps]);

  // On start, the route's map is kept for flying without a connection.
  const [offline, setOffline] = React.useState<OfflineProgress | null>(null);
  React.useEffect(() => {
    // Without a route: everything within OFFLINE_AREA_NM of where the aircraft is (again as it goes on).
    if (!started || status === undefined || !canKeepOffline()) return;
    const keep = trip ? route : areaCenter ? [areaCenter] : null;
    if (!keep) return;
    const buffer = trip ? undefined : () => OFFLINE_AREA_NM;
    const urls: string[] = [];
    if (ownBasemap && status?.basemap) {
      const max = status.basemap.maxZoom;
      tilesAlong(keep, Math.max(OFFLINE_MIN_ZOOM, status.basemap.minZoom), max, buffer).forEach(t => urls.push(tileUrl(BASEMAP_TILE_URL, t)));
    }
    if (status?.airspace) {
      tilesAlong(keep, Math.max(OFFLINE_MIN_ZOOM, status.minZoom), Math.min(status.maxZoom, AIRSPACE_MAX_ZOOM), buffer)
        .forEach(t => urls.push(tileUrl(AIRSPACE_TILE_URL, t)));
    }
    if (!urls.length) return;
    const abort = new AbortController();
    setOffline({ done: 0, total: urls.length, failed: 0 });
    keepOffline(urls, setOffline, abort.signal).then(setOffline, () => undefined);
    return () => abort.abort();
  }, [started, trip, status, ownBasemap, route, areaCenter]);

  // Where everything is now.
  const leg = fix && flown.length > 1 ? activeLeg(flown, fix) : null;
  // On the profile: how far along the planned route (measured as the chart does) and how high.
  const routeNm = React.useMemo(() => routeLengthNm(route), [route]);
  const chartNm = React.useMemo(() => (profile ? profile.legs.flatMap(l => l.segments)
    .reduce((m, sg) => Math.max(m, sg.segment.startNm + sg.segment.distanceNm), 0) : 0), [profile]);
  const onPlan = strip && fix && route.length > 1 ? activeLeg(route, fix) : null;
  const profileAt = onPlan && routeNm > 0 ? { nm: (onPlan.alongNm / routeNm) * chartNm, ft: fix?.altFt ?? null } : null;
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
  const nearestStill = React.useMemo(() => (fix ? nearestAirfields(airfields, fix, fix.altFt, ratio, 8) : []), [fix, airfields, ratio]);
  const groundFt = nearestStill[0]?.airport.elevationFt ?? null;
  // A go-around (or a touch and go) noticed from the GPS: the circuit to fly, its side and height.
  const approachWatch = React.useRef<ApproachWatch>(newApproachWatch());
  /** A flight plan marked as filed in the planner: reminded of after landing. */
  const [filedPlan, setFiledPlan] = React.useState<FiledPlan | null>(() => loadFiledPlan());
  const [goAround, setGoAround] = React.useState<GoAroundCircuit | null>(null);
  const nearFix = nearestStill[0];
  React.useEffect(() => {
    if (!fix) return;
    const elev = nearFix?.airport.elevationFt;
    const near = nearFix && elev != null && fix.altFt != null ? { code: nearFix.airport.code, aglFt: fix.altFt - elev, nm: nearFix.nm } : null;
    const { watch, goAround: began } = watchApproach(approachWatch.current, fix, near);
    approachWatch.current = watch;
    if (began && nearFix) {
      const field = nearFix.airport, end = runwayAlong(field, began.trackDeg);
      if (!end) return;
      const controlled = isControlledField(field, airspacesNow);
      loadAerodrome(field.code).then(a => {
        const published = a?.code === field.code ? a.circuits.find(c => c.runway === end.runway)?.direction ?? null : null;
        const side = published ?? 'LEFT';
        setGoAround({
          code: field.code, runway: end.runway, side, published: published != null, controlled,
          circuitFt: (field.elevationFt ?? 0) + STANDARD_CIRCUIT_AGL_FT,
          points: circuitPattern(field, end, side, layoutsRef.current[field.code] ?? null),
        });
      }, () => undefined);
    }
    // Landed, or gone from the field: the circuit is put away.
    if (goAround && ((fix.speedKt ?? 0) < 35 || !nearFix || nearFix.airport.code !== goAround.code || nearFix.nm > 5)) setGoAround(null);
  }, [fix]);
  React.useEffect(() => {
    const group = circuitLayer.current;
    group.clearLayers();
    if (!goAround) return;
    const line = goAround.points.map(p => L.latLng(p.lat, p.lon));
    L.polyline(line, { color: '#ffffff', weight: 6, opacity: 0.7, interactive: false }).addTo(group);
    L.polyline(line, { color: '#d97706', weight: 3, dashArray: '8 6', interactive: false }).addTo(group);
    goAround.points.slice(1, -1).forEach(p => L.circleMarker([p.lat, p.lon], { radius: 3, color: '#ffffff', weight: 2, fillColor: '#d97706', fillOpacity: 1 })
      .bindTooltip(upright(p.label), { permanent: true, direction: 'right', offset: [6, 0], className: 'route-map-label' }).addTo(group));
  }, [goAround, mapGen]);

  // The layouts of the departure and arrival, and of any field the aircraft is at (landing elsewhere).
  const atFieldCode = nearestStill[0] && nearestStill[0].nm <= TAXI_ZOOM_NM ? nearestStill[0].airport.code : null;
  const layoutCodes = React.useMemo(() => {
    const ends = route.length ? [route[0], route[route.length - 1]].filter(a => a.type !== 'point').map(a => a.code) : [];
    return Array.from(new Set([...ends, ...(atFieldCode ? [atFieldCode] : [])])).filter(Boolean).join(',');
  }, [route, atFieldCode]);
  React.useEffect(() => {
    if (!started || !layoutCodes) return;
    // Asked again every few minutes until the server has it (its map source is often busy).
    return keepLoadingLayouts(layoutCodes.split(',').filter(c => !layoutsRef.current[c]),
      (code, l) => setLayouts(all => ({ ...all, [code]: l })));
  }, [started, layoutCodes]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (map) drawAirportLayouts(layoutLayer.current, Object.values(layouts), map.getZoom());
  }, [layouts]);
  // The glide in the wind at this altitude and over the terrain, where they're known.
  const glideIn = React.useMemo<GlideInput | null>(() => (fix?.altFt != null ? {
    at: fix, altFt: fix.altFt, ratio, tasKt: bestGlideKt && bestGlideKt > 30 ? bestGlideKt : 70, wind, terrain, groundFt: groundFt ?? 0,
  } : null), [fix, ratio, bestGlideKt, wind, terrain, groundFt]);
  const glideEdge = React.useMemo(() => (glideIn ? glideArea(glideIn) : []), [glideIn]);
  const glideReach = React.useMemo(() => {
    if (!glideIn || glideEdge.length === 0) return null;
    const nm = glideEdge.map(p => bearingDistance(glideIn.at, p).nm);
    return { min: Math.min(...nm), max: Math.max(...nm) };
  }, [glideIn, glideEdge]);
  const nearest = React.useMemo(() => (glideIn
    ? nearestStill.map(n => ({ ...n, reachable: reachesField(glideIn, n.airport, n.nm, n.deg, ARRIVAL_MARGIN_FT) }))
    : nearestStill), [nearestStill, glideIn]);
  const glideNm = fix?.altFt != null && groundFt != null ? glideRangeNm(fix.altFt - groundFt, ratio) : null;
  // Too close to the ground away from an airfield, or rising ground ahead (with the terrain loaded).
  const terrainNow = React.useMemo(
    () => (fix ? terrainAlert(fix, fix.trackDeg, fix.altFt, fix.speedKt, fix.vsFpm ?? null, terrain, airfields) : null),
    [fix, terrain, airfields]);

  React.useEffect(() => {
    const map = mapRef.current, o = own.current;
    if (!map || !o || !fix) return;
    const at = L.latLng(fix.lat, fix.lon);
    o.marker.setLatLng(at);
    // The logged times: shown when one changes, kept on the device in a GPS flight.
    const before = blockRef.current, after = nextBlockLog(before, fix);
    blockRef.current = after;
    if (after.phase !== before.phase || after.landings !== before.landings || after.offBlockAt !== before.offBlockAt) {
      setBlockLog(after);
    }
    if (started === 'gps' && after !== before) storeBlockLog(after);
    const last = trailRef.current[trailRef.current.length - 1];
    if (!last || at.distanceTo([last.lat, last.lon]) >= TRAIL_STEP_M) {
      trailRef.current = thinned([...trailRef.current, { lat: fix.lat, lon: fix.lon, altFt: fix.altFt == null ? null : Math.round(fix.altFt), at: fix.at }]);
      o.trail.addLatLng(at);
      // A GPS flight is kept on the device as it goes (every few points), so a reload doesn't lose it.
      if (started === 'gps' && trailRef.current.length % 5 === 0) storeTrack(trailRef.current);
    }
    const svg = o.marker.getElement()?.querySelector('svg');
    if (svg) {
      // Turned the short way round: from 350° to 10° is 20° right, not 340° left.
      const before = Number(svg.dataset.rotation ?? fix.trackDeg ?? 0);
      const delta = ((((fix.trackDeg ?? before) - before) % 360) + 540) % 360 - 180;
      svg.dataset.rotation = String(before + delta);
      svg.style.transform = `rotate(${before + delta}deg)`;
      svg.style.opacity = fix.trackDeg == null ? '0.6' : '1';
    }
    o.glide.setLatLngs(glideEdge.map(p => [p.lat, p.lon] as [number, number]));
    o.direct.setLatLngs(directTo ? [at, [directTo.lat, directTo.lon]] : []);
    const moving = fix.trackDeg != null && (fix.speedKt ?? 0) > TREND_MIN_KT;
    const ahead = (min: number) => (moving ? pointAhead(fix, fix.trackDeg as number, ((fix.speedKt as number) * min) / 60) : fix);
    const end = ahead(TREND_MINUTES[TREND_MINUTES.length - 1]);
    o.trend.setLatLngs(moving ? [at, [end.lat, end.lon]] : []);
    o.ticks.forEach((t, i) => {
      const min = TREND_MINUTES[i];
      const p = ahead(min);
      t.setLatLng([p.lat, p.lon]).setOpacity(moving ? 1 : 0);
      // "2 min · 2.6 NM" on the later ticks; the first is a dot (the labels would crowd).
      const label = t.getElement()?.querySelector('span');
      if (label) label.textContent = moving && min > 1 ? `${min} min · ${nmText(((fix.speedKt as number) * min) / 60)} NM` : '';
    });
    // Closer in when slow or low near the departure or arrival (rolling, taking off, landing), unless the pilot zoomed.
    if (follow && autoZoom.current) {
      const z = zoomFor(fix);
      if (z !== map.getZoom()) { zooming.current = true; map.setZoom(z, { animate: true }); }
    }
    if (follow) map.panTo(at, { animate: true });
  }, [fix, glideEdge, directTo, follow, started]);

  const recenter = () => {
    setFollow(true);
    autoZoom.current = true;
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
      blockRef.current = (trailRef.current.length ? loadBlockLog() : null) ?? newBlockLog();
      setBlockLog(blockRef.current);
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
          <p className="text-xs text-slate-400">
            Terrain and obstacle warnings come from GPS altitude, a 90 m elevation model and the AIP&apos;s obstacles of 100 m or more
            (not complete): they can be late or missing. Keep a lookout and your own margins.
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
    if (started && trailRef.current.length >= 2) setSheet('end');
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
            {started && trailRef.current.length >= 2
              ? <span className="text-xs font-semibold leading-tight lg:landscape:text-sm">End flight</span>
              : <><span className="hidden lg:landscape:inline">Close</span><X className="h-5 w-5"/></>}
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

        {directTo && toTarget && fix && (() => {
          const tas = bestGlideKt && bestGlideKt > 30 ? bestGlideKt : cruiseKt > 30 ? cruiseKt : 70;
          const heading = headingFor(toTarget.deg, tas, wind);
          const turn = turnTo(fix.trackDeg, toTarget.deg);
          return (
            <div role="status" aria-label="Direct to" className="order-2 flex flex-wrap items-baseline gap-x-3 bg-red-900 px-3 py-1.5 text-white">
              <span className="text-lg font-bold">{turn === 'on' ? 'ON COURSE' : `TURN ${turn.toUpperCase()}`} HEADING {pad3(heading)}</span>
              <span className="text-xs tabular-nums text-red-100">
                track {pad3(toTarget.deg)}° to {directTo.code}{wind ? `, wind ${windText(wind)} at ${tas} kt` : ', no wind known'}
              </span>
            </div>
          );
        })()}
        {conflict && (
          <div role="alert" aria-label="Traffic" className="order-2 flex flex-wrap items-baseline gap-x-2 bg-amber-500 px-3 py-1.5 font-bold text-slate-950">
            <TriangleAlert className="h-4 w-4 self-center"/>
            <span>TRAFFIC {conflict.clock} O&apos;CLOCK {nmText(conflict.nm)} NM</span>
            <span className="font-semibold">
              {conflict.dAltFt == null ? 'height unknown' : Math.abs(conflict.dAltFt) < 100 ? 'same height'
                : `${ft(Math.abs(conflict.dAltFt))} ft ${conflict.dAltFt > 0 ? 'above' : 'below'}`}
            </span>
            <span className="ml-auto font-normal">{trafficName(conflict)}{conflict.type ? ` ${conflict.type}` : ''}</span>
          </div>
        )}
        {terrainNow && (
          <div role="alert" aria-label="Terrain" className="order-2 flex flex-wrap items-baseline gap-x-2 bg-red-700 px-3 py-1.5 font-semibold text-white">
            <TriangleAlert className="h-4 w-4 self-center"/>
            {terrainNow.kind === 'ahead' ? (
              <>
                <span>TERRAIN AHEAD {nmText(terrainNow.nm)} NM</span>
                <span className="font-normal tabular-nums">
                  ground {ft(terrainNow.groundFt)} ft, {terrainNow.clearFt >= 0 ? `${ft(terrainNow.clearFt)} ft below your path` : `${ft(-terrainNow.clearFt)} ft above it`}
                </span>
                <span className="ml-auto">CLIMB OR TURN</span>
              </>
            ) : (
              <>
                <span>LOW: {ft(Math.max(0, terrainNow.aglFt))} ft above the ground</span>
                <span className="ml-auto">CLIMB</span>
              </>
            )}
          </div>
        )}
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

        {/* On the way in: is the planned runway still the one? (The ATIS, the wind, the tower may say another.) */}
        {arrival && fix && trip && !directTo && (() => {
          const thr = arrival.points[arrival.points.length - 1];
          const nm = bearingDistance(fix, thr).nm;
          if (nm > LANDING_ASK_NM) return null;
          const m = trip.points?.find(p => p.role === 'ARRIVAL')?.metar;
          const wind = m?.windKt != null ? (m.windDirTrue == null ? `wind VRB/${m.windKt}` : `wind ${pad3(m.windDirTrue)}°/${m.windKt} kt`) : null;
          return (
            <div className={`order-2 px-3 py-2 text-sm ${landingConfirmed ? 'bg-slate-900' : 'bg-amber-900/70'}`} role="status" aria-label="Landing runway">
              <p>
                <strong>Landing RWY {arrival.landing.runway}</strong>
                {arrival.kind === 'circuit' ? ` · ${arrival.side === 'LEFT' ? 'left' : 'right'} circuit, join 45° onto the downwind` : ' · final as cleared'}
                {!landingConfirmed && <span className="block text-xs text-amber-100">
                  {arrival.landing.by === 'wind' ? `Planned into the wind${wind ? ` (${m?.station ?? 'METAR'} ${wind})` : ''}` : arrival.landing.by === 'course' ? 'Planned in line with the way in (no wind reported)' : 'Your choice'}.
                  {' '}Still the one? Check the ATIS or the wind sock.
                </span>}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {landingChoices.map(o => {
                  const current = o.runway === arrival.landing.runway;
                  return (
                    <button key={o.runway} type="button" aria-pressed={current}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${current ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                      onClick={() => { setLandingPick(o.runway); setLandingConfirmed(true); }}>
                      {current ? (landingConfirmed ? `RWY ${o.runway} ✓` : `Keep ${o.runway}`) : `Change to ${o.runway}`}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* Landed with a flight plan filed: close it (at a field without ATC it isn't closed for you). */}
        {filedPlan && (blockLog.phase === 'taxi-in' || blockLog.phase === 'on-block') && (() => {
          const here = nearFix && nearFix.nm <= 3 ? nearFix.airport.code : null;
          return (
            <div role="alert" aria-label="Close your flight plan" className="order-2 flex flex-wrap items-center gap-x-2 gap-y-1 bg-sky-700 px-3 py-1.5 text-sm text-white">
              <strong>Close your flight plan</strong>
              <span className="text-sky-100">
                {here && here !== filedPlan.destination ? `Landed at ${here}, not ${filedPlan.destination}: tell ATS. ` : ''}
                {filedPlan.closePhone ? '' : 'Call the ATS reporting office, or as the AIP says for the field.'}
              </span>
              {filedPlan.closePhone && (
                <a href={`tel:${filedPlan.closePhone.replace(/[^+\d]/g, '')}`} className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-sky-800">
                  Call {filedPlan.closePhone}
                </a>
              )}
              <button type="button" className="ml-auto rounded bg-sky-900/60 px-2 py-0.5 text-xs font-semibold"
                onClick={() => { storeFiledPlan(null); setFiledPlan(null); }}>Closed</button>
            </div>
          );
        })()}
        {goAround && (
          <div role="status" aria-label="Go-around" className="order-2 flex flex-wrap items-baseline gap-x-2 bg-amber-700 px-3 py-1.5 text-sm text-white">
            <strong>Go-around {goAround.code} RWY {goAround.runway}</strong>
            <span>
              {goAround.controlled ? 'Fly as ATC instructs. ' : ''}
              {goAround.side === 'LEFT' ? 'Left' : 'Right'}-hand circuit{goAround.published ? '' : ' (standard; none published)'}
              {' · '}circuit altitude ≈ {goAround.circuitFt.toLocaleString('en')} ft
              <span className="text-amber-100"> ({STANDARD_CIRCUIT_AGL_FT.toLocaleString('en')} ft above the field; none published, check the AIP)</span>
            </span>
            <button type="button" className="ml-auto rounded bg-amber-900/60 px-2 py-0.5 text-xs font-semibold" onClick={() => setGoAround(null)}>Hide</button>
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
            <EndFlight points={trailRef.current} signedIn={signedIn && started === 'gps'} demo={started === 'demo'}
              log={finishBlockLog(blockRef.current, Date.now())}
              planned={trip ? flown : []} from={trip?.departure.code ?? nearest[0]?.airport.code ?? null} to={trip?.arrival.code ?? null}
              defaultName={trip ? trackName(trip.departure.code, trip.arrival.code, trailRef.current[0]?.at ?? Date.now())
                : trackName(nearest[0]?.airport.code ?? 'GPS', 'free flight', trailRef.current[0]?.at ?? Date.now())}
              onDone={() => { clearTrack(); clearBlockLog(); clearNavSession(); exit(); }} onKeepFlying={() => setSheet(null)}/>
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
                : 1 {glideReach ? <span>· reaches {nmText(glideReach.min)}–{nmText(glideReach.max)} NM{wind ? ` in a ${windText(wind)} wind` : ''}</span>
                  : glideNm != null && <span>· about {nmText(glideNm)} NM in still air</span>}
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
                In glide: at {ratio}:1 from GPS altitude, {wind ? `in the forecast wind at this altitude (${windText(wind)})` : 'in still air (no wind forecast)'},
                {terrain ? ' over the terrain (Copernicus elevation model)' : ' without terrain (not loaded)'}, arriving {ARRIVAL_MARGIN_FT} ft above the field.
                The green line on the map is the reach. There is no data on fields for an off-airport landing: choose one by eye, into wind.
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

      <div ref={frame} className="relative order-3 min-h-0 flex-1 overflow-hidden lg:landscape:order-1"
        onPointerDownCapture={e => { press.current = rotated && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; }}
        onPointerMoveCapture={e => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) { press.current = null; setFollow(false); }
        }}
        onPointerUpCapture={() => { press.current = null; }}
        // A second finger is a pinch, not a look round.
        onTouchStartCapture={e => { if (e.touches.length > 1) press.current = null; }}>
        <div ref={container} aria-label="Navigation map"
          // The class list stays as written: Leaflet adds its own to it (track-up's is set below, not here).
          className="route-map absolute"
          style={box
            ? { left: box.left, top: box.top, width: box.size, height: box.size, transform: `rotate(${-bearing}deg)`, transition: 'transform 0.6s linear',
              ['--nav-bearing' as string]: `${bearing}deg` }
            : { left: 0, top: 0, right: 0, bottom: 0 }}/>
        <div ref={chrome} className="nav-map-chrome leaflet-touch pointer-events-none absolute inset-x-0 top-0 z-[950]" style={{ bottom: strip }}/>
        {strip > 0 && profile && (
          <div className="dark pointer-events-none absolute inset-x-2 bottom-2 z-[960] rounded-lg bg-slate-950/70 px-1 pt-1 text-foreground shadow-lg backdrop-blur-[1px]"
            data-testid="nav-profile">
            <RouteProfileChart {...profile} compact={{ height: PROFILE_H - 4 }} aircraft={profileAt}/>
          </div>
        )}
        {showHud && started && fix && (
          <Hud speedKt={fix.speedKt} altFt={fix.altFt} vsFpm={fix.vsFpm ?? null} trackDeg={fix.trackDeg}
            bankDeg={bankFor(turnDps, fix.speedKt)} pathDeg={pathAngle(fix.vsFpm, fix.speedKt)} centred={follow} atY={box ? trackUpAt : 0.5}/>
        )}
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
          {showTraffic && started && (
            <span className={`rounded px-1.5 py-0.5 font-semibold ${trafficFailed ? 'bg-slate-700 text-slate-300' : 'bg-slate-900/80 text-slate-100'}`}>
              {trafficFailed ? 'Traffic: no connection' : trafficList == null ? 'Traffic: looking…'
                : `Traffic: ${traffic.length} within ${TRAFFIC_RANGE_NM} NM (ADS-B only)`}
            </span>
          )}
          {blockLog.offBlockAt != null && (
            <span className="rounded bg-slate-900/80 px-1.5 py-0.5 font-semibold tabular-nums text-slate-100" data-testid="block-times">
              Off block {utcTime(blockLog.offBlockAt)}
              {blockLog.takeoffAt != null && ` · T/O ${utcTime(blockLog.takeoffAt)}`}
              {blockLog.landingAt != null && ` · LDG ${utcTime(blockLog.landingAt)}${blockLog.landings > 1 ? ` (${blockLog.landings})` : ''}`}
              {blockLog.onBlockAt != null && ` · On block ${utcTime(blockLog.onBlockAt)}`}
            </span>
          )}
          {started === 'demo' && <span className="rounded bg-sky-600 px-1.5 py-0.5 font-semibold text-white">DEMO FLIGHT ({DEMO_SPEEDUP}× speed)</span>}
          {fix?.accuracyM != null && fix.accuracyM > 50 && <span className="rounded bg-red-700 px-1.5 py-0.5 text-white">GPS ±{Math.round(fix.accuracyM)} m</span>}
        </div>
        <div className="absolute right-[10px] top-[84px] z-[1000] flex flex-col gap-1">
          <button type="button" aria-pressed={trackUp} onClick={() => { if (!trackUp) recenter(); toggleTrackUp(); }}
            title={trackUp ? 'Track up: the map turns with your track. Tap for north up.' : 'North up. Tap for track up: the map turns with your track.'}
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${trackUp ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            {trackUp ? 'TRK↑' : 'N↑'}
          </button>
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
          <button type="button" aria-pressed={showTraffic} onClick={toggleTraffic} title="Traffic: aircraft sending ADS-B (online)"
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showTraffic ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            TFC
          </button>
          {profileFits && (
            <button type="button" aria-pressed={showProfile} onClick={toggleProfile} title="The route from the side along the bottom: terrain, cloud, the planned path and where you are"
              className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showProfile ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
              PRF
            </button>
          )}
          <button type="button" aria-pressed={showHud} onClick={toggleHud}
            title="HUD: speed and altitude tapes, bank and horizon round the aircraft (worked out from the GPS: no gyro)"
            className={`rounded-md px-2 py-1.5 text-xs font-semibold shadow-lg ${showHud ? 'bg-sky-700 text-white' : 'bg-slate-900/85 text-slate-300'}`}>
            HUD
          </button>
        </div>
        {!follow && fix && (
          <button type="button" onClick={recenter} style={{ bottom: strip + 12 }} className="absolute right-3 z-[1000] flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-sm shadow-lg">
            <Crosshair className="h-4 w-4"/> Centre
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Ending a flight: the logged times (off block, takeoff, landing, on block), the debriefing pack and
 * the KML (made on the device), and saving it to the account with its times (signed in).
 */
const EndFlight: React.FC<{
  points: TrackPoint[]; log: BlockLog; signedIn: boolean; demo: boolean; defaultName: string;
  planned: Array<{ lat: number; lon: number; code?: string }>; from: string | null; to: string | null;
  onDone: () => void; onKeepFlying: () => void;
}> = ({ points, log, signedIn, demo, defaultName, planned, onDone, onKeepFlying }) => {
  const [name, setName] = React.useState(defaultName);
  const [state, setState] = React.useState<'idle' | 'saving' | { id: number } | { error: string }>('idle');
  const [debrief, setDebrief] = React.useState(false);
  const stats = trackStats(points);
  // Worked out once when the page opens: on block is when it stopped (or now).
  const [times] = React.useState(() => blockTimesOf(log));
  /** Saves the flight to My flights; true when it was. */
  const save = (): Promise<boolean> => {
    setState('saving');
    return saveTrack(name.trim() || defaultName, points, times).then(
      t => { clearTrack(); clearBlockLog(); clearNavSession(); setState({ id: t.id }); return true; },
      e => {
        setState({ error: e instanceof Error && e.message ? `${e.message} The flight stays on this device: try again when you have a connection.` : 'Could not save the flight.' });
        return false;
      },
    );
  };
  const kml = () => {
    saveFile(kmlFileName(points), flightKml(name.trim() || defaultName, points, times), 'application/vnd.google-earth.kml+xml')
      .catch(() => setState(s => (typeof s === 'object' && 'id' in s ? s : { error: 'Could not share the KML.' })));
  };
  const btn = 'rounded-md px-4 py-2 font-semibold';
  const saved = typeof state === 'object' && 'id' in state ? state.id : null;
  /** Out of the flight from the debriefing pack: saved first when it can be; a failed save stays on this page to retry. */
  const exitFlight = () => {
    if (!signedIn || saved != null) { onDone(); return; }
    void save().then(ok => { if (ok) onDone(); else setDebrief(false); });
  };
  return (
    <div className="space-y-3 text-sm">
      {demo && <p className="rounded bg-sky-900 px-2 py-1 text-xs">Demo flight: its times run 4× fast, and it isn&apos;t saved.</p>}
      <TimesTable times={times} dark/>
      <p className="tabular-nums text-slate-300">{nmText(stats.nm)} NM flown, {points.length} points. Times from the GPS: check them against the tech log.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btn} bg-sky-700 hover:bg-sky-600`} onClick={() => setDebrief(true)}>Debriefing pack</button>
        <button type="button" className={`${btn} bg-slate-700 hover:bg-slate-600`} onClick={kml}>Download KML (Google Earth)</button>
      </div>
      {saved != null ? (
        <>
          <p className="font-semibold text-emerald-400">Saved to My flights, with its times.</p>
          <button type="button" className={`${btn} bg-emerald-600 hover:bg-emerald-500`} onClick={onDone}>Close navigation mode</button>
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
              {state === 'saving' ? 'Saving…' : 'Save to My flights'}
            </button>
            <button type="button" className={`${btn} bg-slate-700 hover:bg-slate-600`} onClick={onKeepFlying}>Keep flying</button>
            <button type="button" className={`${btn} text-slate-300 hover:bg-slate-800`} onClick={onDone}>Close without saving</button>
          </div>
        </>
      ) : (
        <>
          {!demo && <p className="text-slate-300">Sign in to keep your flights and their times in My flights.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-slate-700 hover:bg-slate-600`} onClick={onKeepFlying}>Keep flying</button>
            <button type="button" className={`${btn} text-slate-300 hover:bg-slate-800`} onClick={onDone}>Close</button>
          </div>
        </>
      )}
      {debrief && (
        <DebriefPack name={name.trim() || defaultName} points={points} times={times} planned={planned} demo={demo} onClose={() => setDebrief(false)}
          onExit={exitFlight}
          exitNote={signedIn && saved == null ? 'Saves the flight to My flights and closes navigation mode.'
            : saved != null ? 'Closes navigation mode.' : demo ? 'Closes navigation mode (a demo flight isn\'t saved).'
              : 'Closes navigation mode. Sign in to keep your flights.'}/>
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
