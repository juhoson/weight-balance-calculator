import { aircraftData as builtinAircraft, type AircraftData } from '../data/aircraftData';
import type { AirframeView, TypeStatus, Verification } from '../types/airframeImport';

/** What the calculator shows next to an aircraft; absent for built-in data. */
export interface AircraftMeta {
  registration: string;
  owned: boolean;
  typeStatus: TypeStatus;
  verification: Verification;
  weighedOn: string | null;
}

export interface CatalogData {
  aircraft: Record<string, AircraftData>;
  meta: Record<string, AircraftMeta>;
  /** Registrations left out because the calculator can't use their data. */
  skipped: string[];
}

const POWER_SETTINGS = ['55%', '65%', '75%'] as const;
type PowerSetting = typeof POWER_SETTINGS[number];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * One database aircraft in the calculator's AircraftData shape, or null if something the
 * calculator relies on is missing (it would otherwise compute with a 0 or undefined).
 */
export function toAircraftData(view: AirframeView): AircraftData | null {
  const { spec } = view;
  const s = spec.stations;
  const pilot = s.pilotFront;
  const baggage = s.baggage;
  const fuel = s.fuel;
  if (!pilot || !baggage || !fuel) return null;
  if (!isNum(pilot.arm) || !isNum(pilot.maxWeight) || !isNum(baggage.arm) || !isNum(baggage.maxWeight)) return null;
  if (!isNum(fuel.arm) || !isNum(fuel.maxLiters) || !isNum(fuel.standardLiters) || !isNum(fuel.weightPerLiter)) return null;
  if (!isNum(view.basicEmptyWeight) || !isNum(view.armAftDatum)) return null;

  const seat = (st: typeof s[string] | undefined) =>
    st && isNum(st.arm) && isNum(st.maxWeight) ? { arm: st.arm, maxWeight: st.maxWeight } : undefined;
  const rear = seat(s.passengerRear);
  const back = seat(s.passengerBack);
  if ((s.passengerRear && !rear) || (s.passengerBack && !back)) return null;

  const p = spec.performance;
  const fuelConsumption = p.fuelConsumption
    .filter(f => (POWER_SETTINGS as readonly string[]).includes(f.powerSetting))
    .map(f => ({ ...f, powerSetting: f.powerSetting as PowerSetting }));
  if (fuelConsumption.length !== POWER_SETTINGS.length) return null;

  return {
    type: spec.name,
    basicEmptyWeight: view.basicEmptyWeight,
    armAftDatum: view.armAftDatum,
    mtow: spec.mtow,
    maxBaggage: baggage.maxWeight,
    stations: {
      pilotFront: { arm: pilot.arm, maxWeight: pilot.maxWeight },
      ...(rear ? { passengerRear: rear } : {}),
      ...(back ? { passengerBack: back } : {}),
      baggage: { arm: baggage.arm, maxWeight: baggage.maxWeight },
      fuel: {
        arm: fuel.arm,
        maxLiters: fuel.maxLiters,
        standardLiters: fuel.standardLiters,
        weightPerLiter: fuel.weightPerLiter,
      },
    },
    envelope: spec.envelope,
    performance: {
      maxDemoCrosswind: p.maxDemoCrosswind,
      stallSpeedClean: p.stallSpeedClean,
      stallSpeedLanding: p.stallSpeedLanding,
      bestClimbSpeed: p.bestClimbSpeed,
      ...(isNum(p.bestGlideSpeed) ? { bestGlideSpeed: p.bestGlideSpeed } : {}),
      approachSpeedNormal: p.approachSpeedNormal,
      ...(isNum(p.cruiseSpeed) ? { cruiseSpeed: p.cruiseSpeed } : {}),
      speedUnit: p.speedUnit,
      fuelConsumption,
      taxiFuel: p.taxiFuel,
      reserveFuel: p.reserveFuel,
    },
  };
}

/**
 * Keyed like the built-in list, "CODE (REG)", so existing lookups such as background images
 * keep working. A user's own copy of a shared aircraft gets ", yours" added to stay unique.
 */
export function toCatalog(views: AirframeView[]): CatalogData {
  const aircraft: Record<string, AircraftData> = {};
  const meta: Record<string, AircraftMeta> = {};
  const skipped: string[] = [];
  const sorted = [...views].sort((a, b) => Number(a.owned) - Number(b.owned)); // shared first keep the plain key
  for (const view of sorted) {
    const data = toAircraftData(view);
    if (!data) {
      skipped.push(view.registration);
      continue;
    }
    let key = `${view.spec.code} (${view.registration})`;
    if (aircraft[key]) key = `${view.spec.code} (${view.registration}, yours)`;
    if (aircraft[key]) key = `${key} #${view.id}`;
    aircraft[key] = data;
    meta[key] = {
      registration: view.registration,
      owned: view.owned,
      typeStatus: view.typeStatus,
      verification: view.verification,
      weighedOn: view.weighedOn,
    };
  }
  // Restore the server's order (by code, then registration) in the key order.
  const ordered: Record<string, AircraftData> = {};
  Object.keys(aircraft).sort((a, b) => a.localeCompare(b)).forEach(k => { ordered[k] = aircraft[k]; });
  return { aircraft: ordered, meta, skipped };
}

export function builtinCatalog(): CatalogData {
  return { aircraft: builtinAircraft, meta: {}, skipped: [] };
}

// ---- Offline cache -------------------------------------------------------

// v2: the list includes the signed-in user's own aircraft, so the cache records whose list it is.
const CACHE_KEY = 'aircraftCatalog.v2';
const OLD_CACHE_KEYS = ['aircraftCatalog.v1'];

export interface CachedCatalog {
  savedAt: string;
  /** Whose list this is; null = signed out (shared aircraft only). */
  userId: number | null;
  views: AirframeView[];
}

/** The cached list, only if it was saved for this same user (or signed out for signed out). */
export function loadCachedCatalog(userId: number | null): CachedCatalog | null {
  try {
    OLD_CACHE_KEYS.forEach(k => localStorage.removeItem(k));
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (!Array.isArray(parsed.views) || typeof parsed.savedAt !== 'string') return null;
    return (parsed.userId ?? null) === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedCatalog(views: AirframeView[], userId: number | null, now: Date = new Date()): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: now.toISOString(), userId, views }));
  } catch {
    // Storage full or blocked: the app still works, just not offline.
  }
}

/** On sign-out, so a shared computer doesn't keep someone's own aircraft. */
export function clearCachedCatalog(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
