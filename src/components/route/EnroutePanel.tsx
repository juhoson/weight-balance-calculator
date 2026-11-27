import React from 'react';
import { AlertTriangle, Loader2, Wind } from 'lucide-react';
import { NumberInput } from '../ui/NumberInput';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { FormItem, FormLabel } from '../ui/Form';
import {
  type ClimbRates, MAX_ALTITUDE_FT, MAX_RATE_FPM, MIN_ALTITUDE_FT, MIN_RATE_FPM, validAltitude, validRate, type EnrouteForecastState,
} from '../../lib/useEnrouteForecast';
import { type AltitudeHold, type RoutePlan, warningsOf, withStretchAltitude } from '../../lib/enroute';
import AltitudeChanges from './AltitudeChanges';
import type { RouteObstacle } from '../../lib/obstacles';
import type { TerrainPoint } from '../../lib/terrainProfile';
import RouteProfileChart, { type ReportedCloud } from './RouteProfileChart';
import type { AirspaceCheck } from '../../lib/airspace';
import type { AvoidHandler } from '../../lib/avoidAirspace';
import type { Suggestions } from '../../lib/suggestAltitude';
import AltitudeSuggestions from './AltitudeSuggestions';

interface EnroutePanelProps {
  /** The cloud the METARs along the route report, for the profile. */
  reported?: ReportedCloud[];
  /** The arrival field's elevation, for the profile's landing. */
  arrivalFt?: number | null;
  /** The obstacles near the route, for the profile. */
  obstacles?: RouteObstacle[];
  /** The ground along the route, for the profile. */
  terrainProfile?: TerrainPoint[] | null;
  altitudeFt: number;
  onAltitudeChange: (ft: number) => void;
  /** datetime-local value; empty = now. */
  departure: string;
  onDepartureChange: (value: string) => void;
  /** Why the forecast isn't asked for (the loading or fuel doesn't work out); null when it is. */
  blockedReason: string | null;
  forecast: EnrouteForecastState;
  plan: RoutePlan | null;
  tasKt: number;
  /** Best rate of climb speed, the climb is flown at. */
  vyKt: number;
  climbRates: ClimbRates;
  onClimbRatesChange: (patch: Partial<ClimbRates>) => void;
  /** Drawn on the profile chart. */
  airspaces?: AirspaceCheck[];
  /** Offers going under or over an airspace tapped on the profile chart. */
  avoid?: AvoidHandler;
  /** Cruise altitudes compared in their own forecast; null while comparing. */
  suggestions?: Suggestions | null;
  suggestMaxFt?: number;
  onSuggestMaxChange?: (ft: number) => void;
  /** Stretches at another altitude than the cruise. */
  holds?: AltitudeHold[];
  onHoldsChange?: (holds: AltitudeHold[]) => void;
}

const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');
const fmtMinutes = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const utc = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
const ft = (n: number) => n.toLocaleString('en');
const variation = (v: number) => `${Math.abs(Math.round(v))}°${v >= 0 ? 'E' : 'W'}`;

/** A datetime-local value for a date, in local time. */
export function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Cruise altitude and departure time; the route flown in the forecast as a profile and a nav log. */
const EnroutePanel: React.FC<EnroutePanelProps> = ({
  reported, arrivalFt, obstacles, terrainProfile, altitudeFt, onAltitudeChange, departure, onDepartureChange, blockedReason, forecast, plan, tasKt, vyKt, climbRates,
  onClimbRatesChange, airspaces, avoid, suggestions = null, suggestMaxFt, onSuggestMaxChange, holds = [], onHoldsChange,
}) => {
  const now = new Date();
  const maxDeparture = new Date(now.getTime() + 46 * 3600_000);
  const { data } = forecast;
  const warnings = plan?.ok ? warningsOf(plan.segments, altitudeFt) : null;

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Wind className="h-4 w-4"/> En-route forecast</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormItem>
          <FormLabel htmlFor="cruise-altitude">Cruise altitude</FormLabel>
          <NumberInput id="cruise-altitude" value={altitudeFt} step={500} unit="ft" onChange={onAltitudeChange}/>
          {!validAltitude(altitudeFt) && (
            <p className="text-xs text-red-600">Between {ft(MIN_ALTITUDE_FT)} and {ft(MAX_ALTITUDE_FT)} ft.</p>
          )}
        </FormItem>
        <FormItem>
          <FormLabel htmlFor="departure-time">Departure (local time)</FormLabel>
          <div className="flex gap-2">
            <Input id="departure-time" type="datetime-local" className="min-w-0 flex-1"
              value={departure || localInputValue(now)} min={localInputValue(now)} max={localInputValue(maxDeparture)}
              onChange={e => onDepartureChange(e.target.value)}/>
            {departure && <Button type="button" variant="outline" onClick={() => onDepartureChange('')}>Now</Button>}
          </div>
        </FormItem>
        <FormItem>
          <FormLabel htmlFor="climb-rate">Climb rate <span className="font-normal text-muted-foreground">· at Vy {vyKt} kt</span></FormLabel>
          <NumberInput id="climb-rate" value={climbRates.climbFpm} step={50} unit="ft/min" onChange={v => onClimbRatesChange({ climbFpm: v })}/>
        </FormItem>
        <FormItem>
          <FormLabel htmlFor="descent-rate">Descent rate <span className="font-normal text-muted-foreground">· at cruise speed</span></FormLabel>
          <NumberInput id="descent-rate" value={climbRates.descentFpm} step={50} unit="ft/min" onChange={v => onClimbRatesChange({ descentFpm: v })}/>
        </FormItem>
      </div>
      {(!validRate(climbRates.climbFpm) || !validRate(climbRates.descentFpm))
        ? <p className="text-xs text-red-600">Climb and descent rates between {MIN_RATE_FPM} and {ft(MAX_RATE_FPM)} ft/min; until then the plan has no climb or descent.</p>
        : <p className="-mt-1 text-[11px] text-muted-foreground">Take the rates from your POH for today&apos;s weight; remembered for this aircraft.</p>}

      {blockedReason && (
        <p className="text-sm text-muted-foreground" role="status">{blockedReason}</p>
      )}
      {!blockedReason && forecast.loading && !data && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading the forecast…</p>
      )}
      {!blockedReason && forecast.error && <p className="text-sm text-red-600" role="alert">{forecast.error}</p>}
      {!blockedReason && data && !data.available && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
          The forecast could not be reached, so the flight time is without wind. Try again in a minute.
        </p>
      )}
      {!blockedReason && plan && !plan.ok && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
          {plan.reason === 'no-forecast'
            ? 'No forecast for that time (it reaches two days ahead), so the flight time is without wind.'
            : `The wind on ${plan.leg.from} → ${plan.leg.to} is too strong to fly at ${tasKt} kt.`}
        </p>
      )}

      {!blockedReason && plan?.ok && warnings && (
        <>
          {(warnings.nearCloud.length > 0 || warnings.lowTerrain.length > 0 || warnings.icing.length > 0) && (
            <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              {warnings.nearCloud.length > 0 && (
                <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Cloud base forecast below or less than 500 ft above {holds.length ? 'the altitude flown' : `your cruise altitude (${ft(altitudeFt)} ft)`} on {warnings.nearCloud.length} of {plan.segments.length} segments
                  (lowest ≈ {ft(warnings.lowestBaseFt ?? 0)} ft).</li>
              )}
              {warnings.icing.length > 0 && (
                <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Icing possible: cloud and below 0 °C at the cruise altitude on {warnings.icing.length} segments.</li>
              )}
              {warnings.lowTerrain.length > 0 && (
                <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Less than 1,000 ft above the (averaged) terrain on {warnings.lowTerrain.length} segments - check the chart for obstacles.</li>
              )}
            </ul>
          )}

          {suggestMaxFt !== undefined && onSuggestMaxChange && (
            <AltitudeSuggestions suggestions={suggestions} altitudeFt={altitudeFt} currentMinutes={plan.minutes}
              maxFt={suggestMaxFt} onMaxChange={onSuggestMaxChange} onPick={ft => { onAltitudeChange(ft); onHoldsChange?.([]); }}
              holds={holds} onPickStepped={onHoldsChange && ((ft, h) => { onAltitudeChange(ft); onHoldsChange(h); })}/>
          )}
          {onHoldsChange && (
            <AltitudeChanges holds={holds} onChange={onHoldsChange} cruiseFt={altitudeFt} missed={plan.profile?.missed ?? []}
              totalNm={plan.segments.reduce((sum, x) => Math.max(sum, x.segment.startNm + x.segment.distanceNm), 0)}/>
          )}
          {plan.profile && <ProfileSummary profile={plan.profile} cruiseFt={altitudeFt} onAltitudeChange={onAltitudeChange}/>}
          <RouteProfileChart legs={plan.legs} altitudeFt={altitudeFt} profile={plan.profile} airspaces={airspaces} avoid={avoid}
            reported={reported} arrivalFt={arrivalFt} obstacles={obstacles} terrainProfile={terrainProfile}
            onLegAltitude={onHoldsChange && ((i, to) => {
              const segs = plan.legs[i].segments;
              const last = segs[segs.length - 1].segment;
              const from = Math.round(segs[0].segment.startNm * 10) / 10, end = Math.round((last.startNm + last.distanceNm) * 10) / 10;
              onHoldsChange(withStretchAltitude(holds, from, end, to, altitudeFt, `${plan.legs[i].leg.from} → ${plan.legs[i].leg.to}`));
            })}/>
          <NavLog plan={plan}/>

          <p className="text-[11px] text-muted-foreground">
            Forecast at {ft(data?.altitudeFt ?? altitudeFt)} ft for when each segment is flown, at {tasKt} kt true airspeed;
            the climb and descent use the same wind. The true airspeed is estimated from the book cruise speed, taken at 3,000 ft:
            about 1.5% faster per 1,000 ft higher at the same power, up to where full throttle can&apos;t hold it, then slower. Fuel is counted at the cruise fuel flow throughout.
            Headings are magnetic (World Magnetic Model 2025). Cloud base is estimated from the model&apos;s humidity by height.
            Model forecast from <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0),
            not an official aviation forecast - get an official briefing before flight.
          </p>
        </>
      )}
    </div>
  );
};

/** Top of climb and top of descent, and a note when the route is too short for the cruise altitude. */
const ProfileSummary: React.FC<{
  profile: NonNullable<Extract<RoutePlan, { ok: true }>['profile']>;
  cruiseFt: number;
  onAltitudeChange: (ft: number) => void;
}> = ({ profile, cruiseFt, onAltitudeChange }) => {
  // The wind and warnings are for the cruise altitude; offer one the flight can reach.
  const reachable = Math.max(MIN_ALTITUDE_FT, Math.floor(profile.topFt / 500) * 500);
  return (
    <div className="space-y-1 text-xs">
      {!profile.reachesCruise && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
          <div className="space-y-1.5">
            <p>
            Too short to reach {ft(cruiseFt)} ft: at these rates the climb and descent meet at about {ft(Math.round(profile.topFt / 100) * 100)} ft.
            The wind and the warnings above are for {ft(cruiseFt)} ft.
            </p>
            <Button type="button" size="sm" variant="outline" className="h-7 bg-background text-foreground" onClick={() => onAltitudeChange(reachable)}>
            Use {ft(reachable)} ft
            </Button>
          </div>
        </div>
      )}
      <p className="tabular-nums">
        <strong>Top of climb</strong> {Math.round(profile.tocNm)} NM out, {utc(profile.tocAt)} ({fmtMinutes(profile.climbMinutes)} climbing)
        {' · '}<strong>Top of descent</strong> {Math.round(profile.todNm)} NM out, {utc(profile.todAt)} ({fmtMinutes(profile.descentMinutes)} to circuit altitude, {ft(profile.arrivalFt)} ft)
      </p>
    </div>
  );
};

/** Leg by leg, segment by segment: the numbers to fly. */
export const NavLog: React.FC<{ plan: Extract<RoutePlan, { ok: true }> }> = ({ plan }) => {
  // An altitude column only when it changes along the way.
  const alt = plan.segments.some(s => s.altitudeFt !== plan.segments[0]?.altitudeFt);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <caption className="sr-only">Nav log</caption>
        <thead className="text-left text-[11px] text-muted-foreground">
          <tr>
            <th className="py-1 pr-1.5 sm:pr-2 font-medium">NM</th>
            {alt && <th className="py-1 pr-1.5 sm:pr-2 font-medium" title="Altitude flown (ft)">Alt</th>}
            <th className="hidden py-1 pr-1.5 sm:pr-2 font-medium sm:table-cell" title="Magnetic course">MC</th>
            <th className="py-1 pr-1.5 sm:pr-2 font-medium" title="Magnetic heading">MH</th>
            <th className="py-1 pr-1.5 sm:pr-2 font-medium" title="Groundspeed">GS</th>
            <th className="py-1 pr-1.5 sm:pr-2 font-medium">Time</th>
            <th className="py-1 pr-1.5 sm:pr-2 font-medium" title="Arrival at the end of the segment (UTC)">ETA</th>
            <th className="py-1 pr-1.5 sm:pr-2 font-medium">Wind</th>
            <th className="py-1 font-medium" title="Estimated base of the lowest broken or overcast layer">Base</th>
          </tr>
        </thead>
        {plan.legs.map((l, i) => (
          <tbody key={i} className="border-t border-border">
            <tr>
              <th colSpan={alt ? 9 : 8} className="pb-0.5 pt-2 text-left font-semibold text-foreground">
                {l.leg.from} → {l.leg.to} · {Math.round(l.leg.distanceNm)} NM · {fmtMinutes(l.minutes)}
                {l.segments[0] && <span className="font-normal text-muted-foreground"> · var {variation(l.segments[0].variationDeg)}</span>}
              </th>
            </tr>
            {l.segments.map((s, j) => (
              <tr key={j} className="text-foreground">
                <td className="whitespace-nowrap py-0.5 pr-1.5 sm:pr-2 text-muted-foreground">{Math.round(s.segment.startNm)}–{Math.round(s.segment.startNm + s.segment.distanceNm)}</td>
                {alt && <td className="py-0.5 pr-1.5 sm:pr-2">{ft(s.altitudeFt)}</td>}
                <td className="hidden py-0.5 pr-1.5 sm:pr-2 sm:table-cell">{pad3(s.magneticCourse)}</td>
                <td className="py-0.5 pr-1.5 sm:pr-2 font-semibold">{pad3(s.magneticHeading)}</td>
                <td className="py-0.5 pr-1.5 sm:pr-2">{Math.round(s.groundSpeedKt)}</td>
                <td className="py-0.5 pr-1.5 sm:pr-2">{fmtMinutes(s.minutes)}</td>
                <td className="py-0.5 pr-1.5 sm:pr-2">{utc(s.arrives)}</td>
                <td className="py-0.5 pr-1.5 sm:pr-2">{pad3(s.wind.fromTrue)}/{Math.round(s.wind.kt)}</td>
                <td className="py-0.5">{s.cloudBaseFt === null ? '–' : ft(s.cloudBaseFt)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className="mt-1 text-[11px] text-muted-foreground">Wind is true direction/kt at the {alt ? 'altitude flown' : 'cruise altitude'}; ETA in UTC.</p>
    </div>
  );
};

export default EnroutePanel;
