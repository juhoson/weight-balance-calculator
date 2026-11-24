import * as React from 'react';
import {Button} from './ui/Button';
import {NumberInput} from './ui/NumberInput';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/Select';
import {type AircraftData, calculateCG, calculateMoment, isWithinEnvelope} from '../data/aircraftData';
import {useAircraftCatalog} from '../lib/useAircraftCatalog';
import {clubFromUrl} from '../lib/clubLink';
import ClubLinkBanner from './ClubLinkBanner';
import {useAuth} from '../api/useAuth';
import {getSeatLayout} from '../lib/seatLayout';
import {FormItem, FormLabel} from './ui/Form';
import SafetyDisclaimer from './SafetyDisclaimer';
import DisclaimerModal from './DisclaimerModal';
import {Progress} from './ui/Progress';
import FlightTimeInput from './FlightTimeInput';
import CompanyFooter from './CompanyFooter';
import SeatLayout from './SeatLayout';
import AircraftSourceNotice from './AircraftSourceNotice';
import ClubAircraftButton from './ClubAircraftDialog';
import ClubHint from './profile/ClubHint';
import GenericEmptyWeight from './GenericEmptyWeight';
import AircraftPicker from './AircraftPicker';
import AircraftHero from './AircraftHero';
import ResultsPanel, {VERDICT_TEXT, VerdictIcon, verdictOf, verdictStyles} from './ResultsPanel';
import {genericKey} from '../lib/aircraftCatalog';
import {loadEmptyOverrides, saveEmptyOverrides, type EmptyOverrides} from '../lib/emptyOverrides';
import {cn} from '../lib/utils';
import RouteSection from './route/RouteSection';
import AirspacePanel from './route/AirspacePanel';
import { altitudeAlongPoints, checkCrossings, type Crossing, crossingsAlong, pointsOf, stillAirProfile } from '../lib/airspace';
import { avoidOptions, type AvoidHandler, crossingContext, withEffects } from '../lib/avoidAirspace';
import { useAirspaces } from '../lib/useAirspaces';
import EnroutePanel from './route/EnroutePanel';
import { swedenControlAlong } from '../lib/swedenControl';
import {useAltitudeForecasts, useClimbRates, useCruiseAltitude, useEnrouteForecast, useForecastsAt, useSuggestMax, validAltitude, validRate} from '../lib/useEnrouteForecast';
import {type OkPlan, suggestAltitudes} from '../lib/suggestAltitude';
import {type AltitudeHold, CIRCUIT_HEIGHT_FT, cruiseTas, legsOf, levelAt, type PathPoint, planRoute, roundUpTo5, steppedPath, tidyHolds, trueAirspeed, type VerticalProfile} from '../lib/enroute';
import SharedRouteBanner from './route/SharedRouteBanner';
import {useRouteWeather} from '../lib/useRouteWeather';
import type {RouteWeather} from '../types/route';
import {currentPosition, loadRoute, locationAlreadyAllowed, type PlannedRoute, type RouteAltitudes, saveRoute} from '../lib/route';
import {nearestAirports} from '../api/backend';
import {flightMinutes, MPH_TO_KT} from '../lib/wind';
import {track} from '../lib/analytics';

export interface CalculatorInputs {
    pilotWeight: number;
    frontPassengerWeight: number;
    rearLeftPassengerWeight: number;
    rearRightPassengerWeight: number;
    backLeftPassengerWeight?: number;    // Added for 3rd row left passenger in 6-seater
    backRightPassengerWeight?: number;   // Added for 3rd row right passenger in 6-seater
    backPassengerWeight?: number;        // For tandem aircraft
    baggageWeight: number;
    /** Baggage area 2, for aircraft that have one. */
    baggage2Weight?: number;
    fuelAmount: number;
    /** The second tank, for aircraft that have one; in fuelUnit like fuelAmount. */
    fuel2Amount?: number;
    fuelUnit: 'liters' | 'kg';
    flightTime: number;
    powerSetting: '55%' | '65%' | '75%';
}

interface CalculationResults {
    takeoff: {
        totalWeight: number;
        cg: number;
        isWithinLimits: boolean;
        problems?: string[];
        moments: Record<string, number>;
    };
    landing: {
        totalWeight: number;
        cg: number;
        isWithinLimits: boolean;
        problems?: string[];
        moments: Record<string, number>;
        fuelRemaining: number;
        hasMinimumReserve: boolean;
    };
}

const DEFAULT_AIRCRAFT = genericKey('PA28-161');
const SELECTED_KEY = 'selectedAircraft.v1';
const DEFAULT_PILOT_WEIGHT = 85;

function rememberedAircraft(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

/** The aircraft chosen last time if the list has it, else the default, else the first one. */
function pickAircraft(list: Record<string, AircraftData>): string {
  const remembered = rememberedAircraft();
  if (remembered && list[remembered]) return remembered;
  return list[DEFAULT_AIRCRAFT] ? DEFAULT_AIRCRAFT : Object.keys(list)[0];
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/** A numbered step of the form. */
const Section: React.FC<{ step: number; title: string; children: React.ReactNode; aside?: React.ReactNode }> =
  ({step, title, children, aside}) => (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {step}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );

/**
 * The airspace check for a flight path. AGL ceilings are placed over the highest route airport, and
 * airspace over the arrival counts down to the runway.
 */
function checkPath(trip: RouteWeather, crossings: Crossing[], path: PathPoint[]) {
  const groundFt = Math.max(...[trip.departure, ...(trip.waypoints ?? []), trip.arrival].map(a => a.elevationFt ?? 0));
  return checkCrossings(crossings, altitudeAlongPoints(path), path.map(p => p.nm), groundFt,
    { totalNm: trip.distanceNm, fieldFt: trip.arrival.elevationFt ?? 0 });
}

interface WeightBalanceCalculatorProps {
  /** Select this aircraft once the database list has loaded (e.g. one just added). */
  preferredRegistration?: string | null;
  /** Opens the profile page, where a signed-in user picks their club. */
  onOpenProfile?: () => void;
}

const WeightBalanceCalculator: React.FC<WeightBalanceCalculatorProps> = ({preferredRegistration, onOpenProfile}) => {
  // A club's link (?club=vfk) lists just that club's aircraft.
  const [clubLink] = React.useState(() => clubFromUrl());
  React.useEffect(() => { if (clubLink) track('club-link', {club: clubLink}); }, [clubLink]);
  const catalog = useAircraftCatalog(clubLink);
  const userId = useAuth().user?.id ?? null;
  // The generic aircraft can be hidden (remembered per user in this browser); a club link hides them.
  const hideGenericKey = `hideGenericAircraft.v1.${userId}`;
  const [hideGenericPref, setHideGeneric] = React.useState(() => readFlag(hideGenericKey));
  React.useEffect(() => { setHideGeneric(readFlag(hideGenericKey)); }, [hideGenericKey]);
  const hideGeneric = hideGenericPref || clubLink !== null;
  const toggleGeneric = (hide: boolean) => {
    setHideGeneric(hide);
    try {
      localStorage.setItem(hideGenericKey, String(hide));
    } catch {
      // Not remembered; fine.
    }
  };
  const hasSpecific = Object.values(catalog.meta).some(m => m.kind === 'airframe');
  // A generic aircraft's empty weight and arm are the pilot's own (remembered per model).
  const [emptyOverrides, setEmptyOverrides] = React.useState<EmptyOverrides>(loadEmptyOverrides);
  const aircraftList = React.useMemo(() => {
    const list = {...catalog.aircraft};
    if (hideGeneric && hasSpecific) {
      // Only when something is left to choose from.
      Object.keys(list).forEach(k => { if (catalog.meta[k]?.kind === 'generic') delete list[k]; });
    }
    for (const [key, o] of Object.entries(emptyOverrides)) {
      // A cleared field (0) falls back to the typical value; GenericEmptyWeight says so.
      if (list[key] && catalog.meta[key]?.kind === 'generic' && o.weight > 0 && o.arm > 0) {
        list[key] = {...list[key], basicEmptyWeight: o.weight, armAftDatum: o.arm};
      }
    }
    return list;
  }, [catalog.aircraft, catalog.meta, emptyOverrides, hideGeneric, hasSpecific]);
  const updateEmptyOverride = (key: string, value: { weight: number; arm: number } | null) => {
    setEmptyOverrides(prev => {
      const next = {...prev};
      if (value) next[key] = value; else delete next[key];
      saveEmptyOverrides(next);
      return next;
    });
  };
  const [disclaimerAccepted, setDisclaimerAccepted] = React.useState(() => {
    return localStorage.getItem('disclaimerAccepted') === 'true';
  });
  const [selectedAircraft, setSelectedAircraft] = React.useState<string>(() => pickAircraft(aircraftList));
  const [inputs, setInputs] = React.useState<CalculatorInputs>(() => {
    const standardFuel = aircraftList[selectedAircraft].stations.fuel.standardLiters;
    return {
      pilotWeight: DEFAULT_PILOT_WEIGHT,
      frontPassengerWeight: 0,
      rearLeftPassengerWeight: 0,
      rearRightPassengerWeight: 0,
      backPassengerWeight: 0,
      baggageWeight: 0,
      baggage2Weight: 0,
      fuelAmount: standardFuel,
      fuel2Amount: aircraftList[selectedAircraft].stations.fuel2?.standardLiters ?? 0,
      fuelUnit: 'liters',
      flightTime: 60,
      powerSetting: '75%'
    };
  });

  const handleWeightChange = (
    seat: keyof Omit<
            CalculatorInputs,
            'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'
        >,
    value: string
  ) => {
    const numericValue = parseFloat(value) || 0;
    const layout = getSeatLayout(aircraftList[selectedAircraft]);

    if (layout === 'tandem') {
      // For tandem aircraft
      setInputs(prev => ({
        ...prev,
        [seat]: numericValue,
        // Clear other passenger weights if they exist
        ...(seat !== 'pilotWeight' && seat !== 'backPassengerWeight' ? {
          frontPassengerWeight: 0,
          rearLeftPassengerWeight: 0,
          rearRightPassengerWeight: 0
        } : {})
      }));
    } else if (layout === 'sixSeat') {
      // For 6-seat aircraft (PA-32R-300 Lance)
      setInputs(prev => ({
        ...prev,
        [seat]: numericValue,
        // Keep all other passenger weights as they are since this is a 6-seater
        // Just clear tandem passenger weight if it exists
        backPassengerWeight: 0
      }));
    } else {
      // For standard aircraft (4-seat)
      setInputs(prev => ({
        ...prev,
        [seat]: numericValue,
        // Clear tandem passenger weight if it exists
        backPassengerWeight: 0
      }));
    }
  };

  const [results, setResults] = React.useState<CalculationResults | null>(null);


  // Handle aircraft selection with default fuel
  const handleAircraftSelection = React.useCallback((aircraft: string) => {
    setSelectedAircraft(aircraft);
    try {
      localStorage.setItem(SELECTED_KEY, aircraft);
    } catch {
      // Not remembered; fine.
    }
    const standardFuel = aircraftList[aircraft].stations.fuel.standardLiters;
    setInputs(prev => ({
      ...prev,
      fuelAmount: standardFuel,
      fuel2Amount: aircraftList[aircraft].stations.fuel2?.standardLiters ?? 0,
      fuelUnit: 'liters'
    }));
  }, [aircraftList]);

  const handleDisclaimerAccept = () => {
    localStorage.setItem('disclaimerAccepted', 'true');
    setDisclaimerAccepted(true);
  };

  const handleQuickFuelSelect = (type: 'standard' | 'full') => {
    if (!selectedAircraft) return;

    const aircraft = aircraftList[selectedAircraft];
    const fuelAmount = type === 'standard'
      ? aircraft.stations.fuel.standardLiters
      : aircraft.stations.fuel.maxLiters;

    setInputs(prev => ({
      ...prev,
      fuelAmount,
      fuelUnit: 'liters'
    }));
  };


  const handleInputChange = (field: keyof Omit<CalculatorInputs, 'fuelUnit'>, value: string) => {
    setInputs(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
  };
  // Memoized: calculateWeightAndBalance depends on it, and the effect that runs the calculation
  // depends on that - a new function on every render made the calculator re-render endlessly.
  const calculateTripFuel = React.useCallback(() => {
    if (!selectedAircraft) return 0;

    const aircraft = aircraftList[selectedAircraft];
    if (!aircraft) return 0;
    const consumptionData = aircraft.performance.fuelConsumption.find(
      setting => setting.powerSetting === inputs.powerSetting
    );

    if (!consumptionData) return 0;

    // Calculate fuel used during flight (not including taxi)
    return (consumptionData.litersPerHour * inputs.flightTime) / 60;
  }, [selectedAircraft, aircraftList, inputs.powerSetting, inputs.flightTime]);

  const handleFuelUnitChange = (unit: 'liters' | 'kg') => {
    const aircraft = aircraftList[selectedAircraft];
    let newFuelAmount = inputs.fuelAmount;

    // Convert current amount to new unit
    if (inputs.fuelUnit !== unit) {
      if (unit === 'kg' && inputs.fuelUnit === 'liters') {
        newFuelAmount = inputs.fuelAmount * aircraft.stations.fuel.weightPerLiter; // Convert liters to kg
      } else if (unit === 'liters' && inputs.fuelUnit === 'kg') {
        newFuelAmount = inputs.fuelAmount / aircraft.stations.fuel.weightPerLiter; // Convert kg to liters
      }
    }

    const fuel2 = aircraft.stations.fuel2;
    let newFuel2 = inputs.fuel2Amount || 0;
    if (fuel2 && inputs.fuelUnit !== unit) {
      newFuel2 = unit === 'kg' ? newFuel2 * fuel2.weightPerLiter : newFuel2 / fuel2.weightPerLiter;
    }
    setInputs(prev => ({
      ...prev,
      fuelUnit: unit,
      fuelAmount: parseFloat(newFuelAmount.toFixed(1)),
      fuel2Amount: parseFloat(newFuel2.toFixed(1))
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent form submission
    calculateWeightAndBalance();
  };

  const getFuelLevelLabel = (
    fuelAmount: number,
    aircraft: AircraftData
  ) => {
    if (fuelAmount === 0) return 'Empty';
    if (fuelAmount === aircraft.stations.fuel.maxLiters) return 'Full';
    if (fuelAmount === aircraft.stations.fuel.standardLiters) return 'Standard';
    if (fuelAmount < aircraft.stations.fuel.standardLiters) return 'Below Standard';
    if (fuelAmount > aircraft.stations.fuel.standardLiters) return 'Above Standard';
    return 'Custom';
  };

  const getFuelLevelColor = (
    fuelAmount: number,
    aircraft: AircraftData
  ) => {
    const percentage = (fuelAmount / aircraft.stations.fuel.maxLiters) * 100;
    if (percentage <= 25) return 'bg-red-500';
    if (percentage <= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Updated calculateWeightAndBalance function to properly handle all seats in PA-32R-300

  const calculateWeightAndBalance = React.useCallback(() => {
    if (!selectedAircraft) return;

    const aircraft = aircraftList[selectedAircraft];
    if (!aircraft) return;
    if (!(aircraft.basicEmptyWeight > 0)) {
      setResults(null); // a generic type without typical values, before the pilot enters theirs
      return;
    }
    const layout = getSeatLayout(aircraft);
    const isTandem = layout === 'tandem';
    const is6Seater = layout === 'sixSeat';

    // Calculate trip fuel
    const tripFuel = calculateTripFuel();
    const totalFuelConsumed = tripFuel + aircraft.performance.taxiFuel.liters;

    // Convert fuel to weight for calculations; a second tank (e.g. wing tanks) at its own arm.
    const fuel1 = aircraft.stations.fuel, fuel2 = aircraft.stations.fuel2;
    const tank1Weight = inputs.fuelUnit === 'kg' ? inputs.fuelAmount : inputs.fuelAmount * fuel1.weightPerLiter;
    const tank2Weight = !fuel2 ? 0
      : inputs.fuelUnit === 'kg' ? inputs.fuel2Amount || 0 : (inputs.fuel2Amount || 0) * fuel2.weightPerLiter;
    const startingFuelWeight = tank1Weight + tank2Weight;

    const burnWeight = totalFuelConsumed * fuel1.weightPerLiter;
    const landingFuelWeight = Math.max(0, startingFuelWeight - burnWeight);

    // Calculate moments and CG for takeoff
    const takeoffMoments = {
      empty: calculateMoment(aircraft.basicEmptyWeight, aircraft.armAftDatum),
      pilot: calculateMoment(inputs.pilotWeight, aircraft.stations.pilotFront.arm),
      // Handle different seating configurations
      ...(isTandem
        ? {
          // Tandem configuration - use backPassengerWeight
          backPassenger: calculateMoment(
            inputs.backPassengerWeight || 0,
            aircraft.stations.passengerBack?.arm || 0
          )
        }
        : {
          // Standard configuration for front and middle rows
          frontPassenger: calculateMoment(
            inputs.frontPassengerWeight,
            aircraft.stations.pilotFront.arm
          ),
          // A side-by-side two-seater has no rear row: rear weights left from another aircraft don't count.
          ...(aircraft.stations.passengerRear ? {
            rearLeftPassenger: calculateMoment(inputs.rearLeftPassengerWeight, aircraft.stations.passengerRear.arm),
            rearRightPassenger: calculateMoment(inputs.rearRightPassengerWeight, aircraft.stations.passengerRear.arm),
          } : {}),
          // Add back row passengers for 6-seater - use passengerBack arm if available, otherwise use passengerRear
          ...(is6Seater
            ? {
              backLeftPassenger: calculateMoment(
                inputs.backLeftPassengerWeight || 0,
                aircraft.stations.passengerBack?.arm || aircraft.stations.passengerRear?.arm || 0
              ),
              backRightPassenger: calculateMoment(
                inputs.backRightPassengerWeight || 0,
                aircraft.stations.passengerBack?.arm || aircraft.stations.passengerRear?.arm || 0
              )
            }
            : {})
        }),
      baggage: calculateMoment(inputs.baggageWeight, aircraft.stations.baggage.arm),
      ...(aircraft.stations.baggage2
        ? { baggage2: calculateMoment(inputs.baggage2Weight || 0, aircraft.stations.baggage2.arm) }
        : {}),
      fuel: calculateMoment(tank1Weight, fuel1.arm),
      ...(fuel2 ? { fuel2: calculateMoment(tank2Weight, fuel2.arm) } : {})
    };

    // Calculate total weight based on configuration
    let totalPassengerWeight;

    if (isTandem) {
      // For tandem aircraft
      totalPassengerWeight = inputs.backPassengerWeight || 0;
    } else if (is6Seater) {
      // For 6-seater aircraft, include all rows
      totalPassengerWeight = inputs.frontPassengerWeight +
                inputs.rearLeftPassengerWeight +
                inputs.rearRightPassengerWeight +
                (inputs.backLeftPassengerWeight || 0) +
                (inputs.backRightPassengerWeight || 0);
    } else if (!aircraft.stations.passengerRear) {
      // Side-by-side two-seater: the front passenger only
      totalPassengerWeight = inputs.frontPassengerWeight;
    } else {
      // For standard 4-seater aircraft
      totalPassengerWeight = inputs.frontPassengerWeight +
                inputs.rearLeftPassengerWeight +
                inputs.rearRightPassengerWeight;
    }

    const takeoffWeight = aircraft.basicEmptyWeight +
            inputs.pilotWeight +
            totalPassengerWeight +
            inputs.baggageWeight +
            (aircraft.stations.baggage2 ? inputs.baggage2Weight || 0 : 0) +
            startingFuelWeight;

    // Rest of the calculation remains the same
    const landingWeight = takeoffWeight - (startingFuelWeight - landingFuelWeight);

    const takeoffTotalMoment = Object.values(takeoffMoments).reduce((sum, moment) => sum + moment, 0);
    const takeoffCG = calculateCG(takeoffWeight, takeoffTotalMoment);

    // Landing: the fuel burned comes from one tank, then the other. Which one the pilot uses first
    // moves the landing CG, so with two tanks both orders are checked and the worse one shown.
    const landingCgBurning = (firstTank: 1 | 2) => {
      const fromFirst = Math.min(burnWeight, firstTank === 1 ? tank1Weight : tank2Weight);
      const rest = Math.max(0, burnWeight - fromFirst);
      const left1 = firstTank === 1 ? tank1Weight - fromFirst : Math.max(0, tank1Weight - rest);
      const left2 = firstTank === 2 ? tank2Weight - fromFirst : Math.max(0, tank2Weight - rest);
      const moment = Object.values({
        ...takeoffMoments,
        fuel: calculateMoment(left1, fuel1.arm),
        ...(fuel2 ? { fuel2: calculateMoment(left2, fuel2.arm) } : {}),
      }).reduce((sum, m) => sum + m, 0);
      return calculateCG(landingWeight, moment);
    };
    const landingOrders = fuel2 ? ([1, 2] as const) : ([1] as const);
    const landingOptions = landingOrders.map(first => {
      const cg = landingCgBurning(first);
      const { forwardCG, aftCG } = aircraft.envelope.limits;
      return { first, cg, ok: isWithinEnvelope(aircraft, landingWeight, cg), margin: Math.min(cg - forwardCG, aftCG - cg) };
    });
    // The failing order if there is one, otherwise the one closer to a CG limit.
    const landingShown = [...landingOptions].sort((a, b) => Number(a.ok) - Number(b.ok) || a.margin - b.margin)[0];
    const landingCG = landingShown.cg;

    const landingFuelLiters = landingFuelWeight / fuel1.weightPerLiter;
    const hasMinimumReserve = landingFuelLiters >= aircraft.performance.reserveFuel.recommendedLiters;

    // Limits some POHs add to the envelope: everything but the fuel, and the landing weight.
    const takeoffProblems: string[] = [];
    // Baggage limits are structural: over one, the loading is outside limits like any other.
    const area1 = inputs.baggageWeight || 0;
    const area2 = aircraft.stations.baggage2 ? inputs.baggage2Weight || 0 : 0;
    if (area1 > aircraft.maxBaggage + 1e-9) {
      takeoffProblems.push(`Baggage${aircraft.stations.baggage2 ? ' area 1' : ''} ${area1} kg is over its ${aircraft.maxBaggage} kg limit.`);
    }
    if (aircraft.stations.baggage2 && area2 > aircraft.stations.baggage2.maxWeight + 1e-9) {
      takeoffProblems.push(`Baggage area 2 ${area2} kg is over its ${aircraft.stations.baggage2.maxWeight} kg limit.`);
    }
    if (aircraft.maxBaggageTotal !== undefined && area1 + area2 > aircraft.maxBaggageTotal + 1e-9) {
      takeoffProblems.push(`Baggage ${area1 + area2} kg in both areas is over the ${aircraft.maxBaggageTotal} kg joint limit.`);
    }
    const zeroFuelWeight = takeoffWeight - startingFuelWeight;
    if (aircraft.maxZeroFuelWeight !== undefined && zeroFuelWeight > aircraft.maxZeroFuelWeight + 1e-9) {
      takeoffProblems.push(`Zero-fuel weight ${zeroFuelWeight.toFixed(1)} kg is over the ${aircraft.maxZeroFuelWeight} kg limit.`);
    }
    const landingProblems: string[] = [];
    if (fuel2 && landingOptions.some(o => o.ok) && landingOptions.some(o => !o.ok)) {
      const bad = landingOptions.find(o => !o.ok);
      const name = (n: 1 | 2) => (n === 1 ? fuel1.label ?? 'main tank' : fuel2.label ?? 'second tank').toLowerCase();
      landingProblems.push(`Outside the envelope at landing if the ${name(bad?.first ?? 1)} is used first.`);
    }
    if (aircraft.maxLandingWeight !== undefined && landingWeight > aircraft.maxLandingWeight + 1e-9) {
      landingProblems.push(`${(landingWeight - aircraft.maxLandingWeight).toFixed(1)} kg over the ${aircraft.maxLandingWeight} kg max landing weight.`);
    }

    setResults({
      takeoff: {
        totalWeight: takeoffWeight,
        cg: takeoffCG,
        isWithinLimits: isWithinEnvelope(aircraft, takeoffWeight, takeoffCG) && takeoffProblems.length === 0,
        problems: takeoffProblems,
        moments: takeoffMoments
      },
      landing: {
        totalWeight: landingWeight,
        cg: landingCG,
        isWithinLimits: landingOptions.every(o => o.ok) && landingProblems.length === 0,
        problems: landingProblems,
        moments: takeoffMoments,
        fuelRemaining: landingFuelLiters,
        hasMinimumReserve
      }
    });
  }, [selectedAircraft, aircraftList, calculateTripFuel, inputs]);

  const getMaxFuel = (aircraft: AircraftData) => {
    if (inputs.fuelUnit === 'liters') {
      return aircraft.stations.fuel.maxLiters;
    }
    return aircraft.stations.fuel.maxLiters * aircraft.stations.fuel.weightPerLiter; // Convert max liters to kg
  };

  React.useEffect(() => {
    if (selectedAircraft && aircraftList[selectedAircraft]) {
      calculateWeightAndBalance();
    }
  }, [selectedAircraft, aircraftList, calculateWeightAndBalance]);

  // Some aircraft lack a cruise power setting (the DR400/180 has no 55%): use one it has.
  React.useEffect(() => {
    const settings = aircraftList[selectedAircraft]?.performance.fuelConsumption.map(f => f.powerSetting) ?? [];
    if (settings.length > 0 && !settings.includes(inputs.powerSetting)) {
      const fallback = settings.includes('75%') ? '75%' : settings[settings.length - 1];
      setInputs(prev => ({...prev, powerSetting: fallback}));
    }
  }, [aircraftList, selectedAircraft, inputs.powerSetting]);

  // When the list changes, keep the selected aircraft if it is still there; otherwise fall back to
  // the default. Once the database has answered, select a just-added aircraft if one was given.
  const preferredApplied = React.useRef(false);
  React.useEffect(() => {
    if (preferredRegistration && !preferredApplied.current && catalog.source === 'database') {
      preferredApplied.current = true;
      const keys = Object.keys(catalog.meta).filter(k => {
        const m = catalog.meta[k];
        return m.kind === 'airframe' && m.registration === preferredRegistration;
      });
      const key = keys.find(k => {
        const m = catalog.meta[k];
        return m.kind === 'airframe' && m.owned;
      }) ?? keys[0];
      if (key) {
        handleAircraftSelection(key);
        return;
      }
    }
    if (!aircraftList[selectedAircraft]) {
      handleAircraftSelection(pickAircraft(aircraftList));
    }
  }, [aircraftList, catalog.meta, catalog.source, preferredRegistration, selectedAircraft, handleAircraftSelection]);

  // ---- Route: departure/arrival, weather, and the flight time of a trip -----------------------
  const [route, setRouteState] = React.useState<PlannedRoute>(loadRoute);
  const setRoute = React.useCallback((r: PlannedRoute) => { setRouteState(r); saveRoute(r); }, []);

  // Which airfields the planner is used from: each departure once it has settled (typing an ICAO code,
  // or the automatic home/nearest airfield replacing a remembered one, shouldn't count twice).
  const trackedDeparture = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!route.from || route.from === trackedDeparture.current) return;
    const timer = window.setTimeout(() => {
      trackedDeparture.current = route.from;
      track('departure', {airport: route.from});
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [route.from]);
  const weather = useRouteWeather(route.from, route.to, route.via);
  const [locating, setLocating] = React.useState(false);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [locatedCode, setLocatedCode] = React.useState<string | null>(null);

  const metaNow = catalog.meta[selectedAircraft];
  const homeAirport = metaNow?.kind === 'airframe' ? metaNow.homeAirport : null;
  const homeClub = metaNow?.kind === 'airframe' ? metaNow.club : null;
  // A club aircraft starts from the club's airfield, unless the pilot picked the airports themselves.
  React.useEffect(() => {
    if (homeAirport && (route.auto || !route.from) && route.from !== homeAirport) {
      setRoute({from: homeAirport, to: homeAirport, via: [], auto: true});
    }
  }, [homeAirport, route.auto, route.from, setRoute]);

  // Picking another club aircraft plans from its home airfield, even over a route the pilot set:
  // a remembered trip from elsewhere rarely fits the new aircraft. A trip from that airfield is kept.
  const chooseAircraft = React.useCallback((key: string) => {
    const meta = catalog.meta[key];
    const home = meta?.kind === 'airframe' ? meta.homeAirport : null;
    handleAircraftSelection(key);
    if (key !== selectedAircraft && meta) {
      // The model and where it comes from, never the registration: an owner's own aircraft identifies them.
      track('aircraft', meta.kind === 'airframe'
        ? {type: meta.code, source: meta.owned ? 'own' : 'club', ...(meta.club && !meta.owned ? {club: meta.club} : {})}
        : {type: meta.code, source: 'generic'});
    }
    if (key !== selectedAircraft && home && route.from !== home) {
      setRoute({from: home, to: home, via: [], auto: true});
    }
  }, [catalog.meta, handleAircraftSelection, selectedAircraft, route.from, setRoute]);

  // A club link plans from the club's airfield once its aircraft have loaded, like picking one.
  const clubRouteApplied = React.useRef(false);
  React.useEffect(() => {
    if (!clubLink || clubRouteApplied.current || catalog.source !== 'database' || metaNow?.kind !== 'airframe') return;
    clubRouteApplied.current = true;
    if (homeAirport && route.from !== homeAirport) setRoute({from: homeAirport, to: homeAirport, via: [], auto: true});
  }, [clubLink, catalog.source, metaNow, homeAirport, route.from, setRoute]);

  const locateNearest = React.useCallback(async (quiet = false) => {
    setLocating(true);
    setLocationError(null);
    try {
      const pos = await currentPosition();
      const [nearest] = await nearestAirports(pos.lat, pos.lon);
      if (nearest) {
        setLocatedCode(nearest.airport.code);
        setRoute({from: nearest.airport.code, to: nearest.airport.code, via: [], auto: true});
      }
    } catch (e) {
      if (!quiet) setLocationError(e instanceof Error ? e.message : 'Could not find the nearest airport.');
    } finally {
      setLocating(false);
    }
  }, [setRoute]);
  // Without a club airfield, use the position - but only if the pilot already allowed it; never prompt on load.
  const triedLocation = React.useRef(false);
  React.useEffect(() => {
    if (triedLocation.current || route.from || homeAirport) return;
    triedLocation.current = true;
    locationAlreadyAllowed().then(ok => { if (ok) locateNearest(true); });
  }, [route.from, homeAirport, locateNearest]);

  // A trip (arrival differs from departure) sets the flight time from distance and cruise speed,
  // until the pilot sets the time themselves.
  // A trip goes somewhere: a different arrival, or via waypoints (a round trip).
  const trip = weather.data && weather.data.distanceNm > 0 ? weather.data : null;
  const cruise = aircraftList[selectedAircraft]?.performance.fuelConsumption.find(f => f.powerSetting === inputs.powerSetting);
  const cruiseKt = cruise ? Math.round(cruise.speedUnit === 'MPH' ? cruise.speed * MPH_TO_KT : cruise.speed) : 0;
  // With the en-route forecast, each ~25 NM segment is timed at its groundspeed in the wind
  // forecast for when it's flown.
  const [altitudeFt, setAltitudeFt] = useCruiseAltitude();
  // The book speed by altitude: faster higher up at the same power, up to full-throttle altitude.
  const powerPct = parseInt(inputs.powerSetting, 10) || 75;
  const tasAtFt = React.useCallback((ft: number) => cruiseTas(cruiseKt, ft, powerPct), [cruiseKt, powerPct]);
  const tasKt = Math.round(tasAtFt(altitudeFt));
  const [departure, setDeparture] = React.useState(''); // datetime-local; empty = now
  const departureAt = React.useMemo(() => {
    const t = departure ? new Date(departure).getTime() : NaN;
    return Number.isNaN(t) || t <= Date.now() ? null : new Date(t);
  }, [departure]);
  // Only ask for the forecast when the flight can happen: loading within limits, and enough fuel
  // without wind. (Not with the wind: a headwind failing the fuel check would drop the forecast,
  // which would pass the check again.)
  const noWindMinutes = trip ? flightMinutes(trip.distanceNm, tasKt) : 0;
  const plannedAircraft = aircraftList[selectedAircraft];
  let blockedReason: string | null = null;
  if (trip && plannedAircraft && cruise) {
    const totalFuel = inputs.fuelAmount + (plannedAircraft.stations.fuel2 ? inputs.fuel2Amount || 0 : 0);
    const startLiters = inputs.fuelUnit === 'kg' ? totalFuel / plannedAircraft.stations.fuel.weightPerLiter : totalFuel;
    const landingLiters = startLiters - plannedAircraft.performance.taxiFuel.liters - (cruise.litersPerHour * noWindMinutes) / 60;
    const reserve = plannedAircraft.performance.reserveFuel.recommendedLiters;
    if (!(plannedAircraft.basicEmptyWeight > 0)) {
      blockedReason = 'Enter your aircraft\'s empty weight first; then the en-route forecast is loaded.';
    } else if (results && !results.takeoff.isWithinLimits) {
      blockedReason = 'The loading is outside the weight and balance limits. Fix that first; then the en-route forecast is loaded.';
    } else if (landingLiters < reserve) {
      blockedReason = `Not enough fuel for this route even without wind (${Math.max(0, Math.round(landingLiters))} L at landing, `
        + `reserve ${reserve} L). Add fuel first; then the en-route forecast is loaded.`;
    }
  }
  const forecast = useEnrouteForecast(trip, altitudeFt, departureAt, !!trip && cruiseKt > 0 && !blockedReason);
  // Climb at Vy (the aircraft's best rate of climb) and descend at cruise speed, at the pilot's rates.
  const [climbRates, setClimbRates] = useClimbRates(selectedAircraft);
  const perf = plannedAircraft?.performance;
  const vyKt = perf ? Math.round(perf.speedUnit === 'MPH' ? perf.bestClimbSpeed * MPH_TO_KT : perf.bestClimbSpeed) : 0;
  /** The climb to a cruise altitude and the descent from it; undefined without the rates. */
  const verticalFor = React.useCallback((cruiseFt: number): VerticalProfile | undefined => {
    if (!trip || !(vyKt > 0) || !validRate(climbRates.climbFpm) || !validRate(climbRates.descentFpm)) return undefined;
    const departureFt = trip.departure.elevationFt ?? 0;
    const arrivalFt = (trip.arrival.elevationFt ?? 0) + CIRCUIT_HEIGHT_FT;
    return {
      cruiseFt, departureFt, arrivalFt,
      climbTasKt: trueAirspeed(vyKt, (departureFt + cruiseFt) / 2),
      climbFpm: climbRates.climbFpm, descentFpm: climbRates.descentFpm,
    };
  }, [trip, vyKt, climbRates.climbFpm, climbRates.descentFpm]);
  // Stretches flown at another altitude (under or over an airspace); cleared with a new route.
  const [holds, setHolds] = React.useState<AltitudeHold[]>([]);
  const activeHolds = React.useMemo(() => (trip ? tidyHolds(holds, trip.distanceNm) : holds), [holds, trip]);
  const addHold = React.useCallback((h: AltitudeHold) => setHolds(prev => [...prev, h]), []);
  // A saved or shared route's altitude changes, set once the new route has cleared the old ones.
  const pendingHolds = React.useRef<AltitudeHold[] | null>(null);
  const loadRouteWithAltitudes = React.useCallback((r: PlannedRoute, altitudes?: RouteAltitudes) => {
    // The changes are relative to the cruise altitude, so they come only with it.
    const withCruise = altitudes?.cruiseAltitudeFt != null && validAltitude(altitudes.cruiseAltitudeFt) ? altitudes : null;
    if (withCruise?.cruiseAltitudeFt) setAltitudeFt(withCruise.cruiseAltitudeFt);
    const loaded = altitudes ? (withCruise?.altitudeChanges ?? []).map(c => ({ ...c, note: c.note ?? undefined })) : null;
    const same = r.from === route.from && r.to === route.to && r.via.join() === route.via.join();
    if (same) { if (loaded) setHolds(loaded); } else pendingHolds.current = loaded;
    setRoute(r);
  }, [route, setRoute, setAltitudeFt]);
  const routeAltitudes = React.useMemo<RouteAltitudes>(() => ({
    cruiseAltitudeFt: validAltitude(altitudeFt) ? altitudeFt : null,
    altitudeChanges: activeHolds.map(h => ({
      fromNm: Math.round(h.fromNm * 10) / 10, toNm: Math.round(h.toNm * 10) / 10, ft: h.ft, ...(h.note ? { note: h.note } : {}),
    })),
  }), [altitudeFt, activeHolds]);
  const vertical = React.useMemo(() => {
    const v = verticalFor(altitudeFt);
    return v && activeHolds.length ? { ...v, holds: activeHolds } : v;
  }, [verticalFor, altitudeFt, activeHolds]);
  // The forecast at each hold's altitude, from the cache.
  const holdLevels = React.useMemo(
    () => activeHolds.map(h => h.ft).filter((ft, i, all) => ft !== altitudeFt && validAltitude(ft) && all.indexOf(ft) === i).sort((a, b) => a - b),
    [activeHolds, altitudeFt]);
  // Every altitude up to the pilot's highest, each in its own forecast wind: for the suggestions, and
  // for the holds (any other hold altitude is built on its own).
  const [suggestMaxFt, setSuggestMaxFt] = useSuggestMax();
  const altitudeForecasts = useAltitudeForecasts(trip, departureAt, forecast, suggestMaxFt);
  const otherLevels = React.useMemo(() => holdLevels.filter(ft => !altitudeForecasts?.has(ft)), [holdLevels, altitudeForecasts]);
  const holdForecasts = useForecastsAt(trip, departureAt, forecast, otherLevels);
  const windPlan = React.useMemo(() => {
    const data = forecast.data;
    if (!trip || blockedReason || !data?.available || !(cruiseKt > 0) || !validAltitude(altitudeFt)) return null;
    const legs = legsOf(trip);
    const last = data.segments[data.segments.length - 1];
    if (!last || last.leg !== legs.length - 1 || Math.abs(last.startNm + last.distanceNm - trip.distanceNm) > 1) {
      return null; // still the previous route's forecast
    }
    let flown = data;
    if (activeHolds.length) {
      // Each segment in the forecast for the altitude it's flown at (for a moment, while that's being
      // built, the cruise altitude's).
      const segments = data.segments.map((seg, i) => {
        const ft = levelAt(seg.startNm + seg.distanceNm / 2, altitudeFt, activeHolds);
        const source = ft === altitudeFt ? data : altitudeForecasts?.get(ft) ?? holdForecasts?.get(ft);
        return source && source.segments.length === data.segments.length ? source.segments[i] : seg;
      });
      flown = { ...data, segments };
    }
    return planRoute(legs, flown, tasAtFt, departureAt ?? new Date(), vertical);
  }, [trip, blockedReason, forecast.data, cruiseKt, tasAtFt, departureAt, altitudeFt, vertical, activeHolds, altitudeForecasts, holdForecasts]);
  const windMinutes = windPlan?.ok ? roundUpTo5(windPlan.minutes) : 0;

  // Airspace along the route, checked against the planned climb, cruise and descent.
  const airspaces = useAirspaces(trip);
  const crossings = React.useMemo(
    () => (trip && airspaces.data ? crossingsAlong([trip.departure, ...(trip.waypoints ?? []), trip.arrival], airspaces.data) : null),
    [trip, airspaces.data]);
  /** The check at another cruise altitude: no wind, for comparing (going under or over an airspace). */
  const checkAt = React.useCallback((cruiseFt: number) => {
    if (!trip || !crossings) return [];
    const total = trip.distanceNm;
    const v = verticalFor(cruiseFt);
    const path = v && cruiseKt > 0
      ? pointsOf(stillAirProfile(total, { ...v, cruiseTasKt: tasAtFt(cruiseFt) }))
      : [{ nm: 0, ft: cruiseFt }, { nm: total, ft: cruiseFt }];
    return checkPath(trip, crossings, path);
  }, [trip, crossings, verticalFor, cruiseKt, tasAtFt]);
  const airspaceCheck = React.useMemo(() => {
    if (!trip || !crossings) return null;
    const total = trip.distanceNm;
    const fpm = `${climbRates.climbFpm} ft/min up, ${climbRates.descentFpm} ft/min down`;
    const changes = activeHolds.length ? `, ${activeHolds.length} altitude change${activeHolds.length === 1 ? '' : 's'}` : '';
    let path: PathPoint[];
    let basis: string;
    if (windPlan?.ok && windPlan.profile) {
      const p = windPlan.profile;
      path = p.path;
      basis = `for the planned path to ${Math.round(p.topFt).toLocaleString('en')} ft (${fpm}${changes}, in the forecast wind)`;
    } else if (vertical && cruiseKt > 0 && validAltitude(altitudeFt)) {
      path = activeHolds.length ? steppedPath(total, vertical, tasKt).path : pointsOf(stillAirProfile(total, { ...vertical, cruiseTasKt: tasKt }));
      basis = `for the planned path to ${Math.round(Math.max(...path.map(p => p.ft))).toLocaleString('en')} ft (${fpm}${changes}, no wind)`;
    } else {
      path = [{ nm: 0, ft: altitudeFt }, { nm: total, ft: altitudeFt }];
      basis = `at ${altitudeFt.toLocaleString('en')} ft the whole way`;
    }
    return { checks: checkPath(trip, crossings, path), basis };
  }, [trip, crossings, windPlan, vertical, cruiseKt, tasKt, altitudeFt, activeHolds, climbRates.climbFpm, climbRates.descentFpm]);
  const avoid = React.useMemo<AvoidHandler | undefined>(() => {
    if (!trip || !airspaceCheck) return undefined;
    const route = [trip.departure, ...(trip.waypoints ?? []), trip.arrival];
    const legs = legsOf(trip);
    const segments = windPlan?.ok ? windPlan.segments.map(s => s.segment) : null;
    const airportsFt = Math.max(...route.map(a => a.elevationFt ?? 0));
    const at = departureAt ?? new Date();
    return {
      altitudeFt,
      onPick: setAltitudeFt,
      onHold: addHold,
      optionsFor: c => withEffects(avoidOptions(c, crossingContext(c, route, legs, segments, airportsFt, at)), c, airspaceCheck.checks, checkAt),
    };
  }, [trip, airspaceCheck, windPlan, departureAt, altitudeFt, setAltitudeFt, checkAt, addHold]);
  const suggestions = React.useMemo(() => {
    if (!trip || !altitudeForecasts || !(cruiseKt > 0)) return null;
    const total = trip.distanceNm;
    const airspaceFor = (plan: OkPlan, ft: number) => {
      if (!crossings) return [];
      return checkPath(trip, crossings, plan.profile?.path ?? [{ nm: 0, ft }, { nm: total, ft }]);
    };
    return suggestAltitudes({
      legs: legsOf(trip), forecasts: altitudeForecasts, tasKt: tasAtFt, departure: departureAt ?? new Date(), verticalFor, airspaceFor,
    });
  }, [trip, altitudeForecasts, cruiseKt, tasAtFt, departureAt, verticalFor, crossings]);
  const swedenControl = React.useMemo(
    () => (trip ? swedenControlAlong([trip.departure, ...(trip.waypoints ?? []), trip.arrival]) : []), [trip]);
  const routeMinutes = trip ? windMinutes || noWindMinutes : 0;
  const [manualTime, setManualTime] = React.useState(false);
  const viaKey = route.via.join(',');
  React.useEffect(() => {
    setManualTime(false);
    setHolds(pendingHolds.current ?? []);
    pendingHolds.current = null;
  }, [route.from, route.to, viaKey]);
  React.useEffect(() => {
    if (routeMinutes > 0 && !manualTime) {
      setInputs(prev => (prev.flightTime === routeMinutes ? prev : {...prev, flightTime: routeMinutes}));
    }
  }, [routeMinutes, manualTime]);
  const fmtTime = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

  const aircraft = aircraftList[selectedAircraft];
  const selectedMeta = catalog.meta[selectedAircraft];
  if (!aircraft) return null; // only for the render before the list effect picks another aircraft
  const verdict = results ? verdictOf(results) : null;
  const maxFuel = getMaxFuel(aircraft);

  return (
    <>
      <DisclaimerModal open={!disclaimerAccepted} onAccept={handleDisclaimerAccept}/>

      <div className="mb-5 space-y-3 empty:hidden print:hidden">
        <SharedRouteBanner signedIn={userId !== null} onUse={loadRouteWithAltitudes}/>
        {clubLink && <ClubLinkBanner code={clubLink} catalog={catalog}/>}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
        <div className="min-w-0 space-y-5 print:hidden">
          <Section
            step={1}
            title="Aircraft"
            aside={hasSpecific && !clubLink && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  checked={!hideGeneric}
                  onChange={e => toggleGeneric(!e.target.checked)}
                />
                Show generic aircraft
              </label>
            )}
          >
            <AircraftPicker
              keys={Object.keys(aircraftList)}
              meta={catalog.meta}
              value={selectedAircraft}
              onChange={chooseAircraft}
            />
            {!(clubLink && userId === null) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ClubAircraftButton onSaved={catalog.reload}/>
              </div>
            )}
            {onOpenProfile && <ClubHint onOpenProfile={onOpenProfile}/>}
            <AircraftSourceNotice catalog={catalog} selectedMeta={selectedMeta}/>
          </Section>

          <AircraftHero aircraft={aircraft} meta={selectedMeta}/>

          {selectedMeta?.kind === 'generic' && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 dark:bg-amber-950/20 sm:p-5">
              <GenericEmptyWeight
                weight={emptyOverrides[selectedAircraft]?.weight ?? catalog.aircraft[selectedAircraft].basicEmptyWeight}
                arm={emptyOverrides[selectedAircraft]?.arm ?? catalog.aircraft[selectedAircraft].armAftDatum}
                typicalWeight={selectedMeta.noTypicalEmpty ? null : catalog.aircraft[selectedAircraft].basicEmptyWeight}
                typicalArm={selectedMeta.noTypicalEmpty ? null : catalog.aircraft[selectedAircraft].armAftDatum}
                onChange={value => updateEmptyOverride(selectedAircraft, value)}
              />
            </div>
          )}

          <Section step={2} title="People and baggage">
            <p className="-mt-2 text-xs text-muted-foreground">Tap a seat to enter the person&apos;s weight.</p>
            <SeatLayout weights={inputs} layout={getSeatLayout(aircraft)} onChange={handleWeightChange}/>
            <BaggageInputs aircraft={aircraft} inputs={inputs} onChange={handleInputChange}/>
          </Section>

          <Section step={3} title="Route and weather">
            <RouteSection
              route={route}
              onChange={setRoute}
              altitudes={routeAltitudes}
              onLoad={loadRouteWithAltitudes}
              weather={weather}
              maxCrosswindKt={aircraft.performance.maxDemoCrosswind}
              onUseLocation={() => locateNearest(false)}
              locating={locating}
              locationError={locationError}
              signedIn={userId !== null}
              defaultNote={route.from && route.from === homeAirport && metaNow?.kind === 'airframe'
                ? (metaNow.homeAirportOwn || !homeClub ? `${metaNow.registration}'s home airfield` : `${homeClub}'s home airfield`)
                : route.from && route.from === locatedCode ? 'Nearest airport to your location' : null}
            />
            {trip && cruiseKt > 0 && (
              <EnroutePanel
                altitudeFt={altitudeFt}
                onAltitudeChange={setAltitudeFt}
                departure={departure}
                onDepartureChange={setDeparture}
                blockedReason={blockedReason}
                forecast={forecast}
                plan={windPlan}
                tasKt={tasKt}
                vyKt={vyKt}
                climbRates={climbRates}
                onClimbRatesChange={setClimbRates}
                airspaces={airspaceCheck?.checks}
                avoid={avoid}
                suggestions={suggestions}
                suggestMaxFt={suggestMaxFt}
                onSuggestMaxChange={setSuggestMaxFt}
                holds={activeHolds}
                onHoldsChange={setHolds}
              />
            )}
            {trip && (
              <AirspacePanel state={airspaces} checks={airspaceCheck?.checks ?? []} basis={airspaceCheck?.basis ?? ''} swedenControl={swedenControl} avoid={avoid}/>
            )}
          </Section>

          <Section step={4} title="Fuel and flight">
            <FormItem>
              <FormLabel>{aircraft.stations.fuel2 ? aircraft.stations.fuel.label ?? 'Main tank' : 'Fuel on board'}</FormLabel>
              <div className="flex gap-2">
                <div className="flex-1">
                  <NumberInput
                    aria-label="Fuel amount"
                    value={inputs.fuelAmount}
                    min={0}
                    max={maxFuel}
                    onChange={(e) => handleInputChange('fuelAmount', e.toString())}
                  />
                </div>
                <Select value={inputs.fuelUnit} onValueChange={(value: 'liters' | 'kg') => handleFuelUnitChange(value)}>
                  <SelectTrigger className="w-28 bg-background" aria-label="Fuel unit">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    <SelectItem value="liters">Liters</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{getFuelLevelLabel(inputs.fuelAmount, aircraft)}</span>
                <span>{Math.round((inputs.fuelAmount / maxFuel) * 100)}% of {maxFuel.toFixed(0)} {inputs.fuelUnit === 'liters' ? 'L' : 'kg'}</span>
              </div>
              <Progress
                value={(inputs.fuelAmount / maxFuel) * 100}
                className="h-2"
                indicatorClassName={getFuelLevelColor(inputs.fuelAmount, aircraft)}
              />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  variant={inputs.fuelAmount === aircraft.stations.fuel.standardLiters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleQuickFuelSelect('standard')}
                >
                  Standard ({aircraft.stations.fuel.standardLiters} L)
                </Button>
                <Button
                  type="button"
                  variant={inputs.fuelAmount === aircraft.stations.fuel.maxLiters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleQuickFuelSelect('full')}
                >
                  Full ({aircraft.stations.fuel.maxLiters} L)
                </Button>
              </div>
            </FormItem>
            {aircraft.stations.fuel2 && (
              <SecondTank
                tank={aircraft.stations.fuel2}
                amount={inputs.fuel2Amount || 0}
                unit={inputs.fuelUnit}
                onChange={value => setInputs(prev => ({...prev, fuel2Amount: value}))}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormItem>
                <FormLabel>Cruise power</FormLabel>
                <Select
                  value={inputs.powerSetting}
                  onValueChange={(value: '55%' | '65%' | '75%') => setInputs(prev => ({...prev, powerSetting: value}))}
                >
                  <SelectTrigger className="bg-background text-foreground" aria-label="Cruise power">
                    <SelectValue placeholder="Select power setting"/>
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    {aircraft.performance.fuelConsumption.map(setting => (
                      <SelectItem key={setting.powerSetting} value={setting.powerSetting} className="text-foreground">
                        {setting.powerSetting} · {setting.speed} {setting.speedUnit === 'MPH' ? 'mph' : 'kt'} · {setting.litersPerHour} L/h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
              <div>
                <FlightTimeInput
                  value={inputs.flightTime}
                  onChange={(minutes) => {
                    if (trip) setManualTime(true);
                    setInputs(prev => ({...prev, flightTime: minutes}));
                  }}
                />
                {trip && routeMinutes > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {manualTime
                      ? <>Set by you. <button type="button" className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setManualTime(false)}>Use the route time ({fmtTime(routeMinutes)})</button></>
                      : windMinutes > 0 && windPlan?.ok
                        ? <>From the route: {Math.round(trip.distanceNm)} NM at {tasKt} kt true airspeed in the forecast wind at {altitudeFt.toLocaleString('en')} ft
                          {windPlan.profile ? `, climbing at ${vyKt} kt and ${climbRates.climbFpm} ft/min` : ''},
                          average groundspeed {Math.round(trip.distanceNm / (windPlan.minutes / 60))} kt{(trip.legs?.length ?? 1) > 1 ? `, ${trip.legs?.length} legs` : ''}.</>
                        : <>From the route: {Math.round(trip.distanceNm)} NM at {tasKt} kt true airspeed, no wind{(trip.legs?.length ?? 1) > 1 ? `, ${trip.legs?.length} legs` : ''}.</>}
                  </p>
                )}
              </div>
            </div>
          </Section>

          <SafetyDisclaimer/>
        </div>

        <aside className="lg:sticky lg:top-24">
          <ResultsPanel
            results={results}
            aircraft={aircraft}
            fuelAmount={inputs.fuelAmount + (aircraft.stations.fuel2 ? inputs.fuel2Amount || 0 : 0)}
            fuelUnit={inputs.fuelUnit}
            tripFuel={calculateTripFuel()}
            powerSetting={inputs.powerSetting}
            waitingFor={aircraft.basicEmptyWeight > 0 ? null
              : 'Enter your aircraft\'s empty weight and arm from its weighing report (under the aircraft) to see the results.'}
            routeLabel={trip ? `${[trip.departure.code, ...(trip.waypoints ?? []).map(w => w.code), trip.arrival.code].join(' → ')} · ${Math.round(trip.distanceNm)} NM · ${fmtTime(inputs.flightTime)} at ${inputs.powerSetting}` : null}
          />
        </aside>
      </form>

      {/* Mobile: the verdict stays in view while editing; tap to jump to the details. */}
      {results && verdict && (
        <a
          href="#results"
          className={cn(
            'fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur lg:hidden print:hidden',
            verdictStyles[verdict],
          )}
        >
          <VerdictIcon verdict={verdict} className="h-5 w-5 shrink-0"/>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">{VERDICT_TEXT[verdict].title}</span>
            <span className="block text-xs tabular-nums opacity-80">
              Takeoff {results.takeoff.totalWeight.toFixed(0)} kg · CG {results.takeoff.cg.toFixed(3)} m
            </span>
          </span>
          <span className="text-xs font-medium underline">Details</span>
        </a>
      )}

      {results && (
        <div className="hidden print:block mt-8">
          <h2 className="text-xl font-bold mb-4">Weight & Balance Calculation Summary</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Aircraft Information</h3>
              <p>Aircraft: {selectedMeta?.kind === 'generic' ? `${selectedMeta.label} (generic)` : selectedAircraft}</p>
              <p>Empty weight: {aircraft.basicEmptyWeight} kg, arm {aircraft.armAftDatum} m</p>
              <p>Date: {new Date().toLocaleDateString()}</p>
            </div>
            <div>
              <h3 className="font-semibold">Input Weights</h3>
              <p>Pilot & Front Passenger: {inputs.pilotWeight + inputs.frontPassengerWeight} kg</p>
              <p>Rear Passengers: {inputs.rearLeftPassengerWeight + inputs.rearRightPassengerWeight} kg</p>
              <p>Baggage: {inputs.baggageWeight} kg{aircraft.stations.baggage2 ? `, area 2: ${inputs.baggage2Weight || 0} kg` : ''}</p>
              <p>Fuel: {inputs.fuelAmount} {inputs.fuelUnit}{aircraft.stations.fuel2 ? `, ${aircraft.stations.fuel2.label ?? 'tank 2'}: ${inputs.fuel2Amount || 0} ${inputs.fuelUnit}` : ''}</p>
              <p>Flight Time: {Math.floor(inputs.flightTime / 60)}:{(inputs.flightTime % 60).toString().padStart(2, '0')} hours</p>
            </div>
          </div>
          <div className="mt-8 text-sm">
            <p>Note: This is a calculation tool only. Always verify weight and balance using the aircraft&apos;s POH.</p>
            <p>Generated by Weight & Balance Calculator - Songer Consulting AB</p>
          </div>
        </div>
      )}
      <div className="pb-20 lg:pb-0"><CompanyFooter/></div>
    </>
  );
};
/** A second fuel tank at its own arm (e.g. the Robin DR400's wing tanks). */
const SecondTank: React.FC<{
  tank: NonNullable<AircraftData['stations']['fuel2']>;
  amount: number;
  unit: 'liters' | 'kg';
  onChange: (value: number) => void;
}> = ({ tank, amount, unit, onChange }) => {
  const max = unit === 'liters' ? tank.maxLiters : tank.maxLiters * tank.weightPerLiter;
  const u = unit === 'liters' ? 'L' : 'kg';
  return (
    <FormItem>
      <FormLabel htmlFor="fuel2">{tank.label ?? 'Second tank'} <span className="font-normal text-muted-foreground">· max {Math.round(max)} {u}</span></FormLabel>
      <div className="flex gap-2">
        <div className="flex-1">
          <NumberInput id="fuel2" value={amount} min={0} max={max} unit={u} onChange={onChange}/>
        </div>
        <Button type="button" variant={amount === 0 ? 'default' : 'outline'} onClick={() => onChange(0)}>Empty</Button>
        <Button type="button" variant={Math.abs(amount - max) < 0.05 ? 'default' : 'outline'} onClick={() => onChange(Math.round(max * 10) / 10)}>Full</Button>
      </div>
      <p className="text-xs text-muted-foreground">At landing the CG is checked whichever tank you use first.</p>
    </FormItem>
  );
};

/** Baggage, with a second area and a joint limit for aircraft whose POH has them. */
const BaggageInputs: React.FC<{
  aircraft: AircraftData;
  inputs: CalculatorInputs;
  onChange: (field: 'baggageWeight' | 'baggage2Weight', value: string) => void;
}> = ({ aircraft, inputs, onChange }) => {
  const area2 = aircraft.stations.baggage2;
  const area1Kg = inputs.baggageWeight || 0;
  const area2Kg = area2 ? inputs.baggage2Weight || 0 : 0;
  const total = aircraft.maxBaggageTotal;
  return (
    <div className="space-y-2">
      <div className={cn('grid gap-3', area2 && 'sm:grid-cols-2')}>
        <FormItem>
          <FormLabel htmlFor="baggage">{area2 ? 'Baggage area 1' : 'Baggage'} (kg) <span className="font-normal text-muted-foreground">· max {aircraft.maxBaggage} kg</span></FormLabel>
          <NumberInput id="baggage" value={area1Kg} min={0} placeholder="0" onChange={v => onChange('baggageWeight', v.toString())}/>
          {area1Kg > aircraft.maxBaggage && <p className="text-xs text-red-600">Above the {aircraft.maxBaggage} kg limit for this area.</p>}
        </FormItem>
        {area2 && (
          <FormItem>
            <FormLabel htmlFor="baggage2">Baggage area 2 (kg) <span className="font-normal text-muted-foreground">· max {area2.maxWeight} kg</span></FormLabel>
            <NumberInput id="baggage2" value={area2Kg} min={0} placeholder="0" onChange={v => onChange('baggage2Weight', v.toString())}/>
            {area2Kg > area2.maxWeight && <p className="text-xs text-red-600">Above the {area2.maxWeight} kg limit for this area.</p>}
          </FormItem>
        )}
      </div>
      {area2 && total !== undefined && (
        <p className={cn('text-xs', area1Kg + area2Kg > total ? 'text-red-600' : 'text-muted-foreground')}>
          {area1Kg + area2Kg > total
            ? `Both areas together: ${area1Kg + area2Kg} kg, above the ${total} kg joint limit.`
            : `Both areas together at most ${total} kg.`}
        </p>
      )}
    </div>
  );
};

export default WeightBalanceCalculator;