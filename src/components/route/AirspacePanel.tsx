import React from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { adviceFor, type AirspaceCheck, MARGIN_FT } from '../../lib/airspace';
import type { AirspacesState } from '../../lib/useAirspaces';

interface AirspacePanelProps {
  state: AirspacesState;
  checks: AirspaceCheck[];
  /** How the altitudes were worked out, e.g. "climbing at 500 ft/min to 4,500 ft". */
  basis: string;
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

const activationText = (a: AirspaceCheck['airspace']['activation']) =>
  a === 'NOTAM' ? 'Active by NOTAM.' : a === 'request' ? 'Active on request.' : a === 'demand' ? 'Active on demand.' : '';

/** The airspaces the planned flight path enters or passes close to, in route order. */
const AirspacePanel: React.FC<AirspacePanelProps> = ({ state, checks, basis }) => {
  // Gliding sectors, sport areas and the like go in the second list, with what's passed over or under.
  const isInfo = (c: AirspaceCheck) => adviceFor(c.airspace).severity === 'info';
  const near = (c: AirspaceCheck) => c.status === 'inside' || c.status === 'close';
  const relevant = checks.filter(c => near(c) && !isInfo(c));
  const other = checks.filter(c => near(c) && isInfo(c));
  const clear = checks.filter(c => !near(c));
  const inside = relevant.filter(c => c.status === 'inside');
  const clearances = inside.filter(c => adviceFor(c.airspace).severity === 'clearance').length;
  const restricted = inside.filter(c => ['prohibited', 'restricted'].includes(adviceFor(c.airspace).severity)).length;

  return (
    <section className="min-w-0 space-y-2 rounded-lg border border-border p-3" aria-label="Airspace along the route">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4"/> Airspace along the route</h3>
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
          {relevant.length > 0 && (
            <ul className="space-y-1.5">
              {relevant.map((c, i) => <Item key={`${c.airspace.id}-${i}`} c={c}/>)}
            </ul>
          )}
          {other.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Gliding sectors and other areas: {other.length}</summary>
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {other.map((c, i) => (
                  <li key={`${c.airspace.id}-${i}`}>
                    {nm(c.fromNm)}–{nm(c.toNm)} NM · {c.airspace.name}, {adviceFor(c.airspace).label.toLowerCase()} ({c.airspace.lower.label} – {c.airspace.upper.label}) · {STATUS_TEXT[c.status].toLowerCase()}
                    {c.airspace.activation ? ` · ${activationText(c.airspace.activation).toLowerCase().replace('.', '')}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {clear.length > 0 && (
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
      </p>
    </section>
  );
};

const Item: React.FC<{ c: AirspaceCheck }> = ({ c }) => {
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
    </li>
  );
};

export default AirspacePanel;
