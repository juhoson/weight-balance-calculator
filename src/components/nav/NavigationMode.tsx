import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Radio, TriangleAlert, X } from 'lucide-react';
import { AIRSPACE_TILE_URL, fetchAirportsAlong, fetchMapStatus } from '../../api/backend';
import type { AirportInfo, AirspaceView, RouteWeather } from '../../types/route';
import type { RouteReportingPoint } from '../../lib/useRouteWeather';
import { type SwedenControlLeg, swedenControlAt, swedenControlText } from '../../lib/swedenControl';
import { contactFrequencies, frequencyText } from '../../lib/frequencies';
import { adviceFor, crossingsAlong } from '../../lib/airspace';
import { routeLabels } from '../../lib/routePoint';
import type { RoutePosition } from '../../lib/openMeteo';
import { GENERIC_EMERGENCY_CHECKLIST, MAYDAY_CALL } from '../../lib/emergencyChecklist';
import {
  activeLeg, airspacesHere, ARRIVAL_MARGIN_FT, bearingDistance, DEFAULT_GLIDE_RATIO, eteText, type Fix, fixFrom,
  glideRangeNm, nearestAirfields, pad3, positionAlong,
} from '../../lib/navigation';

export interface NavigationModeProps {
  trip: RouteWeather;
  airspaces: AirspaceView[] | null;
  reportingPoints: RouteReportingPoint[];
  swedenControl: SwedenControlLeg[];
  /** The aircraft's best glide speed, if known. */
  bestGlideKt: number | null;
  /** For the demo flight. */
  cruiseKt: number;
  cruiseAltFt: number;
  onClose: () => void;
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const OPENAIP_CREDIT = 'airspace &copy; <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a>';
const ROUTE_COLOR = '#d946ef';
/** The demo flight runs this many times faster than real time. */
const DEMO_SPEEDUP = 4;
const RATIO_KEY = 'nav.glideRatio';

const ft = (n: number) => Math.round(n).toLocaleString('en');
const nmText = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

/** Keeps the screen on while the mode is open (where the browser can). */
function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
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
  trip, airspaces, reportingPoints, swedenControl, bestGlideKt, cruiseKt, cruiseAltFt, onClose,
}) => {
  const route = React.useMemo(() => [trip.departure, ...(trip.waypoints ?? []), trip.arrival], [trip]);
  const labels = React.useMemo(() => routeLabels(route.map(a => a.code)), [route]);
  const [started, setStarted] = React.useState<null | 'gps' | 'demo'>(null);
  const [fix, setFix] = React.useState<Fix | null>(null);
  const [gpsError, setGpsError] = React.useState<string | null>(null);
  const [follow, setFollow] = React.useState(true);
  const [sheet, setSheet] = React.useState<null | 'freq' | 'emergency'>(null);
  const [directTo, setDirectTo] = React.useState<AirportInfo | null>(null);
  const [airfields, setAirfields] = React.useState<AirportInfo[]>(route.filter(a => a.type !== 'point'));
  const [airfieldsState, setAirfieldsState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [ratio, setRatio] = useGlideRatio();
  useWakeLock(started !== null);

  // Escape closes; the page doesn't scroll underneath.
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (sheet) setSheet(null); else onClose(); } };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; };
  }, [sheet, onClose]);

  // Every airfield along the route, kept for the emergency list.
  React.useEffect(() => {
    let live = true;
    Promise.resolve().then(() => fetchAirportsAlong(route, 25))
      .then(list => { if (live && list?.length) { setAirfields(list); setAirfieldsState('ok'); } else if (live) setAirfieldsState('error'); })
      .catch(() => { if (live) setAirfieldsState('error'); });
    return () => { live = false; };
  }, [route]);

  // The GPS.
  React.useEffect(() => {
    if (started !== 'gps') return;
    if (!navigator.geolocation) { setGpsError('This browser has no location service.'); return; }
    const id = navigator.geolocation.watchPosition(
      p => { setGpsError(null); setFix(prev => fixFrom(p.coords, p.timestamp || Date.now(), prev)); },
      e => setGpsError(e.code === e.PERMISSION_DENIED
        ? 'Location is blocked for this site: allow it in the browser settings.'
        : 'No GPS position yet.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [started]);

  // The demo flight: along the route at the cruise speed, climbing at 500 ft/min.
  React.useEffect(() => {
    if (started !== 'demo') return;
    const kt = cruiseKt > 40 ? cruiseKt : 100;
    const groundFt = trip.departure.elevationFt ?? 0;
    const t0 = Date.now();
    const tick = () => {
      const hours = ((Date.now() - t0) / 3_600_000) * DEMO_SPEEDUP;
      const p = positionAlong(route, hours * kt);
      setFix({
        lat: p.lat, lon: p.lon, speedKt: p.done ? 0 : kt, trackDeg: p.trackDeg,
        altFt: Math.min(Math.max(cruiseAltFt, groundFt + 1000), groundFt + hours * 60 * 500), accuracyM: 5, at: Date.now(),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [started, route, cruiseKt, cruiseAltFt, trip.departure.elevationFt]);

  // The map.
  const container = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const own = React.useRef<{ marker: L.Marker; glide: L.Circle; direct: L.Polyline } | null>(null);
  React.useEffect(() => {
    if (!started || !container.current) return;
    const map = L.map(container.current, { zoomSnap: 0.5, minZoom: 5, maxZoom: 13, attributionControl: false, zoomControl: false });
    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_CREDIT, className: 'basemap-tiles' }).addTo(map);
    let live = true;
    fetchMapStatus().then(s => {
      if (live && s?.airspace) {
        L.tileLayer(AIRSPACE_TILE_URL, { minZoom: s.minZoom, maxNativeZoom: s.maxZoom, maxZoom: 19, attribution: OPENAIP_CREDIT }).addTo(map);
      }
    }, () => undefined);
    const pts = route.map(a => L.latLng(a.lat, a.lon));
    L.polyline(pts, { color: '#ffffff', weight: 7, opacity: 0.8, interactive: false }).addTo(map);
    L.polyline(pts, { color: ROUTE_COLOR, weight: 4, interactive: false }).addTo(map);
    route.forEach((a, i) => L.circleMarker([a.lat, a.lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1 })
      .bindTooltip(labels[i], { permanent: true, direction: 'right', offset: [8, 0], className: 'route-map-label' }).addTo(map));
    reportingPoints.forEach(p => L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: p.compulsory ? 'vrp-marker vrp-marker--compulsory' : 'vrp-marker', iconSize: [12, 11] }),
      keyboard: false, interactive: false,
    }).bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -4], className: 'route-map-label vrp-label' }).addTo(map));
    const glide = L.circle(pts[0], { radius: 0, color: '#16a34a', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
    const direct = L.polyline([], { color: '#dc2626', weight: 4, dashArray: '10 8', interactive: false }).addTo(map);
    const marker = L.marker(pts[0], {
      icon: L.divIcon({ className: 'nav-ownship', iconSize: [36, 36], html: '<svg viewBox="0 0 36 36" width="36" height="36"><path d="M18 2 L30 32 L18 25 L6 32 Z" fill="#0f172a" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/></svg>' }),
      keyboard: false, interactive: false, zIndexOffset: 1000,
    }).addTo(map);
    own.current = { marker, glide, direct };
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 10 });
    map.on('dragstart', () => setFollow(false));
    mapRef.current = map;
    return () => { live = false; map.remove(); mapRef.current = null; own.current = null; };
  }, [started, route, labels, reportingPoints]);

  // Where everything is now.
  const leg = fix ? activeLeg(route, fix) : null;
  const target = directTo ?? (leg ? route[leg.index + 1] : route[route.length - 1]);
  const targetLabel = directTo ? directTo.code : leg ? labels[leg.index + 1] : labels[labels.length - 1];
  const toTarget = fix ? bearingDistance(fix, target) : null;
  const here = fix && airspaces ? airspacesHere(airspaces, fix, fix.altFt) : null;
  const sweden = fix ? swedenControlAt(fix.lat, fix.lon) : null;
  const nearest = React.useMemo(() => (fix ? nearestAirfields(airfields, fix, fix.altFt, ratio, 8) : []), [fix, airfields, ratio]);
  const groundFt = nearest[0]?.airport.elevationFt ?? null;
  const glideNm = fix?.altFt != null && groundFt != null ? glideRangeNm(fix.altFt - groundFt, ratio) : null;

  React.useEffect(() => {
    const map = mapRef.current, o = own.current;
    if (!map || !o || !fix) return;
    const at = L.latLng(fix.lat, fix.lon);
    o.marker.setLatLng(at);
    const svg = o.marker.getElement()?.querySelector('svg');
    if (svg) {
      svg.style.transform = `rotate(${fix.trackDeg ?? 0}deg)`;
      svg.style.opacity = fix.trackDeg == null ? '0.6' : '1';
    }
    o.glide.setLatLng(at).setRadius((glideNm ?? 0) * 1852);
    o.direct.setLatLngs(directTo ? [at, [directTo.lat, directTo.lon]] : []);
    if (follow) map.panTo(at, { animate: true });
  }, [fix, glideNm, directTo, follow]);

  const recenter = () => {
    setFollow(true);
    if (fix && mapRef.current) mapRef.current.panTo([fix.lat, fix.lon]);
  };

  if (!started) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/95 p-4 text-slate-100" role="dialog" aria-modal="true" aria-label="Navigation mode">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-semibold">Navigation mode <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-slate-950">EXPERIMENTAL</span></h2>
          <p className="text-sm">
            The map full screen with your GPS speed, track and altitude, the airspace you&apos;re in, the frequencies along the
            route, and an emergency page with the nearest airfields.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li><strong className="text-slate-100">For situational awareness only, not for navigation.</strong> Fly by the official charts and your instruments.</li>
            <li>Altitude is GPS altitude, not pressure altitude: it can be 100 ft or more off.</li>
            <li>Keep the app in front with the screen on: the browser stops the GPS when it&apos;s hidden.</li>
            <li>Needs a connection for the map for now.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
              onClick={() => { setStarted('gps'); document.documentElement.requestFullscreen?.().catch(() => undefined); }}>
              Start with GPS
            </button>
            <button type="button" className="rounded-md border border-slate-500 px-4 py-2 hover:bg-slate-800" onClick={() => setStarted('demo')}>
              Demo flight
            </button>
            <button type="button" className="rounded-md px-4 py-2 text-slate-300 hover:bg-slate-800" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    onClose();
  };
  const cell = 'flex flex-col items-center justify-center px-1 py-1';
  const big = 'text-xl font-bold tabular-nums leading-tight sm:text-2xl';
  const small = 'text-[10px] uppercase tracking-wide text-slate-400';
  const inside = here?.inside ?? [];
  const severityClass = (a: AirspaceView) => ({
    prohibited: 'bg-red-700', restricted: 'bg-orange-600', clearance: 'bg-blue-700', contact: 'bg-amber-600', info: 'bg-slate-700',
  }[adviceFor(a).severity]);

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-slate-950 text-slate-100" role="dialog" aria-modal="true" aria-label="Navigation mode">
      {/* Speed, track, altitude and where to. */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1.6fr_auto] divide-x divide-slate-700 border-b border-slate-700">
        <div className={cell}><span className={small}>GS kt</span><span className={big}>{fix?.speedKt != null ? Math.round(fix.speedKt) : '-'}</span></div>
        <div className={cell}><span className={small}>TRK °T</span><span className={big}>{fix?.trackDeg != null ? pad3(fix.trackDeg) : '-'}</span></div>
        <div className={cell}><span className={small}>GPS alt ft</span><span className={big}>{fix?.altFt != null ? ft(fix.altFt) : '-'}</span></div>
        <div className={`${cell} ${directTo ? 'bg-red-900' : ''}`}>
          <span className={small}>{directTo ? 'Direct to' : 'Next'} {targetLabel}</span>
          <span className={big}>{toTarget ? `${nmText(toTarget.nm)} NM` : '-'}</span>
          <span className="text-xs tabular-nums text-slate-300">
            {toTarget ? `${pad3(toTarget.deg)}° · ${eteText(toTarget.nm, fix?.speedKt ?? null)}` : ''}
          </span>
        </div>
        <button type="button" aria-label="Close navigation mode" className="px-3 hover:bg-slate-800" onClick={close}><X className="h-5 w-5"/></button>
      </div>

      {/* The airspace here. */}
      <div className="space-y-px text-sm" role="status" aria-label="Airspace here">
        {!fix ? (
          <div className="bg-slate-800 px-3 py-1.5">{gpsError ?? (started === 'demo' ? 'Starting the demo…' : 'Waiting for GPS…')}</div>
        ) : airspaces == null ? (
          <div className="bg-slate-800 px-3 py-1.5">Airspace not loaded.</div>
        ) : inside.length ? inside.map(a => {
          const f = contactFrequencies(a.frequencies)[0];
          return (
            <div key={a.id} className={`${severityClass(a)} flex flex-wrap items-baseline gap-x-2 px-3 py-1.5`}>
              <strong>{a.name}</strong>
              <span>{a.icaoClass ? `class ${a.icaoClass}` : a.type} · {a.lower.label}–{a.upper.label}</span>
              {f && <span className="ml-auto font-semibold tabular-nums">{frequencyText(f)}</span>}
            </div>
          );
        }) : (
          <div className="flex flex-wrap items-baseline gap-x-2 bg-emerald-800 px-3 py-1.5">
            <strong>Uncontrolled (class G)</strong>
            {sweden && <span className="ml-auto font-semibold tabular-nums">{swedenControlText(sweden.sector)}</span>}
          </div>
        )}
        {fix && here && here.above.length > 0 && (
          <div className="bg-slate-800 px-3 py-1 text-xs text-slate-300">
            Above: {here.above.slice(0, 2).map(a => `${a.name} from ${a.lower.label}`).join(' · ')}
          </div>
        )}
      </div>

      <div className="relative flex-1">
        <div ref={container} className="route-map absolute inset-0" aria-label="Navigation map"/>
        <div className="pointer-events-none absolute left-2 top-2 z-[1000] flex flex-col gap-1 text-xs">
          <span className="rounded bg-amber-500 px-1.5 py-0.5 font-bold text-slate-950">EXPERIMENTAL · not for navigation</span>
          {started === 'demo' && <span className="rounded bg-sky-600 px-1.5 py-0.5 font-semibold text-white">DEMO FLIGHT ({DEMO_SPEEDUP}× speed)</span>}
          {fix?.accuracyM != null && fix.accuracyM > 50 && <span className="rounded bg-red-700 px-1.5 py-0.5 text-white">GPS ±{Math.round(fix.accuracyM)} m</span>}
        </div>
        {!follow && fix && (
          <button type="button" onClick={recenter} className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-sm shadow-lg">
            <Crosshair className="h-4 w-4"/> Centre
          </button>
        )}
        {sheet === 'freq' && (
          <Sheet title="Frequencies" onClose={() => setSheet(null)}>
            <FrequencyList route={route} airspaces={airspaces} swedenControl={swedenControl} alongNm={leg?.alongNm ?? null}/>
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
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-700 p-2">
        <button type="button" className="flex items-center justify-center gap-2 rounded-md bg-slate-800 py-3 font-semibold hover:bg-slate-700"
          onClick={() => setSheet(sheet === 'freq' ? null : 'freq')}>
          <Radio className="h-5 w-5"/> Frequencies
        </button>
        <button type="button" className="rounded-md bg-slate-800 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
          disabled={!directTo} onClick={() => setDirectTo(null)}>
          {directTo ? 'Back to route' : 'On route'}
        </button>
        <button type="button" className="flex items-center justify-center gap-2 rounded-md bg-red-700 py-3 font-bold hover:bg-red-600"
          onClick={() => setSheet(sheet === 'emergency' ? null : 'emergency')}>
          <TriangleAlert className="h-5 w-5"/> EMERGENCY
        </button>
      </div>
    </div>
  );
};

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** "south-west": where the aircraft is from the airfield. */
const compass = (deg: number) => POINTS[Math.round(deg / 45) % 8];

const Sheet: React.FC<{ title: string; tone?: 'red'; onClose: () => void; children: React.ReactNode }> = ({ title, tone, onClose, children }) => (
  <div className={`absolute inset-x-0 bottom-0 z-[1100] max-h-[75%] overflow-y-auto rounded-t-lg border-t-4 bg-slate-900 p-3 shadow-2xl ${tone === 'red' ? 'border-red-600' : 'border-slate-500'}`}
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
