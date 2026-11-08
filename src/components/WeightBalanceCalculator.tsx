import * as React from 'react';
import CGEnvelopeVisualization from './CGEnvelopeVisualization';
import {Button} from './ui/Button';
import {NumberInput} from './ui/NumberInput';
import {Alert, AlertDescription, AlertTitle} from './ui/Alert';
import {Card, CardContent, CardHeader, CardTitle} from './ui/Card';
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue} from './ui/Select';

import {type AircraftData, calculateCG, calculateMoment, isWithinEnvelope} from '../data/aircraftData';
import {useAircraftCatalog} from '../lib/useAircraftCatalog';
import {getSeatLayout} from '../lib/seatLayout';
import {FormItem, FormLabel, FormMessage} from './ui/Form';
import AircraftInfoBox from './AircraftInfoBox';
import SafetyDisclaimer from './SafetyDisclaimer';
import DisclaimerModal from './DisclaimerModal';
import {Progress} from './ui/Progress';
import FlightTimeInput from './FlightTimeInput';
import AircraftBackground from './AircraftBackground';
import CompanyFooter from './CompanyFooter';
import PrintButton from './PrintButton';
import SeatLayout from './SeatLayout';
import AircraftSourceNotice from './AircraftSourceNotice';
import ClubAircraftButton from './ClubAircraftDialog';
import GenericEmptyWeight from './GenericEmptyWeight';
import {type AircraftMeta, genericKey} from '../lib/aircraftCatalog';
import {loadEmptyOverrides, saveEmptyOverrides, type EmptyOverrides} from '../lib/emptyOverrides';

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

const MemoizedAircraftBackground = React.memo(AircraftBackground, (prevProps, nextProps) => {
  return prevProps.selectedAircraft === nextProps.selectedAircraft;
});

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

/** The aircraft list's sections: generic models, your own aircraft, then each club. */
function groupKeys(keys: string[], meta: Record<string, AircraftMeta>): Array<{ title: string; keys: string[] }> {
  const groups = new Map<string, string[]>();
  const add = (title: string, key: string) => groups.set(title, [...(groups.get(title) ?? []), key]);
  for (const key of keys) {
    const m = meta[key];
    if (!m || m.kind === 'generic') add('Generic aircraft', key);
    else if (m.owned) add('Your aircraft', key);
    else add(m.club ?? 'Other aircraft', key);
  }
  const fixed = ['Generic aircraft', 'Your aircraft'];
  const clubs = Array.from(groups.keys()).filter(t => !fixed.includes(t)).sort((a, b) => a.localeCompare(b));
  return [...fixed, ...clubs].filter(t => groups.has(t)).map(title => ({ title, keys: groups.get(title) as string[] }));
}

interface WeightBalanceCalculatorProps {
  /** Select this aircraft once the database list has loaded (e.g. one just added). */
  preferredRegistration?: string | null;
}

const WeightBalanceCalculator: React.FC<WeightBalanceCalculatorProps> = ({preferredRegistration}) => {
  const catalog = useAircraftCatalog();
  // A generic aircraft's empty weight and arm are the pilot's own (remembered per model).
  const [emptyOverrides, setEmptyOverrides] = React.useState<EmptyOverrides>(loadEmptyOverrides);
  const aircraftList = React.useMemo(() => {
    const list = {...catalog.aircraft};
    for (const [key, o] of Object.entries(emptyOverrides)) {
      // A cleared field (0) falls back to the typical value; GenericEmptyWeight says so.
      if (list[key] && catalog.meta[key]?.kind === 'generic' && o.weight > 0 && o.arm > 0) {
        list[key] = {...list[key], basicEmptyWeight: o.weight, armAftDatum: o.arm};
      }
    }
    return list;
  }, [catalog.aircraft, catalog.meta, emptyOverrides]);
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

  return (
    <>
      <DisclaimerModal
        open={!disclaimerAccepted}
        onAccept={handleDisclaimerAccept}
      />
      <span className={'print:hidden'}>
        <SafetyDisclaimer/>
      </span>
      <div className="relative">
        <Card className="relative overflow-hidden bg-card text-card-foreground">
          <MemoizedAircraftBackground selectedAircraft={selectedAircraft}/>
          <div className="relative z-10">
            <CardHeader>
              <CardTitle>Aircraft Weight & Balance Calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 print:hidden">
                <FormItem>
                  <FormLabel>Aircraft</FormLabel>
                  <Select
                    value={selectedAircraft}
                    onValueChange={handleAircraftSelection}
                  >
                    <SelectTrigger className="bg-background border-input">
                      <SelectValue placeholder="Select Aircraft Type"/>
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground">
                      {groupKeys(Object.keys(aircraftList), catalog.meta).map(group => (
                        <SelectGroup key={group.title}>
                          <SelectLabel>{group.title}</SelectLabel>
                          {group.keys.map(key => (
                            <SelectItem key={key} value={key}>
                              {catalog.meta[key]?.kind === 'generic' ? `${catalog.meta[key].label} (generic)` : key}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <AircraftSourceNotice catalog={catalog} selectedMeta={catalog.meta[selectedAircraft]}/>
                  <ClubAircraftButton onSaved={catalog.reload}/>
                </FormItem>

                {catalog.meta[selectedAircraft]?.kind === 'generic' && (
                  <GenericEmptyWeight
                    weight={emptyOverrides[selectedAircraft]?.weight ?? catalog.aircraft[selectedAircraft].basicEmptyWeight}
                    arm={emptyOverrides[selectedAircraft]?.arm ?? catalog.aircraft[selectedAircraft].armAftDatum}
                    typicalWeight={catalog.aircraft[selectedAircraft].basicEmptyWeight}
                    typicalArm={catalog.aircraft[selectedAircraft].armAftDatum}
                    onChange={value => updateEmptyOverride(selectedAircraft, value)}
                  />
                )}

                <FormItem>
                  <FormLabel>Passenger Weights</FormLabel>
                  <SeatLayout weights={inputs}
                    layout={getSeatLayout(aircraftList[selectedAircraft])}
                    onChange={handleWeightChange}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel>
                                        Baggage (kg)
                  </FormLabel>
                  <NumberInput
                    value={inputs.baggageWeight || 0}
                    onChange={(e) => handleInputChange('baggageWeight', e.toString())}
                  />
                </FormItem>
                <FormItem>
                  <FormLabel>Cruise Power Setting</FormLabel>
                  <Select
                    value={inputs.powerSetting}
                    onValueChange={(value: '55%' | '65%' | '75%') =>
                      setInputs(prev => ({...prev, powerSetting: value}))}
                  >
                    <SelectTrigger className="bg-background border-input text-foreground">
                      <SelectValue placeholder="Select power setting"/>
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground">
                      {selectedAircraft && aircraftList[selectedAircraft].performance.fuelConsumption.map(setting => (
                        <SelectItem
                          key={setting.powerSetting}
                          value={setting.powerSetting}
                          className="text-foreground"
                        >
                          {setting.powerSetting} ({setting.speed} KTAS, {setting.litersPerHour} L/h)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
                {selectedAircraft && (
                  <>
                    <FormItem>
                      <FormLabel>Fuel</FormLabel>
                      <div className="space-y-2">
                        <div className="flex space-x-2">
                          <NumberInput
                            value={inputs.fuelAmount}
                            min={0}
                            max={selectedAircraft ? getMaxFuel(aircraftList[selectedAircraft]) : 0}
                            onChange={(e) => handleInputChange('fuelAmount', e.toString())}
                            className="flex-1 bg-background"
                          />
                          <Select
                            value={inputs.fuelUnit}
                            onValueChange={(value: 'liters' | 'kg') => handleFuelUnitChange(value)}
                          >
                            <SelectTrigger className="w-24 bg-background">
                              <SelectValue/>
                            </SelectTrigger>
                            <SelectContent className="bg-popover text-popover-foreground">
                              <SelectItem value="liters">Liters</SelectItem>
                              <SelectItem value="kg">Kg</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Fuel level indicator */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm text-gray-500">
                            <span>{getFuelLevelLabel(inputs.fuelAmount, aircraftList[selectedAircraft])}</span>
                            <span>{Math.round((inputs.fuelAmount / getMaxFuel(aircraftList[selectedAircraft])) * 100)}%</span>
                          </div>
                          <Progress
                            value={(inputs.fuelAmount / getMaxFuel(aircraftList[selectedAircraft])) * 100}
                            className="h-2"
                            indicatorClassName={getFuelLevelColor(inputs.fuelAmount, aircraftList[selectedAircraft])}
                          />
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            type="button"
                            variant={inputs.fuelAmount === aircraftList[selectedAircraft].stations.fuel.standardLiters ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => handleQuickFuelSelect('standard')}
                          >
                                                        Standard Tanks
                          </Button>
                          <Button
                            type="button"
                            variant={inputs.fuelAmount === aircraftList[selectedAircraft].stations.fuel.maxLiters ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => handleQuickFuelSelect('full')}
                          >
                                                        Full Tanks
                          </Button>
                        </div>
                      </div>
                      <FormMessage>
                                                Max
                                                fuel: {getMaxFuel(aircraftList[selectedAircraft]).toFixed(1)} {inputs.fuelUnit}
                      </FormMessage>
                    </FormItem>
                    <FormItem>
                      <FlightTimeInput
                        value={inputs.flightTime}
                        onChange={(minutes) => setInputs(prev => ({
                          ...prev,
                          flightTime: minutes
                        }))}
                      />
                    </FormItem>
                  </>
                )}
                <PrintButton disabled={!results}/>
              </form>

              {results && (
                <>
                  <Alert className="mt-4 bg-background border-border"
                    variant={results.takeoff.isWithinLimits && results.landing.isWithinLimits && results.landing.hasMinimumReserve
                      ? 'default'
                      : 'destructive'}>
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="font-semibold">Takeoff</div>
                        <p>Weight: {results.takeoff.totalWeight.toFixed(1)} kg</p>
                        <p>CG: {results.takeoff.cg.toFixed(3)} m</p>
                        <p className={results.takeoff.isWithinLimits ? 'text-green-600' : 'text-red-600'}>
                                                    Status: {results.takeoff.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}
                        </p>

                        <div className="font-semibold mt-4">Landing (estimated)</div>
                        <p>Weight: {results.landing.totalWeight.toFixed(1)} kg</p>
                        <p>CG: {results.landing.cg.toFixed(3)} m</p>
                        <p>Fuel
                                                    remaining: {results.landing.fuelRemaining.toFixed(1)} {inputs.fuelUnit}</p>
                        <p className={results.landing.isWithinLimits ? 'text-green-600' : 'text-red-600'}>
                                                    Status: {results.landing.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}
                        </p>
                        {!results.landing.hasMinimumReserve && (
                          <p className="text-red-600 font-bold mt-2">
                                                        WARNING: Insufficient fuel reserve!
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                  {!results.landing.hasMinimumReserve && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTitle>Warning: Insufficient Fuel Reserve</AlertTitle>
                      <AlertDescription>
                                                Landing fuel ({results.landing.fuelRemaining.toFixed(1)} L) is below the
                                                recommended
                                                45-minute reserve
                                                ({aircraftList[selectedAircraft].performance.reserveFuel.recommendedLiters} L).
                                                Increase fuel load or reduce flight time.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="mt-4">
                    <div className="mt-2 text-sm">
                      <p>Fuel Breakdown:</p>
                      <ul className="list-disc pl-5">
                        <li>Starting fuel: {inputs.fuelAmount.toFixed(1)} {inputs.fuelUnit}</li>
                        <li>Taxi
                                                    fuel: {aircraftList[selectedAircraft].performance.taxiFuel.liters.toFixed(1)} L
                        </li>
                        <li>Trip fuel: {calculateTripFuel().toFixed(1)} L</li>
                        <li>Reserve
                                                    required: {aircraftList[selectedAircraft].performance.reserveFuel.recommendedLiters} L
                        </li>
                        <li>Remaining at landing: {results.landing.fuelRemaining.toFixed(1)} L
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              )}


              {/* Envelope Visualization Section */}
              <div className="h-full min-h-[400px]">
                {selectedAircraft && (
                  <CGEnvelopeVisualization
                    envelopePoints={aircraftList[selectedAircraft].envelope.points}
                    takeoffPoint={results ? {
                      cg: results.takeoff.cg,
                      weight: results.takeoff.totalWeight
                    } : undefined}
                    landingPoint={results ? {
                      cg: results.landing.cg,
                      weight: results.landing.totalWeight
                    } : undefined}
                    limits={aircraftList[selectedAircraft].envelope.limits}
                  />
                )}
              </div>
            </CardContent>
          </div>
        </Card>
        {selectedAircraft && (
          <AircraftInfoBox
            emptyWeight={aircraftList[selectedAircraft].basicEmptyWeight}
            mtow={aircraftList[selectedAircraft].mtow}
            maxBaggage={aircraftList[selectedAircraft].maxBaggage}
            maxFuelLiters={aircraftList[selectedAircraft].stations.fuel.maxLiters}
            maxDemoCrosswind={aircraftList[selectedAircraft].performance.maxDemoCrosswind}
            stallSpeedClean={aircraftList[selectedAircraft].performance.stallSpeedClean}
            stallSpeedLanding={aircraftList[selectedAircraft].performance.stallSpeedLanding}
            bestClimbSpeed={aircraftList[selectedAircraft].performance.bestClimbSpeed}
            bestGlideSpeed={aircraftList[selectedAircraft].performance.bestGlideSpeed}
            approachSpeedNormal={aircraftList[selectedAircraft].performance.approachSpeedNormal}
            speedUnit={aircraftList[selectedAircraft].performance.speedUnit}
          />
        )}

        {results && (
          <div className="hidden print:block mt-8">
            <h2 className="text-xl font-bold mb-4">Weight & Balance Calculation Summary</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">Aircraft Information</h3>
                <p>Aircraft: {catalog.meta[selectedAircraft]?.kind === 'generic'
                  ? `${catalog.meta[selectedAircraft].label} (generic)` : selectedAircraft}</p>
                <p>Empty weight: {aircraftList[selectedAircraft].basicEmptyWeight} kg,
                  arm {aircraftList[selectedAircraft].armAftDatum} m</p>
                <p>Date: {new Date().toLocaleDateString()}</p>
              </div>

              <div>
                <h3 className="font-semibold">Input Weights</h3>
                <p>Pilot & Front Passenger: {inputs.pilotWeight + inputs.frontPassengerWeight} kg</p>
                <p>Rear
                                    Passengers: {inputs.rearLeftPassengerWeight + inputs.rearRightPassengerWeight} kg</p>
                <p>Baggage: {inputs.baggageWeight} kg</p>
                <p>Fuel: {inputs.fuelAmount} {inputs.fuelUnit}</p>
                <p>Flight
                                    Time: {Math.floor(inputs.flightTime / 60)}:{(inputs.flightTime % 60).toString().padStart(2, '0')} hours</p>
              </div>

              <div>
                <h3 className="font-semibold">Takeoff Condition</h3>
                <p>Weight: {results.takeoff.totalWeight.toFixed(1)} kg</p>
                <p>CG: {results.takeoff.cg.toFixed(3)} m</p>
                <p>Status: {results.takeoff.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}</p>
              </div>

              <div>
                <h3 className="font-semibold">Landing Condition (estimated)</h3>
                <p>Weight: {results.landing.totalWeight.toFixed(1)} kg</p>
                <p>CG: {results.landing.cg.toFixed(3)} m</p>
                <p>Fuel Remaining: {results.landing.fuelRemaining.toFixed(1)} {inputs.fuelUnit}</p>
                <p>Status: {results.landing.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}</p>
              </div>
            </div>

            <div className="mt-8 text-sm">
              <p>Note: This is a calculation tool only. Always verify weight and balance using the
                                aircraft's
                                POH.</p>
              <p>Generated by Weight & Balance Calculator - Songer Consulting AB</p>
            </div>
          </div>
        )}
        <CompanyFooter/>
      </div>
    </>
  );
};
export default WeightBalanceCalculator;