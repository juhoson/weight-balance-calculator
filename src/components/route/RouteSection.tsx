import React from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Crosshair, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import AirportField from './AirportField';
import WeatherCard from './WeatherCard';
import SavedRoutesButton from './SavedRoutesDialog';
import { Button } from '../ui/Button';
import type { RouteWeatherState } from '../../lib/useRouteWeather';
import type { PlannedRoute } from '../../lib/route';
import type { AirportInfo } from '../../types/route';

/** A route may have at most this many waypoints (the backend allows 18). */
const MAX_WAYPOINTS = 8;

interface RouteSectionProps {
  route: PlannedRoute;
  onChange: (route: PlannedRoute) => void;
  weather: RouteWeatherState;
  maxCrosswindKt: number;
  onUseLocation: () => void;
  locating: boolean;
  locationError: string | null;
  /** Where the departure default came from, e.g. "Västerås Flygklubb's home airfield". */
  defaultNote: string | null;
  signedIn: boolean;
}

const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');

/** Departure, waypoints and arrival, and the weather at each and along the way. */
const RouteSection: React.FC<RouteSectionProps> = ({
  route, onChange, weather, maxCrosswindKt, onUseLocation, locating, locationError, defaultNote, signedIn,
}) => {
  const { data } = weather;
  const known = React.useMemo(() => {
    const m = new Map<string, AirportInfo>();
    if (data) [data.departure, ...(data.waypoints ?? []), data.arrival].forEach(a => m.set(a.code, a));
    return m;
  }, [data]);
  const set = (patch: Partial<PlannedRoute>) => onChange({ ...route, ...patch, auto: false });
  const setVia = (via: string[]) => set({ via });
  const move = (i: number, by: number) => {
    const via = [...route.via];
    const [code] = via.splice(i, 1);
    via.splice(i + by, 0, code);
    setVia(via);
  };
  const isLocal = data && data.distanceNm === 0;
  const legs = data?.legs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Departure, optional waypoints and arrival.</p>
        {signedIn && <SavedRoutesButton route={route} onLoad={onChange}/>}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <AirportField label="Departure" value={route.from} valueName={known.get(route.from)?.name}
            onChange={code => set({ from: code, to: route.to || code })}/>
          <Button type="button" variant="ghost" size="icon" className="mx-auto hidden sm:flex" aria-label="Swap departure and arrival"
            onClick={() => set({ from: route.to, to: route.from, via: [...route.via].reverse() })}>
            <ArrowLeftRight className="h-4 w-4"/>
          </Button>
          <AirportField label="Arrival" value={route.to} valueName={known.get(route.to)?.name} onChange={code => set({ to: code })}/>
        </div>

        {route.via.length > 0 && (
          <ol className="space-y-2 border-l-2 border-dashed border-border pl-3">
            {route.via.map((code, i) => (
              <li key={`${code}-${i}`} className="flex items-end gap-1">
                <div className="flex-1">
                  <AirportField label={`Waypoint ${i + 1}`} value={code} valueName={known.get(code)?.name}
                    onChange={c => setVia(route.via.map((v, j) => (j === i ? c : v)))}/>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move waypoint ${i + 1} up`}
                  disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4"/></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move waypoint ${i + 1} down`}
                  disabled={i === route.via.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4"/></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove waypoint ${i + 1}`}
                  onClick={() => setVia(route.via.filter((_, j) => j !== i))}><X className="h-4 w-4"/></Button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <AddWaypoint disabled={!route.from || route.via.length >= MAX_WAYPOINTS} onAdd={code => setVia([...route.via, code])}/>
        <Button type="button" variant="outline" size="sm" onClick={onUseLocation} disabled={locating}>
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Crosshair className="mr-1 h-4 w-4"/>}
          Nearest airport
        </Button>
        {route.from && route.to && route.from !== route.to && (
          <Button type="button" variant="ghost" size="sm" className="sm:hidden"
            onClick={() => set({ from: route.to, to: route.from, via: [...route.via].reverse() })}>
            <ArrowLeftRight className="mr-1 h-4 w-4"/> Swap
          </Button>
        )}
        {route.from && route.to && (
          <Button type="button" variant="ghost" size="sm" onClick={weather.refresh} disabled={weather.loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${weather.loading ? 'animate-spin' : ''}`}/> Refresh weather
          </Button>
        )}
        {defaultNote && route.auto && <span>{defaultNote}</span>}
        {locationError && <span className="text-red-600">{locationError}</span>}
      </div>

      {data && (
        isLocal
          ? <p className="text-sm">Local flight from <strong>{data.departure.code}</strong>.</p>
          : (
            <div className="text-sm">
              <p>
                <strong>{[data.departure.code, ...(data.waypoints ?? []).map(w => w.code), data.arrival.code].join(' → ')}</strong>:
                {' '}{Math.round(data.distanceNm)} NM (straight legs)
              </p>
              {legs.length > 1
                ? (
                  <ul className="mt-1 grid gap-x-4 text-xs text-muted-foreground sm:grid-cols-2">
                    {legs.map((l, i) => (
                      <li key={i} className="tabular-nums">{l.from} → {l.to}: {Math.round(l.distanceNm)} NM, {pad3(l.trueCourseDeg)}° true</li>
                    ))}
                  </ul>
                )
                : <p className="text-xs text-muted-foreground">True course {pad3(data.trueCourseDeg)}°</p>}
            </div>
          )
      )}
      {weather.error && <p className="text-sm text-red-600" role="alert">{weather.error}</p>}
      {data && !data.weatherAvailable && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
          The weather service could not be reached. Try again in a minute, or check the weather elsewhere.
        </p>
      )}
      {weather.loading && !data && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading weather…</p>
      )}

      {data && data.weatherAvailable && (
        <div className="space-y-2">
          {data.points
            .filter(p => !(p.role === 'ARRIVAL' && isLocal))
            .map((p, i) => (
              <WeatherCard
                key={`${p.role}-${i}`}
                point={p}
                airport={p.airportCode ? known.get(p.airportCode)
                  : p.role === 'DEPARTURE' ? data.departure : p.role === 'ARRIVAL' ? data.arrival : undefined}
                maxCrosswindKt={maxCrosswindKt}
              />
            ))}
          <p className="text-[11px] text-muted-foreground">
            Weather from aviationweather.gov (NOAA). For planning only - get an official briefing before flight.
          </p>
        </div>
      )}
    </div>
  );
};

/** "Add waypoint": opens an airport field; picking an airport adds it before the arrival. */
const AddWaypoint: React.FC<{ disabled: boolean; onAdd: (code: string) => void }> = ({ disabled, onAdd }) => {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4"/> Add waypoint
      </Button>
    );
  }
  return (
    <div className="flex w-full items-end gap-1 sm:w-80">
      <div className="flex-1">
        <AirportField label="New waypoint" value="" onChange={code => { onAdd(code); setOpen(false); }}/>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="Cancel adding a waypoint" onClick={() => setOpen(false)}>
        <X className="h-4 w-4"/>
      </Button>
    </div>
  );
};

export default RouteSection;
