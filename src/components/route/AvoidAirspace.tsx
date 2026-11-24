import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { type AvoidResult, HOLD_MARGIN_NM } from '../../lib/avoidAirspace';

const fmt = (n: number) => n.toLocaleString('en');

/**
 * "Go under: 2,000 ft" / "Go over: 5,500 ft": sets the cruise altitude to keep clear of an airspace,
 * or, with `onHold`, holds that altitude only where the route crosses it.
 */
const AvoidAirspace: React.FC<{
  options: AvoidResult[]; altitudeFt: number; onPick: (ft: number) => void;
  /** Where the route crosses it, NM, for holding only there. */
  range?: { fromNm: number; toNm: number };
  onHold?: (side: AvoidResult['side'], ft: number) => void;
}> = ({ options, altitudeFt, onPick, range, onHold }) => (
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
    {onHold && range && options.some(o => o.ft !== null && o.ft !== altitudeFt) && (
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-muted-foreground">Only here ({Math.max(0, Math.round(range.fromNm - HOLD_MARGIN_NM))}–{Math.round(range.toNm + HOLD_MARGIN_NM)} NM):</span>
        {options.filter(o => o.ft !== null && o.ft !== altitudeFt).map(o => (
          <Button key={o.side} type="button" size="sm" variant="outline" className="h-7 gap-1 bg-background px-2 text-xs text-foreground"
            onClick={() => onHold(o.side, o.ft as number)}>
            {o.side === 'under' ? <ArrowDown className="h-3.5 w-3.5"/> : <ArrowUp className="h-3.5 w-3.5"/>}
            {o.side} at {fmt(o.ft as number)} ft
          </Button>
        ))}
      </div>
    )}
    <p className="text-[11px] text-muted-foreground">
      {onHold && range ? '"Go" changes the cruise altitude for the whole route; "only here" just where it crosses this one, back to the cruise altitude after.'
        : 'Changes the cruise altitude for the whole route.'}
    </p>
  </div>
);

export default AvoidAirspace;
