import { aircraftData as builtinAircraft, type AircraftData } from '../data/aircraftData';
import type { AirframeView, GenericTypeView, StationSpec, TypeStatus, Verification } from '../types/airframeImport';

/**
 * What the calculator knows about an aircraft besides its data. A generic aircraft is a model
 * without a registration: the pilot enters their own aircraft's empty weight and arm, and the
 * aircraft data carries the typical values as the prefill.
 */
export type AircraftMeta =
  | { kind: 'generic'; label: string; code: string; typeStatus: TypeStatus }
  | {
      kind: 'airframe';
      label: string;
      code: string;
      /** Model name, e.g. "Piper PA-28-161 Warrior II". */
      model: string;
      registration: string;
      owned: boolean;
      /** Club name for a shared aircraft; null for the user's own. */
      club: string | null;
      /** The aircraft's home airfield (ICAO), the default departure; usually its club's. */
      homeAirport: string | null;
      /** The home airfield is the aircraft's own, not its club's (e.g. based elsewhere). */
      homeAirportOwn: boolean;
      typeStatus: TypeStatus;
      verification: Verification;
      weighedOn: string | null;
    };

export interface CatalogData {
  aircraft: Record<string, AircraftData>;
  meta: Record<string, AircraftMeta>;
  /** Registrations (or model codes) left out because the calculator can't use their data. */
  skipped: string[];
}

/** Key of a model's generic aircraft, e.g. "PA28-161 (generic)". */
export const genericKey = (code: string) => `${code} (generic)`;

const POWER_SETTINGS = ['55%', '65%', '75%'] as const;
type PowerSetting = typeof POWER_SETTINGS[number];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * One database aircraft in the calculator's AircraftData shape, or null if something the
 * calculator relies on is missing (it would otherwise compute with a 0 or undefined).
 */
type Loadable = Pick<AirframeView, 'spec' | 'basicEmptyWeight' | 'armAftDatum'>;

export function toAircraftData(view: Loadable): AircraftData | null {
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
 * Generic types first ("CODE (generic)"), then the user's own aircraft and club aircraft keyed
 * like the built-in list, "CODE (REG)", so lookups such as background images keep working.
 * A user's own copy of a club aircraft gets ", yours" added to stay unique.
 */
export function toCatalog(views: AirframeView[], generics: GenericTypeView[] = []): CatalogData {
  const generic: Record<string, AircraftData> = {};
  const aircraft: Record<string, AircraftData> = {};
  const meta: Record<string, AircraftMeta> = {};
  const skipped: string[] = [];

  for (const g of generics) {
    const data = toAircraftData({ spec: g.spec, basicEmptyWeight: g.typicalEmptyWeight, armAftDatum: g.typicalEmptyArm });
    const key = genericKey(g.spec.code);
    if (!data || generic[key]) {
      if (!data) skipped.push(g.spec.code);
      continue;
    }
    generic[key] = data;
    meta[key] = { kind: 'generic', label: g.spec.name, code: g.spec.code, typeStatus: g.typeStatus };
  }

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
      kind: 'airframe',
      label: key,
      code: view.spec.code,
      model: view.spec.name,
      registration: view.registration,
      owned: view.owned,
      club: view.owned ? null : view.club?.name ?? null,
      homeAirport: view.owned ? null : view.homeAirport ?? view.club?.homeAirport ?? null,
      homeAirportOwn: !view.owned && !!view.homeAirport && view.homeAirport !== view.club?.homeAirport,
      typeStatus: view.typeStatus,
      verification: view.verification,
      weighedOn: view.weighedOn,
    };
  }
  // Generic types by name, then aircraft in the server's order (by code, then registration).
  const ordered: Record<string, AircraftData> = {};
  Object.keys(generic).sort((a, b) => meta[a].label.localeCompare(meta[b].label)).forEach(k => { ordered[k] = generic[k]; });
  Object.keys(aircraft).sort((a, b) => a.localeCompare(b)).forEach(k => { ordered[k] = aircraft[k]; });
  return { aircraft: ordered, meta, skipped };
}

/** For each model, the built-in aircraft whose data stands in for the generic version (as on the server). */
const BUILTIN_GENERIC_SOURCES = [
  'DA40D (SE-MBC)',
  'DA40NG (SE-MIO)',
  'PA-32R-300 (SE-GRZ)',
  'PA18-150 (SE-GCG)',
  'PA28-140 (SE-ILO)',
  'PA28-161 (SE-KMI)',
  'PA28-181 (SE-GLC)',
  'TB9 (F-GKVK)',
];

/** Offline fallback when nothing is cached: generic versions of the built-in models. */
export function builtinCatalog(): CatalogData {
  const generics: GenericTypeView[] = BUILTIN_GENERIC_SOURCES.filter(k => builtinAircraft[k]).map((k, i) => {
    const a = builtinAircraft[k];
    const code = k.replace(/\s*\(.*\)$/, '');
    return {
      typeId: -(i + 1),
      typeStatus: 'CURATED',
      typicalEmptyWeight: a.basicEmptyWeight,
      typicalEmptyArm: a.armAftDatum,
      spec: {
        code, name: a.type, mtow: a.mtow, stations: { ...a.stations } as Record<string, StationSpec>,
        envelope: a.envelope, performance: a.performance,
      },
    };
  });
  return toCatalog([], generics);
}

// ---- Offline cache -------------------------------------------------------

// v3: generic types, plus the user's own and chosen club aircraft; records whose list it is.
const CACHE_KEY = 'aircraftCatalog.v3';
const OLD_CACHE_KEYS = ['aircraftCatalog.v1', 'aircraftCatalog.v2'];

export interface CachedCatalog {
  savedAt: string;
  /** Whose list this is; null = signed out (generic types only). */
  userId: number | null;
  views: AirframeView[];
  generics: GenericTypeView[];
}

/** The cached list, only if it was saved for this same user (or signed out for signed out). */
export function loadCachedCatalog(userId: number | null): CachedCatalog | null {
  try {
    OLD_CACHE_KEYS.forEach(k => localStorage.removeItem(k));
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (!Array.isArray(parsed.views) || !Array.isArray(parsed.generics) || typeof parsed.savedAt !== 'string') return null;
    return (parsed.userId ?? null) === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedCatalog(
  views: AirframeView[], generics: GenericTypeView[], userId: number | null, now: Date = new Date(),
): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: now.toISOString(), userId, views, generics }));
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
