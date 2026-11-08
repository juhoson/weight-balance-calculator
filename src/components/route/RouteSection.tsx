import React from 'react';
import { ArrowLeftRight, Crosshair, Loader2, RefreshCw } from 'lucide-react';
import AirportField from './AirportField';
import WeatherCard from './WeatherCard';
import { Button } from '../ui/Button';
import type { RouteWeatherState } from '../../lib/useRouteWeather';
import type { PlannedRoute } from '../../lib/route';

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
}

/** Departure and arrival, and the weather at both and along the way. */
const RouteSection: React.FC<RouteSectionProps> = ({
  route, onChange, weather, maxCrosswindKt, onUseLocation, locating, locationError, defaultNote,
}) => {
  const { data } = weather;
  const names = {
    from: data?.departure.code === route.from ? data.departure.name : undefined,
    to: data?.arrival.code === route.to ? data.arrival.name : undefined,
  };
  const set = (patch: Partial<PlannedRoute>) => onChange({ ...route, ...patch, auto: false });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <AirportField label="Departure" value={route.from} valueName={names.from}
          onChange={code => set({ from: code, to: route.to || code })}/>
        <Button type="button" variant="ghost" size="icon" className="mx-auto hidden sm:flex" aria-label="Swap departure and arrival"
          onClick={() => set({ from: route.to, to: route.from })}>
          <ArrowLeftRight className="h-4 w-4"/>
        </Button>
        <AirportField label="Arrival" value={route.to} valueName={names.to} onChange={code => set({ to: code })}/>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Button type="button" variant="outline" size="sm" onClick={onUseLocation} disabled={locating}>
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Crosshair className="mr-1 h-4 w-4"/>}
          Nearest airport
        </Button>
        {route.from && route.to && route.from !== route.to && (
          <Button type="button" variant="ghost" size="sm" className="sm:hidden" onClick={() => set({ from: route.to, to: route.from })}>
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
        <p className="text-sm">
          {data.departure.code === data.arrival.code
            ? <>Local flight from <strong>{data.departure.code}</strong>.</>
            : <><strong>{data.departure.code} → {data.arrival.code}</strong>: {Math.round(data.distanceNm)} NM,
              true course {String(Math.round(data.trueCourseDeg)).padStart(3, '0')}° (straight line).</>}
        </p>
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
            .filter(p => !(p.role === 'ARRIVAL' && data.departure.code === data.arrival.code))
            .map((p, i) => (
              <WeatherCard
                key={`${p.role}-${i}`}
                point={p}
                airport={p.role === 'DEPARTURE' ? data.departure : p.role === 'ARRIVAL' ? data.arrival : undefined}
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

export default RouteSection;
