import React from 'react';
import {CloudOff, Sparkles} from 'lucide-react';
import type {AircraftCatalog} from '../lib/useAircraftCatalog';
import type {AircraftMeta} from '../lib/aircraftCatalog';

interface AircraftSourceNoticeProps {
    catalog: AircraftCatalog;
    selectedMeta?: AircraftMeta;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
};

/** Where the aircraft list came from, and anything to know about the selected aircraft's data. */
const AircraftSourceNotice: React.FC<AircraftSourceNoticeProps> = ({catalog, selectedMeta}) => {
  const lines: React.ReactNode[] = [];

  if (catalog.source === 'cache' && !catalog.loading) {
    lines.push(
      <p key="source" className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
        <CloudOff className="h-3.5 w-3.5 shrink-0"/>
        Offline: using aircraft data saved {catalog.savedAt ? formatDate(catalog.savedAt) : 'earlier'}.
      </p>
    );
  } else if (catalog.source === 'builtin' && !catalog.loading) {
    lines.push(
      <p key="source" className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
        <CloudOff className="h-3.5 w-3.5 shrink-0"/>
        Offline: using the built-in generic aircraft. Your own and club aircraft are not available.
      </p>
    );
  }
  if (catalog.skipped.length > 0) {
    lines.push(
      <p key="skipped" className="text-amber-700 dark:text-amber-300">
        Not shown because their data is incomplete: {catalog.skipped.join(', ')}.
      </p>
    );
  }
  if (selectedMeta?.typeStatus === 'AI_SUGGESTED') {
    lines.push(
      <p key="ai" className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
        <Sparkles className="h-3.5 w-3.5 shrink-0"/>
        This aircraft uses AI-suggested type values that nobody has verified. Check them against the POH.
      </p>
    );
  }
  if (selectedMeta?.kind === 'airframe' && selectedMeta.weighedOn) {
    lines.push(
      <p key="weighed" className="text-muted-foreground">
        Empty weight from the weighing of {formatDate(selectedMeta.weighedOn)}.
      </p>
    );
  }

  if (lines.length === 0) return null;
  return <div className="mt-1 space-y-0.5 text-xs" role="status">{lines}</div>;
};

export default AircraftSourceNotice;
