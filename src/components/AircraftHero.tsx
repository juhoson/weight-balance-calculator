import React from 'react';
import { ChevronDown, Plane } from 'lucide-react';
import type { AircraftData } from '../data/aircraftData';
import type { AircraftMeta } from '../lib/aircraftCatalog';
import { photoFor } from '../data/aircraftImages';

interface AircraftHeroProps {
  aircraft: AircraftData;
  meta?: AircraftMeta;
}

const Badge: React.FC<{ children: React.ReactNode; tone?: 'default' | 'amber' }> = ({ children, tone = 'default' }) => (
  <span className={tone === 'amber'
    ? 'rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-semibold text-amber-950'
    : 'rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/30 backdrop-blur'}>
    {children}
  </span>
);

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="truncate text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm font-semibold tabular-nums">{value}</dd>
  </div>
);

/** The selected aircraft: photo, name, where it comes from, and its main limits. */
const AircraftHero: React.FC<AircraftHeroProps> = ({ aircraft, meta }) => {
  const [showSpecs, setShowSpecs] = React.useState(false);
  const isGeneric = meta?.kind === 'generic';
  const photo = meta ? photoFor(meta.code, meta.kind === 'airframe' ? meta.registration : null) : null;
  const title = meta?.kind === 'airframe' ? meta.registration : meta?.label ?? aircraft.type;
  const subtitle = meta?.kind === 'airframe' ? meta.model : 'Generic model';
  const p = aircraft.performance;
  const unit = p.speedUnit === 'MPH' ? 'mph' : 'kt';

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label="Selected aircraft">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-sky-700 to-slate-900 sm:aspect-[21/9]">
        {photo
          ? <img key={photo.src} src={photo.src} alt="" className="absolute inset-0 h-full w-full object-cover"/>
          : <Plane className="absolute right-6 top-6 h-24 w-24 -rotate-12 text-white/10"/>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"/>
        <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {isGeneric && <Badge>Generic</Badge>}
            {meta?.kind === 'airframe' && meta.club && <Badge>{meta.club}</Badge>}
            {meta?.kind === 'airframe' && meta.owned && <Badge>Your aircraft</Badge>}
            {meta?.typeStatus === 'AI_SUGGESTED' && <Badge tone="amber">AI-suggested values</Badge>}
          </div>
          <h2 className="text-2xl font-bold tracking-tight drop-shadow sm:text-3xl">{title}</h2>
          <p className="text-sm text-white/80">{subtitle}</p>
        </div>
        {photo?.credit && (
          <a
            href={photo.credit.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur hover:text-white"
            title={`Photo: ${photo.credit.author}, ${photo.credit.license}, via Wikimedia Commons`}
          >
            Photo: {photo.credit.author} · {photo.credit.license}
          </a>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 sm:p-5">
        <Stat label={isGeneric ? 'Empty weight (yours)' : 'Empty weight'} value={`${aircraft.basicEmptyWeight} kg`}/>
        <Stat label="Max takeoff" value={`${aircraft.mtow} kg`}/>
        <Stat label="Max fuel" value={`${aircraft.stations.fuel.maxLiters} L`}/>
        <Stat label="Max baggage" value={`${aircraft.maxBaggage} kg`}/>
      </dl>

      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setShowSpecs(s => !s)}
          aria-expanded={showSpecs}
          className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground sm:px-5"
        >
          Speeds and limits
          <ChevronDown className={`h-4 w-4 transition-transform ${showSpecs ? 'rotate-180' : ''}`}/>
        </button>
        {showSpecs && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 sm:grid-cols-4 sm:px-5">
            <Stat label="Best climb" value={`${p.bestClimbSpeed} ${unit}`}/>
            {p.bestGlideSpeed !== undefined && <Stat label="Best glide" value={`${p.bestGlideSpeed} ${unit}`}/>}
            <Stat label="Approach" value={`${p.approachSpeedNormal} ${unit}`}/>
            <Stat label="Stall clean" value={`${p.stallSpeedClean} ${unit}`}/>
            <Stat label="Stall landing" value={`${p.stallSpeedLanding} ${unit}`}/>
            <Stat label="Max crosswind" value={`${p.maxDemoCrosswind} kt`}/>
            <Stat label="CG range" value={`${aircraft.envelope.limits.forwardCG}–${aircraft.envelope.limits.aftCG} m`}/>
            <Stat label="Reserve" value={`${p.reserveFuel.recommendedLiters} L`}/>
          </dl>
        )}
      </div>
    </section>
  );
};

export default AircraftHero;
