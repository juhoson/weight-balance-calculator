import React from 'react';
import { Loader2, Users } from 'lucide-react';
import type { AircraftCatalog } from '../lib/useAircraftCatalog';
import { urlWithoutClub } from '../lib/clubLink';

/** Shown when the page was opened from a club's link (?club=vfk): whose aircraft these are, and the way out. */
const ClubLinkBanner: React.FC<{ code: string; catalog: AircraftCatalog }> = ({ code, catalog }) => {
  let club: string | null = null;
  for (const m of Object.values(catalog.meta)) if (m.kind === 'airframe' && m.club) { club = m.club; break; }
  const notFound = catalog.source === 'database' && !club;
  const failed = !club && !notFound && !catalog.loading;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3" role="status">
      <Users className="h-5 w-5 shrink-0 text-primary"/>
      <p className="min-w-0 flex-1 text-sm">
        {club && <>Showing <strong>{club}</strong>&apos;s aircraft</>}
        {notFound && <>No club called <span className="font-mono">{code}</span> was found; showing the generic aircraft.</>}
        {failed && <>Could not load the club&apos;s aircraft{catalog.error ? `: ${catalog.error}` : '.'}</>}
        {!club && !notFound && !failed && <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Loading the club&apos;s aircraft…</span>}
      </p>
      <a href={urlWithoutClub()} className="text-sm font-medium text-primary underline-offset-2 hover:underline">Show all aircraft</a>
    </div>
  );
};

export default ClubLinkBanner;
