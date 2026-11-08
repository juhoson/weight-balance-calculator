import React from 'react';
import { AlertTriangle, CheckCircle2, Fuel, XCircle } from 'lucide-react';
import type { AircraftData } from '../data/aircraftData';
import CGEnvelopeVisualization from './CGEnvelopeVisualization';
import PrintButton from './PrintButton';
import { cn } from '../lib/utils';

export interface LoadResult {
  totalWeight: number;
  cg: number;
  isWithinLimits: boolean;
}

export interface CalculationSummary {
  takeoff: LoadResult;
  landing: LoadResult & { fuelRemaining: number; hasMinimumReserve: boolean };
}

export type Verdict = 'ok' | 'reserve' | 'limits';

export function verdictOf(r: CalculationSummary): Verdict {
  if (!r.takeoff.isWithinLimits || !r.landing.isWithinLimits) return 'limits';
  if (!r.landing.hasMinimumReserve) return 'reserve';
  return 'ok';
}

export const VERDICT_TEXT: Record<Verdict, { title: string; detail: string }> = {
  ok: { title: 'Within limits', detail: 'Takeoff and landing are inside the CG envelope, with reserve fuel.' },
  reserve: { title: 'Fuel reserve too low', detail: 'Weight and balance are within limits, but you land below the reserve.' },
  limits: { title: 'Outside limits', detail: 'The aircraft is outside its weight and balance envelope. Do not fly this loading.' },
};

export const verdictStyles: Record<Verdict, string> = {
  ok: 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  reserve: 'border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100',
  limits: 'border-red-500/50 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
};

export const VerdictIcon: React.FC<{ verdict: Verdict; className?: string }> = ({ verdict, className }) => {
  if (verdict === 'ok') return <CheckCircle2 className={cn('text-emerald-600', className)}/>;
  if (verdict === 'reserve') return <AlertTriangle className={cn('text-amber-600', className)}/>;
  return <XCircle className={cn('text-red-600', className)}/>;
};

const Phase: React.FC<{ title: string; result: LoadResult; aircraft: AircraftData }> = ({ title, result, aircraft }) => {
  const pct = Math.min(100, (result.totalWeight / aircraft.mtow) * 100);
  const margin = aircraft.mtow - result.totalWeight;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className={cn('text-xs font-semibold', result.isWithinLimits ? 'text-emerald-600' : 'text-red-600')}>
          {result.isWithinLimits ? 'Within limits' : 'Exceeds limits'}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums">{result.totalWeight.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">kg</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn('h-full rounded-full', margin < 0 ? 'bg-red-500' : 'bg-primary')} style={{ width: `${pct}%` }}/>
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {margin >= 0 ? `${margin.toFixed(1)} kg below MTOW` : `${(-margin).toFixed(1)} kg over MTOW`}
      </p>
      <p className="mt-2 text-sm tabular-nums">
        CG <span className="font-semibold">{result.cg.toFixed(3)} m</span>
        <span className="text-xs text-muted-foreground"> ({aircraft.envelope.limits.forwardCG}–{aircraft.envelope.limits.aftCG})</span>
      </p>
    </div>
  );
};

interface ResultsPanelProps {
  results: CalculationSummary | null;
  aircraft: AircraftData;
  fuelAmount: number;
  fuelUnit: 'liters' | 'kg';
  tripFuel: number;
}

/** The outcome: overall verdict, takeoff and landing figures, the CG envelope and the fuel plan. */
const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, aircraft, fuelAmount, fuelUnit, tripFuel }) => {
  const verdict = results ? verdictOf(results) : null;
  const reserve = aircraft.performance.reserveFuel.recommendedLiters;
  return (
    <section id="results" aria-label="Results" className="space-y-4 scroll-mt-4">
      {results && verdict && (
        <div className={cn('flex items-start gap-3 rounded-xl border p-4', verdictStyles[verdict])} role="status">
          <VerdictIcon verdict={verdict} className="mt-0.5 h-6 w-6 shrink-0"/>
          <div>
            <p className="text-lg font-bold leading-tight">{VERDICT_TEXT[verdict].title}</p>
            <p className="text-sm opacity-90">{VERDICT_TEXT[verdict].detail}</p>
          </div>
        </div>
      )}

      {results && (
        <div className="grid grid-cols-2 gap-3">
          <Phase title="Takeoff" result={results.takeoff} aircraft={aircraft}/>
          <Phase title="Landing" result={results.landing} aircraft={aircraft}/>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <h3 className="px-1 pb-1 text-sm font-semibold">
          CG envelope <span className="font-normal text-muted-foreground">· weight (kg) against CG (m aft of datum)</span>
        </h3>
        <CGEnvelopeVisualization
          height={300}
          envelopePoints={aircraft.envelope.points}
          takeoffPoint={results ? { cg: results.takeoff.cg, weight: results.takeoff.totalWeight } : undefined}
          landingPoint={results ? { cg: results.landing.cg, weight: results.landing.totalWeight } : undefined}
          limits={aircraft.envelope.limits}
        />
      </div>

      {results && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Fuel className="h-4 w-4"/> Fuel plan</h3>
          <dl className="space-y-1 text-sm tabular-nums">
            {[
              ['Starting fuel', `${fuelAmount.toFixed(1)} ${fuelUnit === 'liters' ? 'L' : 'kg'}`],
              ['Taxi', `${aircraft.performance.taxiFuel.liters.toFixed(1)} L`],
              ['Trip', `${tripFuel.toFixed(1)} L`],
              ['Reserve required', `${reserve} L`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>At landing</dt>
              <dd className={results.landing.hasMinimumReserve ? '' : 'text-red-600'}>
                {results.landing.fuelRemaining.toFixed(1)} L
              </dd>
            </div>
          </dl>
        </div>
      )}

      <PrintButton disabled={!results}/>
    </section>
  );
};

export default ResultsPanel;
