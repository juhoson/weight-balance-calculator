import * as React from 'react';
import {Button} from './ui/Button';
import {NumberInput} from './ui/NumberInput';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/Select';
import {type AircraftData, calculateCG, calculateMoment, isWithinEnvelope} from '../data/aircraftData';
import {useAircraftCatalog} from '../lib/useAircraftCatalog';
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
import GenericEmptyWeight from './GenericEmptyWeight';
import AircraftPicker from './AircraftPicker';
import AircraftHero from './AircraftHero';
import ResultsPanel, {VERDICT_TEXT, VerdictIcon, verdictOf, verdictStyles} from './ResultsPanel';
import {genericKey} from '../lib/aircraftCatalog';
import {loadEmptyOverrides, saveEmptyOverrides, type EmptyOverrides} from '../lib/emptyOverrides';
import {cn} from '../lib/utils';
import RouteSection from './route/RouteSection';
import {useRouteWeather} from '../lib/useRouteWeather';
import {currentPosition, loadRoute, locationAlreadyAllowed, type PlannedRoute, saveRoute} from '../lib/route';
import {nearestAirports} from '../api/backend';
import {flightMinutes, MPH_TO_KT} from '../lib/wind';

export interface CalculatorInputs {
    pilotWeight: number;
    frontPassengerWeight: number;
    rearLeftPassengerWeight: number;
    rearRightPassengerWeight: number;
    backLeftPassengerWeight?: number;    // Added for 3rd row left passenger in 6-seater
    backRightPassengerWeight?: number;   // Added for 3rd row right passenger in 6-seater
    backPassengerWeight?: number;        // For tandem aircraft
    baggageWeight: number;
    fuelAmount: number;
    fuelUnit: 'liters' | 'kg';
    flightTime: number;
    powerSetting: '55%' | '65%' | '75%';
}

interface CalculationResults {
    takeoff: {
        totalWeight: number;
        cg: number;
        isWithinLimits: boolean;
        moments: Record<string, number>;
    };
    landing: {
        totalWeight: number;
        cg: number;
        isWithinLimits: boolean;
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

interface WeightBalanceCalculatorProps {
  /** Select this aircraft once the database list has loaded (e.g. one just added). */
  preferredRegistration?: string | null;
}

const WeightBalanceCalculator: React.FC<WeightBalanceCalculatorProps> = ({preferredRegistration}) => {
  const catalog = useAircraftCatalog();
  const userId = useAuth().user?.id ?? null;
  // Signed in, the generic aircraft can be hidden (remembered per user in this browser).
  const hideGenericKey = `hideGenericAircraft.v1.${userId}`;
  const [hideGeneric, setHideGeneric] = React.useState(() => userId !== null && readFlag(hideGenericKey));
  React.useEffect(() => { setHideGeneric(userId !== null && readFlag(hideGenericKey)); }, [userId, hideGenericKey]);
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
      fuelAmount: standardFuel,
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

    setInputs(prev => ({
      ...prev,
      fuelUnit: unit,
      fuelAmount: parseFloat(newFuelAmount.toFixed(1))
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
    const layout = getSeatLayout(aircraft);
    const isTandem = layout === 'tandem';
    const is6Seater = layout === 'sixSeat';

    // Calculate trip fuel
    const tripFuel = calculateTripFuel();
    const totalFuelConsumed = tripFuel + aircraft.performance.taxiFuel.liters;

    // Convert fuel to weight for calculations
    const startingFuelWeight = inputs.fuelUnit === 'kg'
      ? inputs.fuelAmount
      : inputs.fuelAmount * aircraft.stations.fuel.weightPerLiter;

    const landingFuelWeight = Math.max(0, startingFuelWeight -
            (totalFuelConsumed * aircraft.stations.fuel.weightPerLiter));

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
          rearLeftPassenger: calculateMoment(
            inputs.rearLeftPassengerWeight,
            aircraft.stations.passengerRear?.arm || 0
          ),
          rearRightPassenger: calculateMoment(
            inputs.rearRightPassengerWeight,
            aircraft.stations.passengerRear?.arm || 0
          ),
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
      fuel: calculateMoment(startingFuelWeight, aircraft.stations.fuel.arm)
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
            startingFuelWeight;

    // Rest of the calculation remains the same
    const landingWeight = takeoffWeight - (startingFuelWeight - landingFuelWeight);

    const takeoffTotalMoment = Object.values(takeoffMoments).reduce((sum, moment) => sum + moment, 0);
    const landingTotalMoment = Object.values({
      ...takeoffMoments,
      fuel: calculateMoment(landingFuelWeight, aircraft.stations.fuel.arm)
    })
      .reduce((sum, moment) => sum + moment, 0);

    const takeoffCG = calculateCG(takeoffWeight, takeoffTotalMoment);
    const landingCG = calculateCG(landingWeight, landingTotalMoment);

    const landingFuelLiters = landingFuelWeight / aircraft.stations.fuel.weightPerLiter;
    const hasMinimumReserve = landingFuelLiters >= aircraft.performance.reserveFuel.recommendedLiters;

    setResults({
      takeoff: {
        totalWeight: takeoffWeight,
        cg: takeoffCG,
        isWithinLimits: isWithinEnvelope(aircraft, takeoffWeight, takeoffCG),
        moments: takeoffMoments
      },
      landing: {
        totalWeight: landingWeight,
        cg: landingCG,
        isWithinLimits: isWithinEnvelope(aircraft, landingWeight, landingCG),
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
  const weather = useRouteWeather(route.from, route.to);
  const [locating, setLocating] = React.useState(false);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [locatedCode, setLocatedCode] = React.useState<string | null>(null);

  const metaNow = catalog.meta[selectedAircraft];
  const homeAirport = metaNow?.kind === 'airframe' ? metaNow.homeAirport : null;
  const homeClub = metaNow?.kind === 'airframe' ? metaNow.club : null;
  // A club aircraft starts from the club's airfield, unless the pilot picked the airports themselves.
  React.useEffect(() => {
    if (homeAirport && (route.auto || !route.from) && route.from !== homeAirport) {
      setRoute({from: homeAirport, to: homeAirport, auto: true});
    }
  }, [homeAirport, route.auto, route.from, setRoute]);

  const locateNearest = React.useCallback(async (quiet = false) => {
    setLocating(true);
    setLocationError(null);
    try {
      const pos = await currentPosition();
      const [nearest] = await nearestAirports(pos.lat, pos.lon);
      if (nearest) {
        setLocatedCode(nearest.airport.code);
        setRoute({from: nearest.airport.code, to: nearest.airport.code, auto: true});
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
  const trip = weather.data && weather.data.departure.code !== weather.data.arrival.code ? weather.data : null;
  const cruise = aircraftList[selectedAircraft]?.performance.fuelConsumption.find(f => f.powerSetting === inputs.powerSetting);
  const cruiseKt = cruise ? Math.round(cruise.speedUnit === 'MPH' ? cruise.speed * MPH_TO_KT : cruise.speed) : 0;
  const routeMinutes = trip ? flightMinutes(trip.distanceNm, cruiseKt) : 0;
  const [manualTime, setManualTime] = React.useState(false);
  React.useEffect(() => { setManualTime(false); }, [route.from, route.to]);
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

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
        <div className="space-y-5 print:hidden">
          <Section
            step={1}
            title="Aircraft"
            aside={userId !== null && hasSpecific && (
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
              onChange={handleAircraftSelection}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ClubAircraftButton onSaved={catalog.reload}/>
            </div>
            <AircraftSourceNotice catalog={catalog} selectedMeta={selectedMeta}/>
          </Section>

          <AircraftHero aircraft={aircraft} meta={selectedMeta}/>

          {selectedMeta?.kind === 'generic' && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 dark:bg-amber-950/20 sm:p-5">
              <GenericEmptyWeight
                weight={emptyOverrides[selectedAircraft]?.weight ?? catalog.aircraft[selectedAircraft].basicEmptyWeight}
                arm={emptyOverrides[selectedAircraft]?.arm ?? catalog.aircraft[selectedAircraft].armAftDatum}
                typicalWeight={catalog.aircraft[selectedAircraft].basicEmptyWeight}
                typicalArm={catalog.aircraft[selectedAircraft].armAftDatum}
                onChange={value => updateEmptyOverride(selectedAircraft, value)}
              />
            </div>
          )}

          <Section step={2} title="People and baggage">
            <p className="-mt-2 text-xs text-muted-foreground">Tap a seat to enter the person&apos;s weight.</p>
            <SeatLayout weights={inputs} layout={getSeatLayout(aircraft)} onChange={handleWeightChange}/>
            <FormItem>
              <FormLabel htmlFor="baggage">Baggage (kg) <span className="font-normal text-muted-foreground">· max {aircraft.maxBaggage} kg</span></FormLabel>
              <NumberInput
                id="baggage"
                value={inputs.baggageWeight || 0}
                min={0}
                placeholder="0"
                onChange={(e) => handleInputChange('baggageWeight', e.toString())}
              />
              {inputs.baggageWeight > aircraft.maxBaggage && (
                <p className="text-xs text-red-600">Above the {aircraft.maxBaggage} kg baggage limit.</p>
              )}
            </FormItem>
          </Section>

          <Section step={3} title="Route and weather">
            <RouteSection
              route={route}
              onChange={setRoute}
              weather={weather}
              maxCrosswindKt={aircraft.performance.maxDemoCrosswind}
              onUseLocation={() => locateNearest(false)}
              locating={locating}
              locationError={locationError}
              defaultNote={route.from && route.from === homeAirport && homeClub ? `${homeClub}'s home airfield`
                : route.from && route.from === locatedCode ? 'Nearest airport to your location' : null}
            />
          </Section>

          <Section step={4} title="Fuel and flight">
            <FormItem>
              <FormLabel>Fuel on board</FormLabel>
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
                      : <>From the route: {Math.round(trip.distanceNm)} NM at {cruiseKt} kt, no wind.</>}
                  </p>
                )}
              </div>
            </div>
          </Section>

          <SafetyDisclaimer/>
        </div>

        <aside className="lg:sticky lg:top-4">
          <ResultsPanel
            results={results}
            aircraft={aircraft}
            fuelAmount={inputs.fuelAmount}
            fuelUnit={inputs.fuelUnit}
            tripFuel={calculateTripFuel()}
            powerSetting={inputs.powerSetting}
            routeLabel={trip ? `${trip.departure.code} → ${trip.arrival.code} · ${Math.round(trip.distanceNm)} NM · ${fmtTime(inputs.flightTime)} at ${inputs.powerSetting}` : null}
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
              <p>Baggage: {inputs.baggageWeight} kg</p>
              <p>Fuel: {inputs.fuelAmount} {inputs.fuelUnit}</p>
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
export default WeightBalanceCalculator;