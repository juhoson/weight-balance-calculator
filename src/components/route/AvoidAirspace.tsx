import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../ui/Button';
import type { AvoidResult } from '../../lib/avoidAirspace';

const fmt = (n: number) => n.toLocaleString('en');

/** "Go under: 2,000 ft" / "Go over: 5,500 ft": sets the cruise altitude to keep clear of an airspace. */
const AvoidAirspace: React.FC<{ options: AvoidResult[]; altitudeFt: number; onPick: (ft: number) => void }> = ({
  options, altitudeFt, onPick,
}) => (
  <div className="mt-1 space-y-0.5" onPointerUp={e => e.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">Avoid it:</span>
      {options.map(o => (
        <Button key={o.side} type="button" size="sm" variant="outline" className="h-7 gap-1 bg-background px-2 text-xs text-foreground"
          disabled={o.ft === null || o.ft === altitudeFt}
          onClick={() => { if (o.ft !== null) onPick(o.ft); }}>
          {o.side === 'under' ? <ArrowDown className="h-3.5 w-3.5"/> : <ArrowUp className="h-3.5 w-3.5"/>}
          {o.ft === null ? `No way ${o.side}` : `Go ${o.side}: ${fmt(o.ft)} ft`}
        </Button>
      ))}
    </div>
    <ul className="text-[11px] leading-snug text-muted-foreground">
      {options.map(o => (
        <li key={o.side}>
          <span className="font-medium">{o.side === 'under' ? 'Under' : 'Over'}:</span> {o.why}
          {o.ft !== null && o.ft === altitudeFt && ' That is the cruise altitude now.'}
          {o.stillInside && <span className="text-amber-700 dark:text-amber-300"> The climb or descent still passes through it.</span>}
          {o.alsoEnters.length > 0 && <span className="text-amber-700 dark:text-amber-300"> Enters {o.alsoEnters.join(', ')} instead.</span>}
        </li>
      ))}
    </ul>
    <p className="text-[11px] text-muted-foreground">Changes the cruise altitude for the whole route.</p>
  </div>
);

export default AvoidAirspace;
