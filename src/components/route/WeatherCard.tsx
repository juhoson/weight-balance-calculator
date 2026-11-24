import React from 'react';
import { AlertTriangle, ChevronDown, Code, ExternalLink, FileWarning, Wind } from 'lucide-react';
import type { AirportInfo, FlightCategory, RoutePoint } from '../../types/route';
import { runwayWinds, seasonalRunways } from '../../lib/wind';
import { cloudText, decodeMetar, decodeTaf, formatUtcRange, periodIsNow, summarise, type TafState, tafStatus } from '../../lib/metarTaf';
import { useNow } from '../../lib/useNow';
import { notamSource } from '../../lib/notam';
import { cn } from '../../lib/utils';
import RunwayWindDiagram from './RunwayWindDiagram';

const CATEGORY_STYLE: Record<FlightCategory, string> = {
  VFR: 'bg-emerald-600 text-white',
  MVFR: 'bg-blue-600 text-white',
  IFR: 'bg-red-600 text-white',
  LIFR: 'bg-fuchsia-700 text-white',
};

const TAF_STATE_STYLE: Record<TafState, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  upcoming: 'bg-muted text-muted-foreground',
  expired: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  cancelled: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  unknown: 'bg-muted text-muted-foreground',
};

const ROLE_LABEL = { DEPARTURE: 'Departure', WAYPOINT: 'Waypoint', ENROUTE: 'En route', ARRIVAL: 'Arrival' } as const;

/** METARs older than this are flagged. */
const STALE_MINUTES = 90;

function age(iso: string | null, now: number): { text: string; minutes: number } | null {
  if (!iso) return null;
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(minutes)) return null;
  if (minutes < 60) return { text: `${Math.max(0, minutes)} min ago`, minutes };
  if (minutes < 24 * 60) return { text: `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`, minutes };
  return { text: `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h ago`, minutes };
}

const visibility = (m: number | null) => (m === null ? '–' : m >= 10000 ? '≥10 km' : m >= 5000 ? `${Math.round(m / 1000)} km` : `${Math.round(m / 100) * 100} m`);

interface WeatherCardProps {
  point: RoutePoint;
  /** The departure or arrival airport (runways for the wind check); absent en route. */
  airport?: AirportInfo;
  /** Selected aircraft's maximum demonstrated crosswind, kt. */
  maxCrosswindKt: number;
  /** A position's name on the route, e.g. WP1. */
  label?: string;
  /** Fixed time for tests; otherwise the live time, updated every 30 s. */
  now?: number;
}

const WeatherCard: React.FC<WeatherCardProps> = ({ point, airport, maxCrosswindKt, label, now: fixedNow }) => {
  const liveNow = useNow(30_000);
  const now = fixedNow ?? liveNow;
  const [showTaf, setShowTaf] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const { metar, taf, station } = point;
  const observed = age(metar?.observedAt ?? null, now);
  const decoded = React.useMemo(() => (metar ? decodeMetar(metar.raw) : null), [metar]);
  const forecast = React.useMemo(() => (taf ? decodeTaf(taf.raw, taf.issuedAt, new Date(fixedNow ?? Date.now())) : null), [taf, fixedNow]);
  const tafState = forecast ? tafStatus(forecast, now) : null;
  const issued = age(forecast?.issued ? forecast.issued.toISOString() : null, now);
  const season = airport ? seasonalRunways(airport.runways, new Date(now), airport.lat) : null;
  const winds = airport && season ? runwayWinds(metar, season.usable) : [];
  const best = winds[0];
  const worstCross = best ? best.gustCrosswindKt : 0;
  const crossTooHigh = best !== undefined && worstCross > maxCrosswindKt;
  const ownStation = station && airport && station.code === airport.code;
  const isPosition = airport?.type === 'point';
  const airportCode = point.role === 'ENROUTE' || isPosition ? null : airport?.code ?? point.airportCode ?? null;
  const notams = airportCode ? notamSource(airportCode) : null;

  return (
    <article className="rounded-lg border border-border bg-background p-3" aria-label={`${ROLE_LABEL[point.role]} weather`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {ROLE_LABEL[point.role]}{point.role === 'ENROUTE' || point.role === 'WAYPOINT' ? ` · ${Math.round(point.alongTrackNm)} NM` : ''}
          </p>
          <p className="truncate text-sm font-semibold">
            {airport ? (isPosition ? `${label ?? 'Position'} · ${airport.name}` : `${airport.code} · ${airport.name}`) : station ? `${station.code} · ${station.name.trim()}` : '–'}
          </p>
          {station && !ownStation && airport && (
            <p className="text-xs text-muted-foreground">
              {isPosition ? 'Weather' : 'No report of its own; weather'} from {station.code} ({station.name.trim()}), {station.distanceNm} NM away
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

          {best && season && metar.windDirTrue !== null && metar.windKt !== null && (
            <div className={cn('mt-2 flex flex-col items-center gap-3 rounded-md px-2.5 py-2 text-sm sm:flex-row sm:items-start',
              crossTooHigh ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100' : 'bg-muted')}>
              <RunwayWindDiagram windDirTrue={metar.windDirTrue} windKt={metar.windKt} gustKt={metar.gustKt}
                best={best} runways={season.usable} excluded={season.excluded}/>
              <div className="min-w-0 self-stretch">
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
                {season.excluded.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                  Grass {season.excluded.length === 1 ? 'runway' : 'runways'} {season.excluded.map(r => `${r.le}/${r.he}`).join(', ')} left
                  out for winter (dashed). Check NOTAMs if it is open.
                  </p>
                )}
                {season.grassOnly && (
                  <p className="mt-0.5 text-xs text-muted-foreground">Grass runways only: check they are open in winter.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">North up; arrow on the runway shows the direction of take-off and landing.</p>
              </div>
            </div>
          )}

          {decoded && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {decoded.cavok && <li><span className="text-muted-foreground">Sky:</span> CAVOK: no cloud below 5,000 ft, no significant weather</li>}
              {!decoded.cavok && decoded.clouds && (
                <li><span className="text-muted-foreground">Clouds:</span> {decoded.clouds.length ? decoded.clouds.map(cloudText).join(', ') : 'No significant cloud'}</li>
              )}
              {decoded.weather && decoded.weather.length > 0 && (
                <li><span className="text-muted-foreground">Weather:</span> {decoded.weather.join(', ')}</li>
              )}
              {decoded.rvr.length > 0 && <li><span className="text-muted-foreground">Runway visual range:</span> {decoded.rvr.join('; ')}</li>}
              {decoded.recent.length > 0 && <li><span className="text-muted-foreground">Recently:</span> {decoded.recent.join(', ')}</li>}
              {decoded.windShear.length > 0 && <li className="font-medium text-red-700 dark:text-red-300">{decoded.windShear.join('; ')}</li>}
              {decoded.trend.map(t => <li key={t}><span className="text-muted-foreground">Trend:</span> {t}</li>)}
              {decoded.auto && <li className="text-xs text-muted-foreground">Automatic observation, no observer.</li>}
              {decoded.unparsed.length > 0 && (
                <li className="text-xs text-muted-foreground">Not decoded: <span className="font-mono">{decoded.unparsed.join(' ')}</span></li>
              )}
            </ul>
          )}

          {showRaw && <p className="mt-2 break-words rounded bg-muted/60 px-2 py-1 font-mono text-xs" aria-label="Raw METAR">{metar.raw}</p>}
          {observed && (
            <p className={cn('mt-1 text-xs', observed.minutes > STALE_MINUTES ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
              Observed {observed.text}{observed.minutes > STALE_MINUTES ? ' - may be out of date' : ''}
            </p>
          )}
        </>
      )}

      {taf && forecast && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowTaf(s => !s)} aria-expanded={showTaf}
            className="flex items-center gap-1 text-xs font-medium text-primary">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTaf && 'rotate-180')}/>
            Forecast (TAF {taf.station}){forecast.validFrom ? `, ${formatUtcRange(forecast.validFrom, forecast.validTo)}` : ''}
          </button>
          {tafState && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-4 text-xs text-muted-foreground">
              <span className={cn('rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide', TAF_STATE_STYLE[tafState.state])}>
                {tafState.label}
              </span>
              <span>{[tafState.detail, issued && `issued ${issued.text}`].filter(Boolean).join(' · ')}</span>
            </p>
          )}
          {showTaf && (
            <>
              {tafState?.state === 'expired' && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">No current TAF: this one is out of date.</p>
              )}
              {(forecast.amended || forecast.corrected) && !forecast.cancelled && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {forecast.amended ? 'Amended forecast.' : 'Corrected forecast.'}
                </p>
              )}
              <ol className="mt-1 space-y-1.5">
                {forecast.periods.map((p, i) => (
                  <li key={i} className={cn('flex gap-2 rounded text-sm', (p.kind === 'TEMPO' || p.kind === 'PROB') && 'pl-3',
                    periodIsNow(p, now) && 'bg-primary/10 ring-1 ring-primary/30')}>
                    <span className={cn('mt-0.5 h-fit w-12 shrink-0 rounded px-1 text-center text-[10px] font-bold',
                      p.category ? CATEGORY_STYLE[p.category] : 'bg-muted text-muted-foreground')}>
                      {p.category ?? '–'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        {p.label}{p.from ? ` ${formatUtcRange(p.from, p.to)}` : ''}
                        {periodIsNow(p, now) && (
                          <span className="ml-1.5 rounded bg-primary px-1 py-px text-[9px] font-bold uppercase text-primary-foreground">now</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[...summarise(p.changes), ...p.extras].join(' · ') || 'No change stated'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {forecast.unparsed.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Not decoded: <span className="font-mono">{forecast.unparsed.join(' ')}</span></p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Times UTC. Categories use the conditions in effect, including earlier groups.
              </p>
            </>
          )}
          {showRaw && <p className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/60 px-2 py-1 font-mono text-xs" aria-label="Raw TAF">{taf.raw}</p>}
        </div>
      )}

      {(metar || taf || notams) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {(metar || taf) && (
            <button type="button" onClick={() => setShowRaw(s => !s)} aria-pressed={showRaw}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Code className="h-3.5 w-3.5"/> {showRaw ? 'Hide' : 'Show'} raw {[metar && 'METAR', taf && 'TAF'].filter(Boolean).join('/')}
            </button>
          )}
          {notams && (notams.url
            ? (
              <a href={notams.url} target="_blank" rel="noopener noreferrer" title={notams.hint}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <FileWarning className="h-3.5 w-3.5"/> {notams.label} <ExternalLink className="h-3 w-3"/>
              </a>
            )
            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><FileWarning className="h-3.5 w-3.5"/> {notams.hint}</span>)}
        </div>
      )}
      {notams?.url && <p className="mt-0.5 text-[11px] text-muted-foreground">{notams.hint}</p>}
    </article>
  );
};

export default WeatherCard;
