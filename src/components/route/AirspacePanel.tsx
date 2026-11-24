import React from 'react';
import { ChevronDown, ChevronUp, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import HereFrequencies from './HereFrequencies';
import { adviceFor, type AirspaceCheck, MARGIN_FT } from '../../lib/airspace';
import { contactFrequencies, frequencyText } from '../../lib/frequencies';
import type { AirspacesState } from '../../lib/useAirspaces';
import type { Frequency } from '../../types/route';
import { SWEDEN_CONTROL_URL, type SwedenControlLeg, swedenControlText } from '../../lib/swedenControl';
import { type AvoidHandler, canAvoid, holdFor } from '../../lib/avoidAirspace';
import AvoidAirspace from './AvoidAirspace';

interface AirspacePanelProps {
  state: AirspacesState;
  checks: AirspaceCheck[];
  /** How the altitudes were worked out, e.g. "climbing at 500 ft/min to 4,500 ft". */
  basis: string;
  /** Who to call in class G along the route, where it's in Sweden. */
  swedenControl?: SwedenControlLeg[];
  /** Offers going under or over each airspace entered. */
  avoid?: AvoidHandler;
}

const ft = (n: number) => Math.round(n).toLocaleString('en');
const nm = (n: number) => Math.round(n);

export const SEVERITY_STYLE: Record<ReturnType<typeof adviceFor>['severity'], { border: string; text: string; box: string }> = {
  prohibited: { border: 'border-l-red-600', text: 'text-red-700 dark:text-red-400', box: 'fill-red-500 stroke-red-600 dark:stroke-red-400' },
  restricted: { border: 'border-l-orange-500', text: 'text-orange-700 dark:text-orange-300', box: 'fill-orange-500 stroke-orange-600 dark:stroke-orange-400' },
  clearance: { border: 'border-l-blue-600', text: 'text-blue-700 dark:text-blue-300', box: 'fill-blue-500 stroke-blue-600 dark:stroke-blue-400' },
  contact: { border: 'border-l-amber-500', text: 'text-amber-700 dark:text-amber-300', box: 'fill-amber-400 stroke-amber-600 dark:stroke-amber-400' },
  info: { border: 'border-l-slate-400', text: 'text-muted-foreground', box: 'fill-slate-400 stroke-slate-500 dark:stroke-slate-400' },
};

const STATUS_TEXT: Record<AirspaceCheck['status'], string> = {
  inside: 'Inside',
  close: `Within ${MARGIN_FT} ft`,
  above: 'Over it',
  below: 'Under it',
};

const HIDDEN_KEY = 'airspaceList.hidden';

/** Whether the pilot hid the list; remembered on this device. */
function useHidden(): [boolean, (v: boolean) => void] {
  const [hidden, setHidden] = React.useState(() => {
    try { return localStorage.getItem(HIDDEN_KEY) === 'true'; } catch { return false; }
  });
  const set = (v: boolean) => {
    setHidden(v);
    try { localStorage.setItem(HIDDEN_KEY, String(v)); } catch { /* private mode */ }
  };
  return [hidden, set];
}

const Frequencies: React.FC<{ list: Frequency[] }> = ({ list }) => {
  const freqs = contactFrequencies(list);
  if (freqs.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
      {freqs.map(f => (
        <span key={f.value}><span className="font-semibold">{frequencyText(f)}</span>
          {f.source && <span className="text-muted-foreground"> (from {f.source})</span>}</span>
      ))}
    </p>
  );
};

const activationText = (a: AirspaceCheck['airspace']['activation']) =>
  a === 'NOTAM' ? 'Active by NOTAM.' : a === 'request' ? 'Active on request.' : a === 'demand' ? 'Active on demand.' : '';

/** The airspaces the planned flight path enters or passes close to, in route order. */
const AirspacePanel: React.FC<AirspacePanelProps> = ({ state, checks, basis, swedenControl = [], avoid }) => {
  // Gliding sectors, sport areas and the like go in the second list, with what's passed over or under.
  const isInfo = (c: AirspaceCheck) => adviceFor(c.airspace).severity === 'info';
  const near = (c: AirspaceCheck) => c.status === 'inside' || c.status === 'close';
  const relevant = checks.filter(c => near(c) && !isInfo(c));
  const other = checks.filter(c => near(c) && isInfo(c));
  const clear = checks.filter(c => !near(c));
  const inside = relevant.filter(c => c.status === 'inside');
  const clearances = inside.filter(c => adviceFor(c.airspace).severity === 'clearance').length;
  const restricted = inside.filter(c => ['prohibited', 'restricted'].includes(adviceFor(c.airspace).severity)).length;
  const [hidden, setHidden] = useHidden();
  const listed = relevant.length + other.length + clear.length;

  return (
    <section className="min-w-0 space-y-2 rounded-lg border border-border p-3" aria-label="Airspace along the route">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4"/> Airspace along the route</h3>
        {state.data && listed > 0 && (
          <Button type="button" variant="ghost" size="sm" aria-expanded={!hidden} onClick={() => setHidden(!hidden)}>
            {hidden ? <><ChevronDown className="mr-1 h-4 w-4"/> Show list</> : <><ChevronUp className="mr-1 h-4 w-4"/> Hide list</>}
          </Button>
        )}
      </div>
      <HereFrequencies/>
      {swedenControl.length > 0 && <SwedenControlAlong legs={swedenControl}/>}
      {state.problem === 'off' && <p className="text-sm text-muted-foreground">The airspace check isn&apos;t available right now.</p>}
      {state.problem === 'error' && <p className="text-sm text-amber-700 dark:text-amber-300" role="status">openAIP could not be reached. Try again in a minute, or check the charts.</p>}
      {state.loading && !state.data && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Checking airspace…</p>
      )}
      {state.data && (
        <>
          <p className="text-sm">
            {inside.length === 0
              ? `The planned path enters no controlled, restricted or danger area listed in openAIP${other.length ? ` (but ${other.length} other area${other.length === 1 ? '' : 's'}, below)` : ''}.`
              : `Enters ${inside.length} airspace${inside.length === 1 ? '' : 's'}`
                + (clearances ? `, ${clearances} needing a clearance` : '')
                + (restricted ? `, ${restricted} restricted, danger or prohibited` : '') + '.'
                + (other.length ? ` Also ${other.length} other area${other.length === 1 ? '' : 's'}, below.` : '')}
            <span className="text-muted-foreground"> Altitudes {basis}.</span>
          </p>
          {!hidden && relevant.length > 0 && (
            <ul className="space-y-1.5">
              {relevant.map((c, i) => <Item key={`${c.airspace.id}-${i}`} c={c} avoid={avoid}/>)}
            </ul>
          )}
          {!hidden && other.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Gliding sectors and other areas: {other.length}</summary>
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {other.map((c, i) => (
                  <li key={`${c.airspace.id}-${i}`}>
                    {nm(c.fromNm)}–{nm(c.toNm)} NM · {c.airspace.name}, {adviceFor(c.airspace).label.toLowerCase()} ({c.airspace.lower.label} – {c.airspace.upper.label}) · {STATUS_TEXT[c.status].toLowerCase()}
                    {c.airspace.activation ? ` · ${activationText(c.airspace.activation).toLowerCase().replace('.', '')}` : ''}
                    {contactFrequencies(c.airspace.frequencies).length > 0 && ` · ${contactFrequencies(c.airspace.frequencies).map(frequencyText).join(', ')}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!hidden && clear.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Over or under {clear.length} more</summary>
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {clear.map((c, i) => (
                  <li key={`${c.airspace.id}-${i}`}>
                    {nm(c.fromNm)}–{nm(c.toNm)} NM · {c.airspace.name} ({c.airspace.lower.label} – {c.airspace.upper.label}) · {STATUS_TEXT[c.status].toLowerCase()}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        From openAIP, maintained by volunteers. Not for navigation: check the AIP, the charts, NOTAMs and which areas are active.
        Flight levels are compared as altitudes; AGL limits depend on the ground, so they count as close within 1,000 ft.
        A frequency marked &quot;from&quot; an airport is that airport&apos;s, as the area has none of its own in openAIP.
      </p>
    </section>
  );
};

/** The class G frequency stretch by stretch: Sweden Control (or Sweden Information) by ACC sector. */
const SwedenControlAlong: React.FC<{ legs: SwedenControlLeg[] }> = ({ legs }) => (
  <div className="space-y-0.5 rounded-md border border-border px-2 py-1.5 text-xs">
    <p className="font-medium">Outside controlled airspace (class G): flight information and flight following</p>
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
      {legs.map((l, i) => (
        <li key={i}>
          <span className="text-muted-foreground">{legs.length > 1 ? `${nm(l.fromNm)}–${nm(l.toNm)} NM ` : ''}</span>
          <span className="font-semibold">{swedenControlText(l.sector)}</span>
          {l.sector.alternative && <span> or <span className="font-semibold">{l.sector.alternative.frequency}</span></span>}
          <span className="text-muted-foreground"> ({l.sector.sector}{l.sector.exact ? '' : ', approx.'})</span>
        </li>
      ))}
    </ul>
    <p className="text-[11px] text-muted-foreground">
      Sectors traced from the AIP&apos;s <a className="underline" href={SWEDEN_CONTROL_URL} target="_blank" rel="noreferrer">ENR 6.1 COM FREQ charts</a>,
      approximate near sector boundaries; check the chart.
    </p>
  </div>
);

const Item: React.FC<{ c: AirspaceCheck; avoid?: AvoidHandler }> = ({ c, avoid }) => {
  const advice = adviceFor(c.airspace);
  const style = SEVERITY_STYLE[advice.severity];
  const you = Math.abs(c.maxFt - c.minFt) < 50 ? `${ft(c.maxFt)} ft` : `${ft(c.minFt)}–${ft(c.maxFt)} ft`;
  return (
    <li className={`rounded-md border border-l-4 border-border ${style.border} px-2 py-1.5 text-xs`}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-semibold text-sm">{c.airspace.name}</span>
        <span className={`font-medium ${style.text}`}>{advice.label}</span>
      </p>
      <p className="tabular-nums text-muted-foreground">
        {nm(c.fromNm)}–{nm(c.toNm)} NM · {c.airspace.lower.label} – {c.airspace.upper.label} · you {you}
      </p>
      <p>
        <strong className={c.status === 'inside' ? style.text : undefined}>{STATUS_TEXT[c.status]}.</strong>{' '}
        {c.status === 'inside' ? advice.hint : 'Close to its limit: allow for altimeter setting and terrain.'} {activationText(c.airspace.activation)}
      </p>
      <Frequencies list={c.airspace.frequencies}/>
      {avoid && canAvoid(c) && <AvoidAirspace options={avoid.optionsFor(c)} altitudeFt={avoid.altitudeFt} onPick={avoid.onPick}
        range={c} onHold={avoid.onHold && ((side, ft) => avoid.onHold?.(holdFor(c, side, ft)))}/>}
    </li>
  );
};

export default AirspacePanel;
