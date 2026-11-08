import React from 'react';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Check, ChevronsUpDown, Plane, Search } from 'lucide-react';
import type { AircraftMeta } from '../lib/aircraftCatalog';
import { describe, groupKeys, matchesQuery } from '../lib/aircraftGroups';
import { photoFor } from '../data/aircraftImages';
import { cn } from '../lib/utils';

interface AircraftPickerProps {
  keys: string[];
  meta: Record<string, AircraftMeta>;
  value: string;
  onChange: (key: string) => void;
}

const Thumb: React.FC<{ meta?: AircraftMeta; className?: string }> = ({ meta, className }) => {
  const photo = meta ? photoFor(meta.code, meta.kind === 'airframe' ? meta.registration : null) : null;
  return (
    <span className={cn('flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted', className)}>
      {photo
        ? <img src={photo.src} alt="" loading="lazy" className="h-full w-full object-cover"/>
        : <Plane className="h-4 w-4 text-muted-foreground"/>}
    </span>
  );
};

/** Searchable aircraft list, grouped by generic / own / club. Search by registration, model or club. */
const AircraftPicker: React.FC<AircraftPickerProps> = ({ keys, meta, value, onChange }) => {
  const [query, setQuery] = React.useState('');
  const groups = React.useMemo(() => {
    const filtered = keys.filter(k => matchesQuery(k, meta[k], query));
    return groupKeys(filtered, meta);
  }, [keys, meta, query]);
  const count = groups.reduce((n, g) => n + g.keys.length, 0);

  return (
    <Combobox
      value={value}
      onChange={(key: string | null) => key && onChange(key)}
      onClose={() => setQuery('')}
      immediate
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <ComboboxInput
          aria-label="Aircraft"
          className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-10 text-sm font-medium shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          displayValue={(key: string) => {
            const m = meta[key];
            if (!m) return key;
            return m.kind === 'airframe' ? `${m.registration} — ${m.model}` : `${m.label} (generic)`;
          }}
          placeholder="Search registration, model or club"
          onChange={e => setQuery(e.target.value)}
          onFocus={e => e.target.select()}
        />
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground" aria-label="Show all aircraft">
          <ChevronsUpDown className="h-4 w-4"/>
        </ComboboxButton>
      </div>

      <ComboboxOptions
        anchor={{ to: 'bottom start', gap: 6 }}
        className="z-50 max-h-[min(28rem,70vh)] w-[var(--input-width)] min-w-[18rem] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl [--anchor-max-height:70vh] empty:invisible"
      >
        {count === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No aircraft match “{query}”.</p>
        )}
        {groups.map(group => (
          <div key={group.title} role="group" aria-label={group.title}>
            <div className="sticky top-0 z-10 bg-popover/95 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
              {group.title} <span className="font-normal normal-case">· {group.keys.length}</span>
            </div>
            {group.keys.map(key => {
              const d = describe(key, meta[key]);
              return (
                <ComboboxOption
                  key={key}
                  value={key}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 data-[focus]:bg-accent data-[selected]:bg-primary/10"
                >
                  <Thumb meta={meta[key]}/>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{d.subtitle}</span>
                  </span>
                  <Check className="invisible h-4 w-4 text-primary group-data-[selected]:visible"/>
                </ComboboxOption>
              );
            })}
          </div>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
};

export default AircraftPicker;
