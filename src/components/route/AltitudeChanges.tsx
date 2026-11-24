import React from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import type { AltitudeHold } from '../../lib/enroute';
import { validAltitude } from '../../lib/useEnrouteForecast';

interface AltitudeChangesProps {
  holds: AltitudeHold[];
  onChange: (holds: AltitudeHold[]) => void;
  cruiseFt: number;
  totalNm: number;
  /** Holds the climb or descent can't reach in time at the pilot's rates. */
  missed: AltitudeHold[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');
const same = (a: AltitudeHold, b: AltitudeHold) => Math.abs(a.fromNm - b.fromNm) < 0.01 && Math.abs(a.toNm - b.toNm) < 0.01 && a.ft === b.ft;

/** Stretches of the route at another altitude than the cruise: add, change or remove them. */
const AltitudeChanges: React.FC<AltitudeChangesProps> = ({ holds, onChange, cruiseFt, totalNm, missed }) => {
  const set = (i: number, patch: Partial<AltitudeHold>) => onChange(holds.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const add = () => {
    const third = Math.round(totalNm / 3);
    onChange([...holds, { fromNm: third, toNm: Math.max(third + 1, Math.round((2 * totalNm) / 3)), ft: Math.max(1000, cruiseFt - 1000) }]);
  };
  return (
    <section className="space-y-1.5 rounded-md border border-border p-2 text-xs" aria-label="Altitude changes along the route">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Altitude changes along the route</h4>
        <div className="flex gap-1.5">
          {holds.length > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange([])}>Clear all</Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={add}>
            <Plus className="h-3.5 w-3.5"/> Add
          </Button>
        </div>
      </div>
      {holds.length === 0 ? (
        <p className="text-muted-foreground">
          All of it at {fmt(cruiseFt)} ft. Add a stretch at another altitude here, or use &quot;only here&quot; on an airspace to go under or over just it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {holds.map((h, i) => (
            <li key={i} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
                <span className="w-20"><NumberInput aria-label={`Change ${i + 1} from NM`} value={Math.round(h.fromNm)} step={1} unit="NM"
                  onChange={v => set(i, { fromNm: Math.max(0, v) })}/></span>
                <span>to</span>
                <span className="w-20"><NumberInput aria-label={`Change ${i + 1} to NM`} value={Math.round(h.toNm)} step={1} unit="NM"
                  onChange={v => set(i, { toNm: Math.min(totalNm, v) })}/></span>
                <span>at</span>
                <span className="w-28"><NumberInput aria-label={`Change ${i + 1} altitude`} value={h.ft} step={500} unit="ft"
                  onChange={v => set(i, { ft: v })}/></span>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Remove change ${i + 1}`}
                  onClick={() => onChange(holds.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5"/>
                </Button>
                {h.note && <span className="text-muted-foreground">{h.note}</span>}
              </div>
              {!validAltitude(h.ft) && <p className="text-red-600">Between 500 and 18,000 ft.</p>}
              {missed.some(m => same(m, h)) && (
                <p className="flex gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0"/>
                  Can&apos;t be at {fmt(h.ft)} ft by {Math.round(h.fromNm)} NM at your climb and descent rates: the path is steeper there than you can fly.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {holds.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          The descent into each one ends where it starts and the climb out starts where it ends; the rest is at {fmt(cruiseFt)} ft, unless
          there&apos;s too little room to get back up in between. Each stretch is flown in the forecast wind at its own altitude.
        </p>
      )}
    </section>
  );
};

export default AltitudeChanges;
