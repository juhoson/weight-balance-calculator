import React from 'react';
import { cn } from '../lib/utils';

interface FuelTankProps {
  capacityL: number;
  startL: number;
  taxiL: number;
  tripL: number;
  reserveL: number;
  litersPerHour: number;
  powerSetting: string;
}

const pct = (v: number, of: number) => `${Math.max(0, Math.min(100, (v / of) * 100))}%`;

/**
 * The tank from empty (left) to full (right): what is left at landing, what the trip and taxi use,
 * and where the reserve line is.
 */
const FuelTank: React.FC<FuelTankProps> = ({ capacityL, startL, taxiL, tripL, reserveL, litersPerHour, powerSetting }) => {
  const remaining = Math.max(0, startL - taxiL - tripL);
  const trip = Math.min(tripL, Math.max(0, startL - taxiL));
  const taxi = Math.min(taxiL, startL);
  const short = remaining < reserveL;
  const enduranceMin = litersPerHour > 0 ? Math.floor((remaining / litersPerHour) * 60) : 0;

  return (
    <div>
      <div className="relative h-8 overflow-hidden rounded-md border border-border bg-muted" role="img"
        aria-label={`Fuel at landing ${remaining.toFixed(0)} of ${capacityL} litres, reserve ${reserveL} litres`}>
        <div className="flex h-full">
          <div className={cn('h-full', short ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: pct(remaining, capacityL) }}/>
          <div className="h-full bg-sky-400/70 [background-image:repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,.35)_6px_12px)]"
            style={{ width: pct(trip, capacityL) }}/>
          <div className="h-full bg-slate-400/70" style={{ width: pct(taxi, capacityL) }}/>
        </div>
        <div className="absolute inset-y-0 border-l-2 border-dashed border-foreground/70" style={{ left: pct(reserveL, capacityL) }}/>
      </div>
      <div className="relative mt-0.5 h-4 text-[10px] text-muted-foreground">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(reserveL, capacityL) }}>reserve {reserveL} L</span>
        <span className="absolute right-0">{capacityL} L</span>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <li className="flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-sm', short ? 'bg-red-500' : 'bg-emerald-500')}/>At landing {remaining.toFixed(1)} L</li>
        <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400/70"/>Trip {trip.toFixed(1)} L</li>
        <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400/70"/>Taxi {taxi.toFixed(1)} L</li>
      </ul>
      <p className={cn('mt-1.5 text-xs', short ? 'font-medium text-red-600' : 'text-muted-foreground')}>
        {short
          ? `${(reserveL - remaining).toFixed(1)} L short of the reserve at landing.`
          : `${(remaining - reserveL).toFixed(1)} L above the reserve`}
        {litersPerHour > 0 && ` · about ${Math.floor(enduranceMin / 60)} h ${String(enduranceMin % 60).padStart(2, '0')} min left at ${powerSetting}`}
      </p>
    </div>
  );
};

export default FuelTank;
