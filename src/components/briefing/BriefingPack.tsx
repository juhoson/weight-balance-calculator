import React from 'react';
import type { AltitudeHold, RoutePlan } from '../../lib/enroute';
import { warningsOf } from '../../lib/enroute';
import type { AirspaceCheck } from '../../lib/airspace';
import { adviceFor } from '../../lib/airspace';
import { contactFrequencies, frequencyText } from '../../lib/frequencies';
import { decodeMetar, summarise } from '../../lib/metarTaf';
import { swedenControlText, type SwedenControlLeg } from '../../lib/swedenControl';
import { EMERGENCY_REMINDER, GENERIC_EMERGENCY_CHECKLIST, MAYDAY_CALL } from '../../lib/emergencyChecklist';
import type { AerodromeInfo, Frequency, RouteWeather } from '../../types/route';
import type { CalculationSummary } from '../ResultsPanel';
import { VERDICT_TEXT, verdictOf } from '../ResultsPanel';
import RouteProfileChart from '../route/RouteProfileChart';
import { NavLog } from '../route/EnroutePanel';
import { lazyWithReload } from '../../lib/lazyWithReload';

// Leaflet loads only for a pack with maps.
const AirfieldMaps = lazyWithReload(() => import('./BriefingMaps').then(m => ({ default: m.AirfieldMaps })));
const RouteChart = lazyWithReload(() => import('./BriefingMaps').then(m => ({ default: m.RouteChart })));

export type BriefingSection = 'overview' | 'airfields' | 'enroute' | 'weather' | 'emergency';

export const BRIEFING_SECTIONS: Array<{ id: BriefingSection; label: string; detail: string }> = [
  { id: 'overview', label: 'Overview', detail: 'Route, legs, times, fuel, weight and balance, the profile and the nav log' },
  { id: 'airfields', label: 'Departure and arrival', detail: 'One page: both aerodromes on maps with their reporting points and circuits, the frequencies, and boxes for the block times and tacho' },
  { id: 'enroute', label: 'En-route chart', detail: 'The whole route on a page of its own, with airspace' },
  { id: 'weather', label: 'Weather briefing', detail: 'METAR and TAF along the route, decoded, and the en-route forecast' },
  { id: 'emergency', label: 'Emergency checklist', detail: 'A page of its own: generic single-engine piston memory items and the MAYDAY call' },
];

export interface AirportFrequencies {
  code: string;
  name: string;
  frequencies: Frequency[];
}

export interface BriefingData {
  /** "ESSX → WP1 → ESGG". */
  routeName: string;
  aircraftName: string;
  departure: Date;
  trip: RouteWeather;
  plan: Extract<RoutePlan, { ok: true }> | null;
  altitudeFt: number;
  holds: AltitudeHold[];
  tasKt: number;
  powerSetting: string;
  flightMinutes: number;
  fuel: { onBoardL: number; tripL: number; landingL: number } | null;
  wb: CalculationSummary | null;
  airspaces: AirspaceCheck[];
  swedenControl: SwedenControlLeg[];
  speeds: { glide?: number; vy: number; approach: number; stallLanding: number; unit: string } | null;
  /** Null while being looked up. */
  airportFrequencies: AirportFrequencies[] | null;
  /** The departure's and arrival's circuits and reporting points by code; null while being looked up. */
  aerodromes: Record<string, AerodromeInfo> | null;
}

/** Enough to call: the ATIS and three more for an airport, one or two for an airspace. */
const MAX_AIRPORT_FREQUENCIES = 3;
const MAX_AIRSPACE_FREQUENCIES = 2;
/** The departure and arrival page lists this many airspaces and Sweden Control sectors, then says how many more. */
const MAX_AIRSPACES = 8;
const MAX_SECTORS = 4;
/** A4 less the 12 mm margins (273 mm at 96 px to the inch), less the section's top margin and a little to spare. */
const PAGE_HEIGHT_PX = Math.floor((273 * 96) / 25.4) - 20 - 16;
/** The pack's heading, on the first page. */
const HEADER_PX = 75;

/** How much to shrink something this tall to fit; never below 75%, so it stays readable. */
export function fitScale(heightPx: number, availablePx: number, min = 0.75): number {
  return heightPx <= availablePx || heightPx <= 0 ? 1 : Math.max(min, Math.floor((availablePx / heightPx) * 1000) / 1000);
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');
const hm = (m: number) => `${Math.floor(Math.round(m) / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) % 360).padStart(3, '0');
const utc = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
const ROLE: Record<string, string> = { DEPARTURE: 'Departure', WAYPOINT: 'Waypoint', ENROUTE: 'En route', ARRIVAL: 'Arrival' };

const Section: React.FC<{ title: string; children: React.ReactNode; boxed?: boolean; page?: boolean }> = ({ title, children, boxed, page }) => (
  <section className={boxed ? 'mt-4 break-inside-avoid rounded border-2 border-black p-3' : 'mt-5'} style={page ? { breakBefore: 'page' } : undefined}>
    <h2 className="mb-2 border-b border-black pb-0.5 text-[13pt] font-bold">{title}</h2>
    {children}
  </section>
);

/** The printed pack: only the sections asked for, in black on white. */
const BriefingPack: React.FC<{ data: BriefingData; sections: BriefingSection[] }> = ({ data, sections }) => {
  const has = (s: BriefingSection) => sections.includes(s);
  return (
    <article className="bg-white p-0 text-[9.5pt] leading-snug text-black" aria-label="Briefing pack">
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-1">
        <div>
          <h1 className="text-[16pt] font-bold">Flight briefing: {data.routeName}</h1>
          <p>
            {data.aircraftName} · departure {data.departure.toISOString().slice(0, 10)} {utc(data.departure)}
            {' '}({data.departure.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local)
          </p>
        </div>
        <p className="text-right text-[8pt]">Prepared {new Date().toISOString().slice(0, 16).replace('T', ' ')}Z<br/>flightplanningtool.com</p>
      </header>
      {has('overview') && <Overview data={data}/>}
      {has('airfields') && <Airfields data={data} page={has('overview')}/>}
      {has('enroute') && (
        <Section title="En-route chart" page={has('overview') || has('airfields')}>
          <React.Suspense fallback={<div data-map-ready="false">Loading the map…</div>}>
            <RouteChart points={pointsOf(data)}/>
          </React.Suspense>
        </Section>
      )}
      {has('weather') && <Weather data={data} page={has('enroute')}/>}
      {has('emergency') && <Emergency data={data} page={sections.some(x => x !== 'emergency')}/>}
      <p className="mt-4 text-[7.5pt]">
        For planning only. Weather is from aviationweather.gov and a model forecast (Open-Meteo), airspace from openAIP: get an
        official briefing, check the AIP, NOTAMs and the charts before flight. Verify weight and balance against the aircraft&apos;s POH.
      </p>
    </article>
  );
};

const pointsOf = (data: BriefingData) =>
  [data.trip.departure, ...(data.trip.waypoints ?? []), data.trip.arrival].map(a => ({ code: a.code, lat: a.lat, lon: a.lon }));

/** One page for the two ends of the flight: maps, circuits, frequencies and the times to fill in. */
const Airfields: React.FC<{ data: BriefingData; page: boolean }> = ({ data, page }) => {
  const local = data.trip.distanceNm === 0;
  const ends = local ? [data.trip.departure] : [data.trip.departure, data.trip.arrival];
  const vrps: Record<string, AerodromeInfo['reportingPoints']> = {};
  ends.forEach(a => { vrps[a.code] = data.aerodromes?.[a.code]?.reportingPoints ?? []; });
  const eta = new Date(data.departure.getTime() + data.flightMinutes * 60_000);
  // Laid out at A4 width before printing: measured, and scaled down if it would run onto a second page.
  const inner = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState<{ scale: number; height: number }>({ scale: 1, height: 0 });
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      const scale = fitScale(h, PAGE_HEIGHT_PX - (page ? 0 : HEADER_PX));
      setFit(f => (f.scale === scale && f.height === h ? f : { scale, height: h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page]);
  return (
    <section className="mt-5" style={{ ...(page ? { breakBefore: 'page' as const } : {}), breakInside: 'avoid',
      ...(fit.scale < 1 ? { height: fit.height * fit.scale, overflow: 'hidden' } : {}) }} data-fit-scale={fit.scale}>
      <div ref={inner} style={fit.scale < 1 ? { transform: `scale(${fit.scale})`, transformOrigin: 'top left', width: `${100 / fit.scale}%` } : undefined}>
        <h2 className="mb-2 border-b border-black pb-0.5 text-[13pt] font-bold">Departure and arrival</h2>
        <React.Suspense fallback={<div data-map-ready="false">Loading the maps…</div>}>
          <AirfieldMaps points={pointsOf(data)} local={local} vrps={vrps}/>
        </React.Suspense>
        <div className={`mt-1 grid gap-2 ${local ? '' : 'grid-cols-2'}`}>
          {ends.map(a => <AerodromeNotes key={a.code} code={a.code} info={data.aerodromes?.[a.code]} loading={data.aerodromes === null}/>)}
        </div>
        <Frequencies data={data}/>
        <section className="mt-3 break-inside-avoid rounded border-2 border-black p-2" aria-label="Times">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="w-1/4 pr-2"/><th className="w-1/4 pr-2">Planned (UTC)</th><th className="w-1/4 pr-2">Actual</th><th>Tacho</th>
              </tr>
            </thead>
            <tbody>
              {([['Off block', '', 'Start'], ['Takeoff', utc(data.departure), ''], ['Landing', utc(eta), ''], ['On block', '', 'End']] as const).map(([what, planned, tacho]) => (
                <tr key={what} className="h-7 border-b border-black/40">
                  <td className="pr-2 font-semibold">{what}</td>
                  <td className="pr-2">{planned}</td>
                  <td className="border-l border-black/40"/>
                  <td className="border-l border-black/40 pl-1 text-[8pt]">{tacho}</td>
                </tr>
              ))}
              <tr className="h-7">
                <td className="pr-2 font-semibold">Block time</td><td className="pr-2">{hm(data.flightMinutes)} flight</td>
                <td className="border-l border-black/40"/><td className="border-l border-black/40 pl-1 text-[8pt]">Total</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
};

/** The circuit direction (where openAIP has it) and the reporting points of an aerodrome. */
const AerodromeNotes: React.FC<{ code: string; info?: AerodromeInfo; loading: boolean }> = ({ code, info, loading }) => {
  const known = (info?.circuits ?? []).filter(c => c.direction);
  const vrps = info?.reportingPoints ?? [];
  return (
    <div>
      <p className="font-semibold">{code}</p>
      {loading ? <p>Looking up…</p> : (
        <>
          <p>
            <strong>Circuit:</strong>{' '}
            {known.length
              ? known.map(c => `RWY ${c.runway} ${c.direction === 'LEFT' ? 'left' : 'right'}-hand`).join(', ')
              : <>not in the data: left-hand unless the AIP/VAC says otherwise. RWY ____ L / R</>}
          </p>
          <p>
            <strong>Reporting points:</strong>{' '}
            {vrps.length
              ? vrps.map(p => (p.compulsory ? `${p.name} (compulsory)` : p.name)).join(', ')
              : 'none in the data'}
          </p>
        </>
      )}
    </div>
  );
};

const Overview: React.FC<{ data: BriefingData }> = ({ data }) => {
  const { trip, plan, wb, fuel } = data;
  const legs = plan ? plan.legs.map(l => ({ ...l.leg, minutes: l.minutes, mc: l.segments[0]?.magneticCourse ?? null,
    alt: l.segments[Math.floor(l.segments.length / 2)]?.altitudeFt ?? data.altitudeFt }))
    : (trip.legs ?? []).map(l => ({ ...l, minutes: (l.distanceNm / data.tasKt) * 60, mc: null, alt: data.altitudeFt }));
  const eta = new Date(data.departure.getTime() + data.flightMinutes * 60_000);
  return (
    <Section title="Overview">
      <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
        <p><strong>Distance</strong> {fmt(trip.distanceNm)} NM</p>
        <p><strong>Flight time</strong> {hm(data.flightMinutes)}{plan ? ' (forecast wind)' : ' (no wind)'}</p>
        <p><strong>Departure → ETA</strong> {utc(data.departure)} → {utc(eta)}</p>
        <p><strong>Cruise</strong> {fmt(data.altitudeFt)} ft{data.holds.length ? `, ${data.holds.length} altitude change${data.holds.length === 1 ? '' : 's'}` : ''}</p>
        <p><strong>TAS</strong> {data.tasKt} kt at {data.powerSetting}</p>
        {fuel && <p><strong>Fuel</strong> {fmt(fuel.onBoardL)} L on board, trip {fmt(fuel.tripL)} L, landing {fmt(fuel.landingL)} L</p>}
      </div>
      {data.holds.length > 0 && (
        <p className="mt-1">Altitude changes: {data.holds.map(h => `${fmt(h.ft)} ft ${Math.round(h.fromNm)}–${Math.round(h.toNm)} NM${h.note ? ` (${h.note})` : ''}`).join('; ')}</p>
      )}
      <table className="mt-2 w-full border-collapse tabular-nums">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="pr-2">Leg</th><th className="pr-2">NM</th><th className="pr-2">TC</th><th className="pr-2">MC</th>
            <th className="pr-2">Alt</th><th className="pr-2">Time</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={i} className="border-b border-black/30">
              <td className="pr-2 font-semibold">{l.from} → {l.to}</td>
              <td className="pr-2">{l.distanceNm.toFixed(0)}</td>
              <td className="pr-2">{pad3(l.trueCourseDeg)}°</td>
              <td className="pr-2">{l.mc === null ? '–' : `${pad3(l.mc)}°`}</td>
              <td className="pr-2">{fmt(l.alt)}</td>
              <td className="pr-2">{hm(l.minutes)}</td>
              <td className="w-1/3"/>
            </tr>
          ))}
        </tbody>
      </table>
      {wb && (
        <div className="mt-2 grid grid-cols-2 gap-4 break-inside-avoid">
          {([['Take-off', wb.takeoff], ['Landing', wb.landing]] as const).map(([name, r]) => (
            <p key={name}><strong>{name}</strong> {r.totalWeight.toFixed(1)} kg, CG {r.cg.toFixed(3)} m: {r.isWithinLimits ? 'within limits' : 'OUTSIDE LIMITS'}
              {r.problems?.length ? ` (${r.problems.join(' ')})` : ''}</p>
          ))}
          <p className="col-span-2 font-semibold">{VERDICT_TEXT[verdictOf(wb)].title}: {VERDICT_TEXT[verdictOf(wb)].detail}</p>
        </div>
      )}
      {plan && (
        <div className="mt-3 break-inside-avoid">
          <RouteProfileChart legs={plan.legs} altitudeFt={data.altitudeFt} profile={plan.profile} airspaces={data.airspaces}/>
        </div>
      )}
      {plan && (
        <div className="mt-2">
          <NavLog plan={plan}/>
        </div>
      )}
    </Section>
  );
};

const Weather: React.FC<{ data: BriefingData; page: boolean }> = ({ data, page }) => {
  const { trip, plan } = data;
  const w = plan ? warningsOf(plan.segments, data.altitudeFt) : null;
  return (
    <Section title="Weather briefing" page={page}>
      {!trip.weatherAvailable && <p>The weather service could not be reached when this was prepared.</p>}
      <div className="space-y-1.5">
        {trip.points.map((p, i) => (
          <div key={i} className="break-inside-avoid border-b border-black/30 pb-1">
            <p className="font-semibold">
              {ROLE[p.role]}{p.airportCode ? ` ${p.airportCode}` : ''}{p.role !== 'DEPARTURE' ? ` · ${Math.round(p.alongTrackNm)} NM` : ''}
              {p.station ? ` · ${p.station.code} ${p.station.name.trim()}${p.station.distanceNm > 0 ? ` (${p.station.distanceNm} NM away)` : ''}` : ''}
              {p.metar?.flightCategory ? ` · ${p.metar.flightCategory}` : ''}
            </p>
            {p.metar
              ? <>
                <p className="font-mono text-[8.5pt]">{p.metar.raw}</p>
                <p>{summarise(decodeMetar(p.metar.raw)).join('. ')}.</p>
              </>
              : <p>No current report.</p>}
            {p.taf && <p className="font-mono text-[8.5pt]">{p.taf.raw}</p>}
          </div>
        ))}
      </div>
      {plan && w && (
        <div className="mt-2 break-inside-avoid">
          <h3 className="font-semibold">En-route forecast (model)</h3>
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="pr-2">Leg</th><th className="pr-2">Wind component</th><th className="pr-2">Lowest cloud base</th><th>Lowest 0 °C level</th>
              </tr>
            </thead>
            <tbody>
              {plan.legs.map((l, i) => {
                const nm = l.segments.reduce((s, x) => s + x.segment.distanceNm, 0) || 1;
                const comp = l.segments.reduce((s, x) => s + (x.triangle.groundSpeedKt - x.tasKt) * x.segment.distanceNm, 0) / nm;
                const bases = l.segments.map(s => s.cloudBaseFt).filter((b): b is number => b !== null);
                const fz = l.segments.map(s => s.freezingLevelFt).filter((b): b is number => b !== null);
                return (
                  <tr key={i} className="border-b border-black/30">
                    <td className="pr-2 font-semibold">{l.leg.from} → {l.leg.to}</td>
                    <td className="pr-2">{Math.round(comp) === 0 ? 'none' : comp > 0 ? `tailwind ${Math.round(comp)} kt` : `headwind ${Math.round(-comp)} kt`}</td>
                    <td className="pr-2">{bases.length ? `≈ ${fmt(Math.min(...bases))} ft` : 'none (no broken layer)'}</td>
                    <td>{fz.length ? `≈ ${fmt(Math.min(...fz))} ft` : 'above 18,000 ft'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="mt-1 list-disc pl-4">
            {w.nearCloud.length > 0 && <li>Cloud base below or within 500 ft of the altitude flown on {w.nearCloud.length} of {plan.segments.length} segments (lowest ≈ {fmt(w.lowestBaseFt ?? 0)} ft).</li>}
            {w.icing.length > 0 && <li>Icing possible: in cloud above the freezing level on {w.icing.length} segments.</li>}
            {w.lowTerrain.length > 0 && <li>Less than 1,000 ft above the (averaged) terrain on {w.lowTerrain.length} segments.</li>}
            {!w.nearCloud.length && !w.icing.length && !w.lowTerrain.length && <li>No cloud, icing or terrain warnings at the altitudes planned.</li>}
          </ul>
        </div>
      )}
    </Section>
  );
};

const Frequencies: React.FC<{ data: BriefingData }> = ({ data }) => {
  // Each airspace once (a TMA comes in several sectors), with its one or two frequencies.
  const along = data.airspaces
    .filter(c => (c.status === 'inside' || c.status === 'close') && adviceFor(c.airspace).severity !== 'info')
    .sort((a, b) => a.fromNm - b.fromNm)
    .filter((c, i, all) => all.findIndex(o => o.airspace.name === c.airspace.name) === i);
  // The departure and arrival in full; airports on the way in one line.
  const ends = [data.trip.departure.code, data.trip.arrival.code];
  const via = (data.airportFrequencies ?? []).filter(a => !ends.includes(a.code));
  return (
    <Section title="Frequencies" boxed>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <h3 className="font-semibold">Airports</h3>
          {data.airportFrequencies === null
            ? <p>Looking up…</p>
            : data.airportFrequencies.filter(a => ends.includes(a.code)).map(a => (
              <div key={a.code} className="mb-1">
                <p className="font-semibold">{a.code} {a.name}</p>
                {a.frequencies.length
                  ? [...a.frequencies.filter(f => f.kind === 'ATIS').slice(0, 1), ...contactFrequencies(a.frequencies).slice(0, MAX_AIRPORT_FREQUENCIES)]
                    .map((f, i) => <p key={i} className="tabular-nums">{frequencyText(f)}</p>)
                  : <p>No frequency listed</p>}
              </div>
            ))}
          {via.length > 0 && (
            <p><strong>On the way:</strong> {via.map(a => `${a.code} ${contactFrequencies(a.frequencies)[0]?.value ?? '–'}`).join(' · ')}</p>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Emergency</h3>
          <p className="tabular-nums"><strong>121.500</strong> distress and urgency</p>
          <p className="tabular-nums">Squawk <strong>7700</strong> emergency · <strong>7600</strong> radio failure · <strong>7500</strong> unlawful interference</p>
          {data.swedenControl.length > 0 && (
            <>
              <h3 className="mt-2 font-semibold">Sweden Control (class G, flight information)</h3>
              {data.swedenControl.slice(0, MAX_SECTORS).map((s, i) => (
                <p key={i} className="tabular-nums">{Math.round(s.fromNm)}–{Math.round(s.toNm)} NM: {swedenControlText(s.sector)} ({s.sector.sector})</p>
              ))}
              {data.swedenControl.length > MAX_SECTORS && <p>and {data.swedenControl.length - MAX_SECTORS} more further on</p>}
            </>
          )}
        </div>
      </div>
      {along.length > 0 && (
        <div className="mt-2">
          <h3 className="font-semibold">Airspace along the route</h3>
          <table className="w-full border-collapse tabular-nums">
            <tbody>
              {along.slice(0, MAX_AIRSPACES).map((c, i) => (
                <tr key={i} className="border-b border-black/30 align-top">
                  <td className="whitespace-nowrap pr-2">{Math.round(c.fromNm)}–{Math.round(c.toNm)} NM</td>
                  <td className="pr-2 font-semibold">{c.airspace.name}{c.airspace.icaoClass ? ` (${c.airspace.icaoClass})` : ''}</td>
                  <td className="whitespace-nowrap pr-2">{c.airspace.lower.label} – {c.airspace.upper.label}</td>
                  <td>{contactFrequencies(c.airspace.frequencies).slice(0, MAX_AIRSPACE_FREQUENCIES).map(frequencyText).join(', ') || adviceFor(c.airspace).label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {along.length > MAX_AIRSPACES && <p>and {along.length - MAX_AIRSPACES} more further on: see the airspace list in the app.</p>}
        </div>
      )}
      <div className="mt-2 grid grid-cols-4 gap-2 text-[8pt]">
        {['Clearance', 'ATIS', 'QNH', 'Notes'].map(l => <p key={l} className="h-7 border border-black/50 px-1">{l}</p>)}
      </div>
    </Section>
  );
};

const Emergency: React.FC<{ data: BriefingData; page: boolean }> = ({ data, page }) => {
  const s = data.speeds;
  const u = s?.unit === 'MPH' ? 'mph' : 'kt';
  return (
    <Section title="Emergency checklist" boxed page={page}>
      <p className="mb-2 text-center text-[13pt] font-bold tracking-wide">{EMERGENCY_REMINDER.toUpperCase()}</p>
      <p className="mb-2 text-center font-semibold">
        Best glide {s?.glide ? `${s.glide} ${u}` : '_____'} · Vy {s ? `${s.vy} ${u}` : '_____'} · Approach {s ? `${s.approach} ${u}` : '_____'} · Stall, landing flaps {s ? `${s.stallLanding} ${u}` : '_____'}
      </p>
      <div className="columns-2 gap-4">
        {GENERIC_EMERGENCY_CHECKLIST.map(sec => (
          <div key={sec.title} className="mb-2 break-inside-avoid">
            <h3 className="font-bold uppercase">{sec.title}</h3>
            <table className="w-full">
              <tbody>
                {sec.items.map(it => (
                  <tr key={it.item}>
                    <td className="pr-1">{it.item}</td>
                    <td className="text-right font-semibold">{it.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sec.note && <p className="italic">{sec.note}</p>}
          </div>
        ))}
        <div className="mb-2 break-inside-avoid">
          <h3 className="font-bold uppercase">MAYDAY call</h3>
          <ol className="list-decimal pl-4">{MAYDAY_CALL.map(l => <li key={l}>{l}</li>)}</ol>
          <p className="italic">Squawk 7700. On the current frequency, or 121.5.</p>
        </div>
      </div>
      <p className="mt-1 border-t border-black pt-1 text-[8pt] font-semibold">
        Generic single-engine piston checklist, not specific to {data.aircraftName}. The POH/AFM takes precedence: check it matches
        your aircraft (fuel pump, carburettor heat, mixture, fuel selector) before you rely on it.
        {s ? ' Speeds from the aircraft data in this app.' : ''}
      </p>
    </Section>
  );
};

export default BriefingPack;
