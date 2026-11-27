import React from 'react';
import { departureClimb } from '../../lib/departure';
import type { ArrivalPlan, RunwayEnd } from '../../lib/arrival';
import { ArrowDown, ArrowLeftRight, ArrowUp, Crosshair, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import AirportField from './AirportField';
import WeatherCard from './WeatherCard';
import SavedRoutesButton from './SavedRoutesDialog';
import ImportFlightPlanButton, { MAX_IMPORTED_WAYPOINTS } from './ImportFlightPlanDialog';
import { Button } from '../ui/Button';
import Curtain from '../ui/Curtain';
import { stationOf, weatherAlong } from '../../lib/weatherAlong';
import { lazyWithReload } from '../../lib/lazyWithReload';
import type { RouteWeatherState } from '../../lib/useRouteWeather';
import type { PlannedRoute, RouteAltitudes } from '../../lib/route';
import type { AirportInfo, RoutePoint } from '../../types/route';
import { positionText, routeChain, routeLabels } from '../../lib/routePoint';
import { extraNm, suggestReportingPoints } from '../../lib/reportingRoute';

// Leaflet (~150 kB) loads only once there is a route to show.
const RouteMap = lazyWithReload(() => import('./RouteMap'));

/** A route may have at most this many waypoints (the backend's limit). */
const MAX_WAYPOINTS = MAX_IMPORTED_WAYPOINTS;

interface RouteSectionProps {
  /** The aircraft's climb (ft/min) at Vy (kt), for the climb-out drawn on the map. */
  climb?: { fpm: number; kt: number } | null;
  route: PlannedRoute;
  onChange: (route: PlannedRoute) => void;
  /** Saved with a route, and given back when one is loaded. */
  altitudes?: RouteAltitudes;
  onLoad?: (route: PlannedRoute, altitudes?: RouteAltitudes) => void;
  weather: RouteWeatherState;
  maxCrosswindKt: number;
  onUseLocation: () => void;
  locating: boolean;
  locationError: string | null;
  /** Where the departure default came from, e.g. "Västerås Flygklubb's home airfield". */
  defaultNote: string | null;
  signedIn: boolean;
  /** The way in to the arrival's runway, drawn on the map; with the runways to choose from. */
  arrival?: ArrivalPlan | null;
  landingOptions?: RunwayEnd[];
  onLandingChange?: (runway: string | null) => void;
}

const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');

/** Departure, waypoints and arrival, and the weather at each and along the way. */
const RouteSection: React.FC<RouteSectionProps> = ({
  route, onChange, altitudes, onLoad, weather, maxCrosswindKt, onUseLocation, locating, locationError, defaultNote, signedIn, climb,
  arrival = null, landingOptions = [], onLandingChange,
}) => {
  const { data } = weather;
  // Out on the runway heading to 700 ft before turning on course (the runway into the wind).
  const climbOut = React.useMemo(() => (data
    ? departureClimb(data.departure, data.points?.find(p => p.role === 'DEPARTURE')?.metar ?? null,
      (data.waypoints ?? [])[0] ?? data.arrival, climb)
    : null), [data, climb]);
  const known = React.useMemo(() => {
    const m = new Map<string, AirportInfo>();
    if (data) [data.departure, ...(data.waypoints ?? []), data.arrival].forEach(a => m.set(a.code, a));
    return m;
  }, [data]);
  // Positions are WP1, WP2, … in route order.
  const viaLabels = routeLabels(route.via);
  const named = new Map<string, string>();
  route.via.forEach((c, i) => { if (viaLabels[i] !== c) named.set(c, viaLabels[i]); });
  const nameOf = (code: string) => {
    const where = positionText(code);
    return where ? `${named.get(code) ?? 'Position'} · ${where}` : known.get(code)?.name;
  };
  const set = (patch: Partial<PlannedRoute>) => onChange({ ...route, ...patch, auto: false });
  const setVia = (via: string[]) => set({ via });
  const move = (i: number, by: number) => {
    const via = [...route.via];
    const [code] = via.splice(i, 1);
    via.splice(i + by, 0, code);
    setVia(via);
  };
  /** The departure and arrival the pilot just picked: offered a way through the reporting points. */
  const [suggestFor, setSuggestFor] = React.useState<string | null>(null);
  const pick = (from: string, to: string) => {
    set({ from, to });
    setSuggestFor(`${from}|${to}`);
  };
  const suggestion = React.useMemo(() => (
    data && route.via.length === 0 && suggestFor === `${route.from}|${route.to}`
      && data.departure.code === route.from && data.arrival.code === route.to && !(data.waypoints ?? []).length
      ? suggestReportingPoints(data.departure, data.arrival, weather.reportingPoints)
      : []
  ), [data, route.from, route.to, route.via.length, suggestFor, weather.reportingPoints]);
  const isLocal = data && data.distanceNm === 0;
  const legs = data?.legs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Departure, optional waypoints and arrival.</p>
        <div className="flex flex-wrap gap-2">
          <ImportFlightPlanButton route={route} onImport={onChange}/>
          {signedIn && <SavedRoutesButton route={route} altitudes={altitudes} onLoad={onLoad ?? onChange}/>}
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <AirportField label="Departure" value={route.from} valueName={known.get(route.from)?.name}
            onChange={code => pick(code, route.to || code)}/>
          <Button type="button" variant="ghost" size="icon" className="mx-auto hidden sm:flex" aria-label="Swap departure and arrival"
            onClick={() => set({ from: route.to, to: route.from, via: [...route.via].reverse() })}>
            <ArrowLeftRight className="h-4 w-4"/>
          </Button>
          <AirportField label="Arrival" value={route.to} valueName={known.get(route.to)?.name} onChange={code => pick(route.from, code)}/>
        </div>

        {route.via.length > 0 && (
          <Curtain id="route.waypoints" title={`Waypoints (${route.via.length})`} summary={viaLabels.join(' → ')}>
            <ol className="space-y-2 border-l-2 border-dashed border-border pl-3">
              {route.via.map((code, i) => (
                <li key={`${code}-${i}`} className="flex items-end gap-1">
                  <div className="flex-1">
                    <AirportField label={`Waypoint ${i + 1}`} value={code} valueName={nameOf(code)}
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
          </Curtain>
        )}

        {suggestion.length > 0 && data && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
            <span className="flex-1">
              Fly via the reporting points?{' '}
              <strong>{[route.from, ...suggestion.map(p => p.name), route.to].join(' → ')}</strong>
              {' '}({Math.max(0, Math.round(extraNm(data.departure, data.arrival, suggestion)))} NM longer than direct)
            </span>
            <Button type="button" size="sm" onClick={() => { setVia(suggestion.map(p => p.code)); setSuggestFor(null); }}>
              Route via them
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestFor(null)}>No thanks</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <AddWaypoint disabled={!route.from || route.via.length >= MAX_WAYPOINTS} onAdd={code => setVia([...route.via, code])}/>
        <Button type="button" variant="outline" size="sm" onClick={onUseLocation} disabled={locating}>
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Crosshair className="mr-1 h-4 w-4"/>}
          Nearest airport
        </Button>
        {route.from && route.to && route.from !== route.to && (
          <Button type="button" variant="outline" size="sm"
            onClick={() => set({ from: route.to, to: route.from, via: [...route.via].reverse() })}>
            <ArrowLeftRight className="mr-1 h-4 w-4"/> Reverse route
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
                <strong>{routeChain([data.departure.code, ...(data.waypoints ?? []).map(w => w.code), data.arrival.code])}</strong>:
                {' '}{Math.round(data.distanceNm)} NM (straight legs)
              </p>
              {legs.length > 1
                ? (
                  <Curtain id="route.legs" title={`Legs (${legs.length})`} summary="distance and true course of each" className="mt-1">
                    <ul className="grid gap-x-4 text-xs text-muted-foreground sm:grid-cols-2">
                      {legs.map((l, i) => (
                        <li key={i} className="tabular-nums">{l.from} → {l.to}: {Math.round(l.distanceNm)} NM, {pad3(l.trueCourseDeg)}° true</li>
                      ))}
                    </ul>
                  </Curtain>
                )
                : <p className="text-xs text-muted-foreground">True course {pad3(data.trueCourseDeg)}°</p>}
            </div>
          )
      )}
      {data && (
        <React.Suspense fallback={<div className="h-72 w-full rounded-md border border-border bg-muted sm:h-96"/>}>
          <RouteMap airports={[data.departure, ...(data.waypoints ?? []), ...(isLocal ? [] : [data.arrival])]}
            onWaypointsChange={isLocal ? undefined : setVia} maxWaypoints={MAX_WAYPOINTS} reportingPoints={weather.reportingPoints}
            onArrivalChange={isLocal ? undefined : code => pick(route.from, code)} departureClimb={isLocal ? null : climbOut}
            arrival={isLocal ? null : arrival}/>
        </React.Suspense>
      )}
      {data && !isLocal && arrival && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="landing-runway">
          <label htmlFor="landing-runway" className="font-medium">Landing runway</label>
          <select id="landing-runway" value={arrival.landing.runway}
            onChange={e => onLandingChange?.(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm">
            {landingOptions.map(o => <option key={o.runway} value={o.runway}>{o.runway}</option>)}
          </select>
          <span className="text-muted-foreground">
            {arrival.landing.by === 'wind' ? 'into the wind (METAR)' : arrival.landing.by === 'course' ? 'in line with the way in (no wind reported)' : 'your choice'}
            {arrival.landing.by === 'chosen' && onLandingChange && (
              <> · <button type="button" className="underline" onClick={() => onLandingChange(null)}>by the wind</button></>
            )}
          </span>
          <p className="w-full text-xs text-muted-foreground">
            {arrival.kind === 'circuit'
              ? `No control zone: the route ends with the standard join, 45° onto the ${arrival.side === 'LEFT' ? 'left' : 'right'}-hand downwind, then base and final to the threshold${arrival.side === 'LEFT' ? ' (left: the standard; openAIP gives no other)' : ''}. Join as the field's procedures say.`
              : 'In a control zone: planned as a 3 NM final to the threshold; join as ATC clears you.'}
            {' '}The route's distance and fuel are counted to the field.
          </p>
        </div>
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

      {data && data.weatherAvailable && (() => {
        const w = weatherAlong(data.points, !!isLocal);
        const card = (p: RoutePoint, i: number) => (
          <WeatherCard
            key={`${p.role}-${i}`}
            point={p}
            airport={p.airportCode ? known.get(p.airportCode)
              : p.role === 'DEPARTURE' ? data.departure : p.role === 'ARRIVAL' ? data.arrival : undefined}
            maxCrosswindKt={maxCrosswindKt}
            label={p.airportCode ? named.get(p.airportCode) : undefined}
          />
        );
        const pointName = (p: RoutePoint) => (p.airportCode ? named.get(p.airportCode) ?? p.airportCode : `${Math.round(p.alongTrackNm)} NM`);
        return (
          <div className="space-y-2">
            {w.departure && card(w.departure, 0)}
            {w.along.length > 0 && (
              <Curtain id="route.weatherAlong" title={`Weather along the route (${w.along.length})`}
                summary={w.along.map(p => `${stationOf(p)} ${p.metar?.flightCategory ?? ''}`.trim()).join(' · ')}>
                {w.along.map((p, i) => card(p, i + 1))}
              </Curtain>
            )}
            {w.repeated.length > 0 && (
              <p className="text-xs text-muted-foreground">
              Same METAR as shown: {w.repeated.map(r => `${pointName(r.point)} (${r.station})`).join(', ')}.
              </p>
            )}
            {w.arrival && card(w.arrival, w.along.length + 1)}
            <p className="text-[11px] text-muted-foreground">
            Weather from aviationweather.gov (NOAA). For planning only - get an official briefing before flight.
            </p>
          </div>
        );
      })()}
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
