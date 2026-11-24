import React from 'react';
import { Loader2, Sparkles, Wind } from 'lucide-react';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import type { AltitudeOption, Suggestions } from '../../lib/suggestAltitude';
import { MAX_ALTITUDE_FT, SUGGEST_FROM_FT, validSuggestMax } from '../../lib/useEnrouteForecast';

interface AltitudeSuggestionsProps {
  /** Null while the altitudes are being compared. */
  suggestions: Suggestions | null;
  altitudeFt: number;
  /** The flight time at the cruise altitude now, to compare with. */
  currentMinutes: number;
  maxFt: number;
  onMaxChange: (ft: number) => void;
  onPick: (ft: number) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');
const hm = (m: number) => `${Math.floor(Math.round(m) / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;

function versusNow(o: AltitudeOption, currentMinutes: number): string {
  const d = Math.round(o.minutes - currentMinutes);
  return d === 0 ? 'same time as now' : d < 0 ? `${-d} min faster` : `${d} min slower`;
}

function windText(kt: number): string {
  const r = Math.round(kt);
  return r === 0 ? 'no wind on average' : r > 0 ? `tailwind ${r} kt` : `headwind ${-r} kt`;
}

const Row: React.FC<{ o: AltitudeOption; label?: string; altitudeFt: number; currentMinutes: number; onPick: (ft: number) => void }> = ({
  o, label, altitudeFt, currentMinutes, onPick,
}) => {
  const now = o.ft === altitudeFt;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
      <div className="min-w-0 text-xs">
        <p>
          {label && <span className="mr-1 font-medium text-sky-700 dark:text-sky-300">{label}:</span>}
          <span className="font-semibold tabular-nums">{fmt(o.ft)} ft</span>
          <span className="tabular-nums"> · {hm(o.minutes)}{now ? ' (now)' : ` (${versusNow(o, currentMinutes)})`} · {windText(o.windKt)}</span>
        </p>
        <p className="text-muted-foreground">
          {o.belowCloudFt === null ? 'No cloud base forecast' : `${fmt(o.belowCloudFt)} ft below the lowest cloud base`}
          {' · '}{o.enters.length ? <span className="text-amber-700 dark:text-amber-300">enters {o.enters.join(', ')}</span> : 'no other airspace to call or ask'}
          {o.notLevelOn.length > 0 && <span className="text-amber-700 dark:text-amber-300"> · not a cruising level on {o.notLevelOn.join(', ')}</span>}
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" className="h-7 bg-background px-2 text-xs text-foreground" disabled={now}
        aria-label={`Use ${fmt(o.ft)} ft`} onClick={() => onPick(o.ft)}>
        {now ? 'In use' : 'Use'}
      </Button>
    </li>
  );
};

/** The cruise altitudes worth flying, compared in each one's own forecast, and the one with the best wind. */
const AltitudeSuggestions: React.FC<AltitudeSuggestionsProps> = ({ suggestions, altitudeFt, currentMinutes, maxFt, onMaxChange, onPick }) => {
  const s = suggestions;
  const windsAlsoSuggested = !!s?.bestWinds && s.suggested.some(o => o.ft === s.bestWinds?.ft);
  return (
    <section className="space-y-1.5 rounded-md border border-border p-2" aria-label="Suggested cruise altitudes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5"/> Suggested cruise altitudes</h4>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          up to
          <span className="w-28"><NumberInput aria-label="Highest altitude to suggest" value={maxFt} step={500} unit="ft" onChange={onMaxChange}/></span>
        </label>
      </div>
      {!validSuggestMax(maxFt) && <p className="text-xs text-red-600">Between {fmt(SUGGEST_FROM_FT + 500)} and {fmt(MAX_ALTITUDE_FT)} ft.</p>}
      {validSuggestMax(maxFt) && !s && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/> Comparing altitudes…</p>
      )}
      {s && s.bestWinds && (
        <ul className="divide-y divide-border">
          {!windsAlsoSuggested && (
            <Row o={s.bestWinds} label="Most favourable wind" altitudeFt={altitudeFt} currentMinutes={currentMinutes} onPick={onPick}/>
          )}
          {s.suggested.map((o, i) => (
            <Row key={o.ft} o={o} altitudeFt={altitudeFt} currentMinutes={currentMinutes} onPick={onPick}
              label={o.ft === s.bestWinds?.ft ? (i === 0 ? 'Best, and the most favourable wind' : 'Most favourable wind') : i === 0 ? 'Best' : undefined}/>
          ))}
        </ul>
      )}
      {s && !s.bestWinds && (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
          {s.options.length
            ? `No altitude from ${fmt(SUGGEST_FROM_FT)} to ${fmt(maxFt)} ft keeps clear of cloud, icing and terrain the whole way. Consider another time or route.`
            : `No altitude from ${fmt(SUGGEST_FROM_FT)} to ${fmt(maxFt)} ft can be reached and flown on this route.`}
        </p>
      )}
      {s && s.common.length > 0 && (
        <p className="text-[11px] text-muted-foreground">At every altitude the flight enters {s.common.join(', ')}.</p>
      )}
      <p className="flex gap-1 text-[11px] text-muted-foreground">
        <Wind className="mt-0.5 h-3 w-3 shrink-0"/>
        <span>
          Each altitude in its own forecast wind, with the same climb and descent. Best: clear of cloud, icing and terrain, then the least
          airspace to call or ask for, then the fastest. More than 3,000 ft above the ground, only the VFR cruising levels for the course.
        </span>
      </p>
    </section>
  );
};

export default AltitudeSuggestions;
