import React from 'react';
import { Loader2, Wind } from 'lucide-react';
import { NumberInput } from '../ui/NumberInput';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { FormItem, FormLabel } from '../ui/Form';
import { MAX_ALTITUDE_FT, MIN_ALTITUDE_FT, validAltitude, type WindsAloftState } from '../../lib/useWindsAloft';
import type { RoutePlan } from '../../lib/windsAloft';

interface WindsAloftPanelProps {
  altitudeFt: number;
  onAltitudeChange: (ft: number) => void;
  /** datetime-local value; empty = now. */
  departure: string;
  onDepartureChange: (value: string) => void;
  winds: WindsAloftState;
  plan: RoutePlan | null;
  tasKt: number;
}

const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');
const fmtMinutes = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const signed = (n: number) => {
  const r = Math.round(n);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}`;
};

/** A datetime-local value for a date, in local time. */
export function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Cruise altitude and departure time, and each leg flown in the forecast wind there. */
const WindsAloftPanel: React.FC<WindsAloftPanelProps> = ({
  altitudeFt, onAltitudeChange, departure, onDepartureChange, winds, plan, tasKt,
}) => {
  const now = new Date();
  const maxDeparture = new Date(now.getTime() + 46 * 3600_000);
  const { data } = winds;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Wind className="h-4 w-4"/> Winds aloft</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormItem>
          <FormLabel htmlFor="cruise-altitude">Cruise altitude</FormLabel>
          <NumberInput id="cruise-altitude" value={altitudeFt} step={500} unit="ft" onChange={onAltitudeChange}/>
          {!validAltitude(altitudeFt) && (
            <p className="text-xs text-red-600">Between {MIN_ALTITUDE_FT.toLocaleString('en')} and {MAX_ALTITUDE_FT.toLocaleString('en')} ft.</p>
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
      </div>

      {winds.loading && !data && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading winds…</p>
      )}
      {winds.error && <p className="text-sm text-red-600" role="alert">{winds.error}</p>}
      {data && !data.available && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
          The wind forecast could not be reached, so the flight time is without wind. Try again in a minute.
        </p>
      )}
      {plan && !plan.ok && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
          {plan.reason === 'no-forecast'
            ? 'No wind forecast that far ahead (two days), so the flight time is without wind.'
            : `The wind on ${plan.leg.from} → ${plan.leg.to} is too strong to fly at ${tasKt} kt.`}
        </p>
      )}

      {plan?.ok && (
        <>
          <ul className="space-y-2">
            {plan.legs.map((l, i) => (
              <li key={i} className="rounded-md bg-muted/50 px-3 py-2 text-xs tabular-nums">
                <p className="flex flex-wrap justify-between gap-x-3 font-medium text-foreground">
                  <span>{l.leg.from} → {l.leg.to} · {Math.round(l.leg.distanceNm)} NM · TC {pad3(l.leg.trueCourseDeg)}°</span>
                  <span>{fmtMinutes(l.minutes)}</span>
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Wind {pad3(l.wind.fromTrue)}°/{Math.round(l.wind.kt)} kt
                  {l.wind.tempC !== null && <> · {signed(l.wind.tempC)} °C</>}
                  {' '}· {Math.round(l.triangle.headwindKt) >= 0 ? 'head' : 'tail'} {Math.abs(Math.round(l.triangle.headwindKt))} kt
                  {' '}· TH {pad3(l.triangle.headingTrue)}° ({signed(l.triangle.wcaDeg)}°)
                  {' '}· GS {Math.round(l.triangle.groundSpeedKt)} kt
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Forecast at {(data?.altitudeFt ?? altitudeFt).toLocaleString('en')} ft for when each leg is flown, at {tasKt} kt true airspeed.
            TH is true heading: apply the variation for the magnetic heading.
            Model forecast from <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0),
            not an official aviation forecast - check the official wind charts before flight.
          </p>
        </>
      )}
    </div>
  );
};

export default WindsAloftPanel;
