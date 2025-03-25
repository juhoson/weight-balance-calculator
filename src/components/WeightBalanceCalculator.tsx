import * as React from 'react';
import CGEnvelopeVisualization from './CGEnvelopeVisualization';
import {Button} from './ui/Button';
import {NumberInput} from './ui/NumberInput';
import {Alert, AlertDescription, AlertTitle} from './ui/Alert';
import {Card, CardContent, CardHeader, CardTitle} from './ui/Card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/Select';

import {aircraftData, calculateCG, calculateMoment, isWithinEnvelope} from '../data/aircraftData';
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

export interface CalculatorInputs {
    pilotWeight: number;
    frontPassengerWeight: number;
    rearLeftPassengerWeight: number;
    rearRightPassengerWeight: number;
    backPassengerWeight?: number;
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

const DEFAULT_AIRCRAFT = 'PA28-161 (SE-KMI)';
const DEFAULT_PILOT_WEIGHT = 85;

const MemoizedAircraftBackground = React.memo(AircraftBackground, (prevProps, nextProps) => {
  return prevProps.selectedAircraft === nextProps.selectedAircraft;
});

const WeightBalanceCalculator: React.FC = () => {
  const [disclaimerAccepted, setDisclaimerAccepted] = React.useState(() => {
    return localStorage.getItem('disclaimerAccepted') === 'true';
  });
  const [selectedAircraft, setSelectedAircraft] = React.useState<string>(DEFAULT_AIRCRAFT);
  const [inputs, setInputs] = React.useState<CalculatorInputs>(() => {
    const standardFuel = aircraftData[DEFAULT_AIRCRAFT].stations.fuel.standardLiters;
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

    if (selectedAircraft?.includes('PA18-150')) {
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
    } else {
      // For standard aircraft
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
  const handleAircraftSelection = (aircraft: string) => {
    setSelectedAircraft(aircraft);
    const standardFuel = aircraftData[aircraft].stations.fuel.standardLiters;
    setInputs(prev => ({
      ...prev,
      fuelAmount: standardFuel,
      fuelUnit: 'liters'
    }));
  };

  const handleDisclaimerAccept = () => {
    localStorage.setItem('disclaimerAccepted', 'true');
    setDisclaimerAccepted(true);
  };

  const handleQuickFuelSelect = (type: 'standard' | 'full') => {
    if (!selectedAircraft) return;

    const aircraft = aircraftData[selectedAircraft];
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
  const calculateTripFuel = () => {
    if (!selectedAircraft) return 0;

    const aircraft = aircraftData[selectedAircraft];
    const consumptionData = aircraft.performance.fuelConsumption.find(
      setting => setting.powerSetting === inputs.powerSetting
    );

    if (!consumptionData) return 0;

    // Calculate fuel used during flight (not including taxi)
    return (consumptionData.litersPerHour * inputs.flightTime) / 60;
  };

  const handleFuelUnitChange = (unit: 'liters' | 'kg') => {
    const aircraft = aircraftData[selectedAircraft];
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
    aircraft: typeof aircraftData[keyof typeof aircraftData]
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
    aircraft: typeof aircraftData[keyof typeof aircraftData]
  ) => {
    const percentage = (fuelAmount / aircraft.stations.fuel.maxLiters) * 100;
    if (percentage <= 25) return 'bg-red-500';
    if (percentage <= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const calculateWeightAndBalance = React.useCallback(() => {
    if (!selectedAircraft) return;

    const aircraft = aircraftData[selectedAircraft];
    const isTandem = selectedAircraft.includes('PA18-150');

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
          // Standard configuration
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
          )
        }),
      baggage: calculateMoment(inputs.baggageWeight, aircraft.stations.baggage.arm),
      fuel: calculateMoment(startingFuelWeight, aircraft.stations.fuel.arm)
    };

    // Calculate total weight based on configuration
    const totalPassengerWeight = isTandem
      ? (inputs.backPassengerWeight || 0)
      : (inputs.frontPassengerWeight + inputs.rearLeftPassengerWeight + inputs.rearRightPassengerWeight);

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
  }, [selectedAircraft, calculateTripFuel, inputs]);

  const getMaxFuel = (aircraft: typeof aircraftData[keyof typeof aircraftData]) => {
    if (inputs.fuelUnit === 'liters') {
      return aircraft.stations.fuel.maxLiters;
    }
    return aircraft.stations.fuel.maxLiters * aircraft.stations.fuel.weightPerLiter; // Convert max liters to kg
  };

  React.useEffect(() => {
    if (selectedAircraft) {
      calculateWeightAndBalance();
    }
  }, [selectedAircraft, calculateWeightAndBalance]);

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
                  <FormLabel>Aircraft Type</FormLabel>
                  <Select
                    defaultValue={DEFAULT_AIRCRAFT}
                    onValueChange={handleAircraftSelection}
                  >
                    <SelectTrigger className="bg-background border-input">
                      <SelectValue placeholder="Select Aircraft Type"/>
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground">
                      {Object.entries(aircraftData).map(([key]) => (
                        <SelectItem key={key} value={key}>
                          {key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>

                <FormItem>
                  <FormLabel>Passenger Weights</FormLabel>
                  <SeatLayout
                    weights={inputs}
                    aircraftType={selectedAircraft}
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
                      {selectedAircraft && aircraftData[selectedAircraft].performance.fuelConsumption.map(setting => (
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
                            max={selectedAircraft ? getMaxFuel(aircraftData[selectedAircraft]) : 0}
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
                            <span>{getFuelLevelLabel(inputs.fuelAmount, aircraftData[selectedAircraft])}</span>
                            <span>{Math.round((inputs.fuelAmount / getMaxFuel(aircraftData[selectedAircraft])) * 100)}%</span>
                          </div>
                          <Progress
                            value={(inputs.fuelAmount / getMaxFuel(aircraftData[selectedAircraft])) * 100}
                            className="h-2"
                            indicatorClassName={getFuelLevelColor(inputs.fuelAmount, aircraftData[selectedAircraft])}
                          />
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            type="button"
                            variant={inputs.fuelAmount === aircraftData[selectedAircraft].stations.fuel.standardLiters ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => handleQuickFuelSelect('standard')}
                          >
                                                        Standard Tanks
                          </Button>
                          <Button
                            type="button"
                            variant={inputs.fuelAmount === aircraftData[selectedAircraft].stations.fuel.maxLiters ? 'default' : 'outline'}
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
                                                fuel: {getMaxFuel(aircraftData[selectedAircraft]).toFixed(1)} {inputs.fuelUnit}
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
                                                ({aircraftData[selectedAircraft].performance.reserveFuel.recommendedLiters} L).
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
                                                    fuel: {aircraftData[selectedAircraft].performance.taxiFuel.liters.toFixed(1)} L
                        </li>
                        <li>Trip fuel: {calculateTripFuel().toFixed(1)} L</li>
                        <li>Reserve
                                                    required: {aircraftData[selectedAircraft].performance.reserveFuel.recommendedLiters} L
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
                    envelopePoints={aircraftData[selectedAircraft].envelope.points}
                    takeoffPoint={results ? {
                      cg: results.takeoff.cg,
                      weight: results.takeoff.totalWeight
                    } : undefined}
                    landingPoint={results ? {
                      cg: results.landing.cg,
                      weight: results.landing.totalWeight
                    } : undefined}
                    limits={aircraftData[selectedAircraft].envelope.limits}
                  />
                )}
              </div>
            </CardContent>
          </div>
        </Card>
        {selectedAircraft && (
          <AircraftInfoBox
            emptyWeight={aircraftData[selectedAircraft].basicEmptyWeight}
            mtow={aircraftData[selectedAircraft].mtow}
            maxBaggage={aircraftData[selectedAircraft].maxBaggage}
            maxFuelLiters={aircraftData[selectedAircraft].stations.fuel.maxLiters}
            maxDemoCrosswind={aircraftData[selectedAircraft].performance.maxDemoCrosswind}
            stallSpeedClean={aircraftData[selectedAircraft].performance.stallSpeedClean}
            stallSpeedLanding={aircraftData[selectedAircraft].performance.stallSpeedLanding}
            bestClimbSpeed={aircraftData[selectedAircraft].performance.bestClimbSpeed}
            approachSpeedNormal={aircraftData[selectedAircraft].performance.approachSpeedNormal}
            speedUnit={aircraftData[selectedAircraft].performance.speedUnit}
            aircraftType={selectedAircraft}
          />
        )}

        {results && (
          <div className="hidden print:block mt-8">
            <h2 className="text-xl font-bold mb-4">Weight & Balance Calculation Summary</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">Aircraft Information</h3>
                <p>Type: {selectedAircraft}</p>
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