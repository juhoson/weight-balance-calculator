import React from 'react';
import { fetchAerodrome } from '../api/backend';
import type { AerodromeInfo, AirspaceView, RouteWeather } from '../types/route';
import { type AirportLayout, loadAirportLayout } from './airportLayout';
import { type ArrivalPlan, arrivalPlan, circuitSide, isControlledField, landingOptions, landingRunway, type RunwayEnd } from './arrival';

const AERODROME_KEY = (code: string) => `aerodrome.v1.${code}`;

/** The field's circuits and reporting points (openAIP), kept on the device for flying offline. */
export function loadAerodrome(code: string): Promise<AerodromeInfo | null> {
  return Promise.resolve().then(() => fetchAerodrome(code)).then(a => {
    try { localStorage.setItem(AERODROME_KEY(code), JSON.stringify(a)); } catch { /* full */ }
    return a;
  }, () => {
    try { return JSON.parse(localStorage.getItem(AERODROME_KEY(code)) ?? 'null') as AerodromeInfo | null; } catch { return null; }
  });
}

/**
 * The way in to the arrival's runway (see arrival.ts), with the runway chosen when one is: the
 * field's layout (for the threshold) and circuits (for the side) load as they can.
 */
export function useArrivalPlan(trip: RouteWeather | null, airspaces: AirspaceView[] | null | undefined, chosen?: string | null):
  { plan: ArrivalPlan | null; options: RunwayEnd[] } {
  const arr = trip && trip.arrival.type !== 'point' && trip.distanceNm > 0 ? trip.arrival : null;
  const code = arr?.code ?? null;
  const [layout, setLayout] = React.useState<{ code: string; layout: AirportLayout } | null>(null);
  const [aerodrome, setAerodrome] = React.useState<AerodromeInfo | null>(null);
  React.useEffect(() => {
    if (!code) return undefined;
    let live = true;
    loadAirportLayout(code).then(l => { if (live && l) setLayout({ code, layout: l }); }, () => undefined);
    loadAerodrome(code).then(a => { if (live) setAerodrome(a && a.code === code ? a : null); }, () => undefined);
    return () => { live = false; };
  }, [code]);
  const controlled = React.useMemo(() => (arr ? isControlledField(arr, airspaces) : false), [arr, airspaces]);
  return React.useMemo(() => {
    if (!trip || !arr) return { plan: null, options: [] };
    const before = [trip.departure, ...(trip.waypoints ?? [])];
    const metar = trip.points?.find(p => p.role === 'ARRIVAL')?.metar ?? null;
    const landing = landingRunway(arr, metar, before[before.length - 1], chosen);
    if (!landing) return { plan: null, options: [] };
    return {
      plan: arrivalPlan(arr, landing, {
        side: circuitSide(aerodrome?.code === arr.code ? aerodrome.circuits : null, landing.runway),
        controlled, layout: layout?.code === arr.code ? layout.layout : null,
      }),
      options: landingOptions(arr),
    };
  }, [trip, arr, chosen, aerodrome, controlled, layout]);
}
