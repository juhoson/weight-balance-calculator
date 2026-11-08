import React from 'react';
import { AlertTriangle, ChevronDown, Wind } from 'lucide-react';
import type { AirportInfo, FlightCategory, RoutePoint } from '../../types/route';
import { runwayWinds } from '../../lib/wind';
import { cn } from '../../lib/utils';

const CATEGORY_STYLE: Record<FlightCategory, string> = {
  VFR: 'bg-emerald-600 text-white',
  MVFR: 'bg-blue-600 text-white',
  IFR: 'bg-red-600 text-white',
  LIFR: 'bg-fuchsia-700 text-white',
};

const ROLE_LABEL = { DEPARTURE: 'Departure', ENROUTE: 'En route', ARRIVAL: 'Arrival' } as const;

/** METARs older than this are flagged. */
const STALE_MINUTES = 90;

function age(iso: string | null, now: number): { text: string; minutes: number } | null {
  if (!iso) return null;
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(minutes)) return null;
  if (minutes < 60) return { text: `${Math.max(0, minutes)} min ago`, minutes };
  return { text: `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`, minutes };
}

const visibility = (m: number | null) => (m === null ? '–' : m >= 10000 ? '≥10 km' : m >= 5000 ? `${Math.round(m / 1000)} km` : `${Math.round(m / 100) * 100} m`);

interface WeatherCardProps {
  point: RoutePoint;
  /** The departure or arrival airport (runways for the wind check); absent en route. */
  airport?: AirportInfo;
  /** Selected aircraft's maximum demonstrated crosswind, kt. */
  maxCrosswindKt: number;
  now?: number;
}

const WeatherCard: React.FC<WeatherCardProps> = ({ point, airport, maxCrosswindKt, now = Date.now() }) => {
  const [showTaf, setShowTaf] = React.useState(false);
  const { metar, taf, station } = point;
  const observed = age(metar?.observedAt ?? null, now);
  const winds = airport ? runwayWinds(metar, airport.runways) : [];
  const best = winds[0];
  const worstCross = best ? best.gustCrosswindKt : 0;
  const crossTooHigh = best !== undefined && worstCross > maxCrosswindKt;
  const ownStation = station && airport && station.code === airport.code;

  return (
    <article className="rounded-lg border border-border bg-background p-3" aria-label={`${ROLE_LABEL[point.role]} weather`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {ROLE_LABEL[point.role]}{point.role === 'ENROUTE' ? ` · ${Math.round(point.alongTrackNm)} NM` : ''}
          </p>
          <p className="truncate text-sm font-semibold">
            {airport ? `${airport.code} · ${airport.name}` : station ? `${station.code} · ${station.name.trim()}` : '–'}
          </p>
          {station && !ownStation && airport && (
            <p className="text-xs text-muted-foreground">
              No report of its own; weather from {station.code} ({station.name.trim()}), {station.distanceNm} NM away
            </p>
          )}
          {station && point.role === 'ENROUTE' && (
            <p className="text-xs text-muted-foreground">{station.distanceNm} NM from the route</p>
          )}
        </div>
        {metar?.flightCategory && (
          <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', CATEGORY_STYLE[metar.flightCategory])}>
            {metar.flightCategory}
          </span>
        )}
      </header>

      {!metar && (
        <p className="mt-2 text-sm text-muted-foreground">
          {station ? `No current report from ${station.code}.` : 'No reporting station nearby.'}
        </p>
      )}

      {metar && (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Wind</dt><dd className="font-medium tabular-nums">
              {metar.windKt === 0 ? 'Calm'
                : `${metar.windVariable || metar.windDirTrue === null ? 'VRB' : String(metar.windDirTrue).padStart(3, '0') + '°'} ${metar.windKt ?? '–'}${metar.gustKt ? `G${metar.gustKt}` : ''} kt`}
            </dd></div>
            <div><dt className="text-xs text-muted-foreground">Visibility</dt><dd className="font-medium tabular-nums">{visibility(metar.visibilityM)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Ceiling</dt><dd className="font-medium tabular-nums">{metar.ceilingFt === null ? 'None' : `${metar.ceilingFt} ft`}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Temp / QNH</dt><dd className="font-medium tabular-nums">
              {metar.tempC ?? '–'}°/{metar.dewpointC ?? '–'}° · {metar.qnhHpa ? Math.round(metar.qnhHpa) : '–'}
            </dd></div>
          </dl>

          {best && (
            <div className={cn('mt-2 rounded-md px-2.5 py-1.5 text-sm',
              crossTooHigh ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100' : 'bg-muted')}>
              <p className="flex flex-wrap items-center gap-x-1.5">
                {crossTooHigh ? <AlertTriangle className="h-4 w-4 text-red-600"/> : <Wind className="h-4 w-4 text-muted-foreground"/>}
                <span>Best runway <strong>{best.runway}</strong>{best.surface ? ` (${best.surface.toLowerCase()})` : ''}:</span>
                <span className="tabular-nums">
                  {best.headwindKt >= 0 ? `${best.headwindKt} kt head` : `${-best.headwindKt} kt tail`},
                  {' '}{best.crosswindKt} kt cross{best.crossFrom ? ` from the ${best.crossFrom}` : ''}
                  {best.gustCrosswindKt > best.crosswindKt ? ` (${best.gustCrosswindKt} in gusts)` : ''}
                </span>
              </p>
              {crossTooHigh && (
                <p className="mt-0.5 text-xs">Above this aircraft&apos;s demonstrated crosswind of {maxCrosswindKt} kt.</p>
              )}
              {winds.length > 2 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Others: {winds.slice(1).map(w => `${w.runway} ${w.headwindKt >= 0 ? '' : 'tail '}${Math.abs(w.headwindKt)}/${w.crosswindKt}`).join(' · ')} kt (head/cross)
                </p>
              )}
              {best.headingEstimated && (
                <p className="mt-0.5 text-xs text-muted-foreground">Runway heading estimated from its number.</p>
              )}
            </div>
          )}

          <p className="mt-2 break-words rounded bg-muted/60 px-2 py-1 font-mono text-xs">{metar.raw}</p>
          {observed && (
            <p className={cn('mt-1 text-xs', observed.minutes > STALE_MINUTES ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
              Observed {observed.text}{observed.minutes > STALE_MINUTES ? ' - may be out of date' : ''}
            </p>
          )}
        </>
      )}

      {taf && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowTaf(s => !s)} aria-expanded={showTaf}
            className="flex items-center gap-1 text-xs font-medium text-primary">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTaf && 'rotate-180')}/> TAF {taf.station}
          </button>
          {showTaf && <p className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/60 px-2 py-1 font-mono text-xs">{taf.raw}</p>}
        </div>
      )}
    </article>
  );
};

export default WeatherCard;
