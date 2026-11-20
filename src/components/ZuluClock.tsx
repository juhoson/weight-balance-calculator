import React from 'react';
import { Clock } from 'lucide-react';
import { useNow } from '../lib/useNow';

const two = (n: number) => String(n).padStart(2, '0');

/** Current UTC time, as METARs, TAFs and NOTAMs use it. */
const ZuluClock: React.FC = () => {
  const now = new Date(useNow(1000));
  const zulu = `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())}Z`;
  const local = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1" title={`UTC (Zulu). Local time ${local}.`}>
      <Clock className="h-3.5 w-3.5 text-muted-foreground"/>
      <span className="font-mono text-sm font-semibold tabular-nums" aria-label="UTC time">{zulu}</span>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">· local {local}</span>
    </div>
  );
};

export default ZuluClock;
