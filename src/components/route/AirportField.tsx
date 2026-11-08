import React from 'react';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Loader2, MapPin } from 'lucide-react';
import { searchAirports } from '../../api/backend';
import type { AirportInfo } from '../../types/route';

interface AirportFieldProps {
  label: string;
  /** ICAO code, or '' when none chosen. */
  value: string;
  /** Name shown next to the code once known. */
  valueName?: string;
  onChange: (code: string, airport: AirportInfo | null) => void;
}

/** Type a code, name or town; the server searches all open airports. */
const AirportField: React.FC<AirportFieldProps> = ({ label, value, valueName, onChange }) => {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<AirportInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchAirports(q)
        .then(list => { if (!cancelled) setResults(list); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Combobox
        value={value || null}
        onChange={(code: string | null) => {
          if (!code) return;
          onChange(code, results.find(a => a.code === code) ?? null);
        }}
        onClose={() => setQuery('')}
      >
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <ComboboxInput
            id={id}
            aria-label={label}
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            displayValue={(code: string | null) => (code ? (valueName ? `${code} · ${valueName}` : code) : '')}
            placeholder="ICAO, name or town"
            onChange={e => setQuery(e.target.value)}
            onFocus={e => e.target.select()}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"/>}
        </div>
        <ComboboxOptions
          anchor={{ to: 'bottom start', gap: 6 }}
          className="z-50 max-h-80 w-[var(--input-width)] min-w-[16rem] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl empty:invisible"
        >
          {results.map(a => (
            <ComboboxOption
              key={a.code}
              value={a.code}
              className="flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 data-[focus]:bg-accent"
            >
              <span className="w-12 shrink-0 font-mono text-sm font-semibold">{a.code}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[a.municipality, a.country].filter(Boolean).join(', ')}
                </span>
              </span>
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>
    </div>
  );
};

export default AirportField;
