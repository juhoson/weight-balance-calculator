import * as React from 'react';
import CGEnvelopeVisualization from "./CDEnvelopeVisualization";
import { Button } from './ui/Button';
import { NumberInput } from './ui/NumberInput';
import { Alert, AlertDescription } from './ui/Alert';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/Select';

import {aircraftData, calculateCG, calculateMoment, isWithinEnvelope} from '../data/aircraftData';
import {FormItem, FormLabel, FormMessage} from "./ui/Form";
import AircraftInfoBox from "./AircraftInfoBox";
import SafetyDisclaimer from "./SafetyDisclaimer";
import DisclaimerModal from "./DisclaimerModal";
import {Progress} from "./ui/Progress";
import FlightTimeInput from "./FlightTimeInput";
import AircraftBackground from "./AircraftBackground";

interface CalculatorInputs {
    pilotFrontWeight: number;
    passengerRearWeight: number;
    baggageWeight: number;
    fuelAmount: number;
    fuelUnit: 'liters' | 'kg';
}

interface CalculatorInputs {
    pilotFrontWeight: number;
    passengerRearWeight: number;
    baggageWeight: number;
    fuelAmount: number;
    fuelUnit: 'liters' | 'kg';
    flightTime: number; // in minutes
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
    };
}

const DEFAULT_AIRCRAFT = 'C172S (SE-MIA)';
const DEFAULT_PILOT_WEIGHT = 85;

const WeightBalanceCalculator: React.FC = () => {
    const [disclaimerAccepted, setDisclaimerAccepted] = React.useState(() => {
        return localStorage.getItem('disclaimerAccepted') === 'true';
    });
    const [selectedAircraft, setSelectedAircraft] = React.useState<string>(DEFAULT_AIRCRAFT);
    const [inputs, setInputs] = React.useState<CalculatorInputs>(() => {
        const standardFuel = aircraftData[DEFAULT_AIRCRAFT].stations.fuel.standardLiters;
        return {
            pilotFrontWeight: DEFAULT_PILOT_WEIGHT,
            passengerRearWeight: 0,
            baggageWeight: 0,
            fuelAmount: standardFuel,
            fuelUnit: 'liters',
            flightTime: 60 // Default 1 hour
        };
    });

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

    // Calculate fuel consumption for the flight
    const calculateFuelConsumption = (aircraft: typeof aircraftData[keyof typeof aircraftData], minutes: number) => {
        // Calculate consumption based on aircraft's fuel consumption rate
        const hourlyConsumption = aircraft.performance.fuelConsumption; // Liters per hour at cruise
        return (hourlyConsumption * minutes) / 60;
    };

    const calculateWeightAndBalance = React.useCallback(() => {
        if (!selectedAircraft) return;

        const aircraft = aircraftData[selectedAircraft];

        // Calculate fuel weights
        const takeoffFuelWeight = inputs.fuelUnit === 'kg'
            ? inputs.fuelAmount
            : inputs.fuelAmount * aircraft.stations.fuel.weightPerLiter;

        const fuelConsumed = calculateFuelConsumption(aircraft, inputs.flightTime);
        const landingFuelWeight = Math.max(0, inputs.fuelUnit === 'kg'
            ? inputs.fuelAmount - (fuelConsumed * aircraft.stations.fuel.weightPerLiter)
            : (inputs.fuelAmount - fuelConsumed) * aircraft.stations.fuel.weightPerLiter);

        // Calculate moments and CG for takeoff
        const takeoffMoments = {
            empty: calculateMoment(aircraft.basicEmptyWeight, aircraft.armAftDatum),
            pilotFront: calculateMoment(inputs.pilotFrontWeight, aircraft.stations.pilotFront.arm),
            passengerRear: calculateMoment(inputs.passengerRearWeight, aircraft.stations.passengerRear.arm),
            baggage: calculateMoment(inputs.baggageWeight, aircraft.stations.baggage.arm),
            fuel: calculateMoment(takeoffFuelWeight, aircraft.stations.fuel.arm)
        };

        // Calculate moments and CG for landing
        const landingMoments = {
            ...takeoffMoments,
            fuel: calculateMoment(landingFuelWeight, aircraft.stations.fuel.arm)
        };

        const takeoffWeight = aircraft.basicEmptyWeight +
            inputs.pilotFrontWeight +
            inputs.passengerRearWeight +
            inputs.baggageWeight +
            takeoffFuelWeight;

        const landingWeight = takeoffWeight - (takeoffFuelWeight - landingFuelWeight);

        const takeoffTotalMoment = Object.values(takeoffMoments).reduce((sum, moment) => sum + moment, 0);
        const landingTotalMoment = Object.values(landingMoments).reduce((sum, moment) => sum + moment, 0);

        const takeoffCG = calculateCG(takeoffWeight, takeoffTotalMoment);
        const landingCG = calculateCG(landingWeight, landingTotalMoment);

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
                moments: landingMoments,
                fuelRemaining: inputs.fuelUnit === 'kg' ? landingFuelWeight : landingFuelWeight / aircraft.stations.fuel.weightPerLiter
            }
        });
    }, [selectedAircraft, inputs]);

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
        <SafetyDisclaimer />
            <Card className="relative overflow-hidden">
                <AircraftBackground selectedAircraft={selectedAircraft}/>
                <div className="relative z-10">
                    <CardHeader>
                        <CardTitle>Aircraft Weight & Balance Calculator</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <FormItem>
                                <FormLabel>Aircraft Type</FormLabel>
                                <Select
                                    defaultValue={DEFAULT_AIRCRAFT}
                                    onValueChange={handleAircraftSelection}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Aircraft Type"/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(aircraftData).map(([key]) => (
                                            <SelectItem key={key} value={key}>
                                                {key}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>

                            <FormItem>
                                <FormLabel>
                                    Pilot & Front Passenger Weight
                                    <span
                                        className="text-sm text-gray-500 ml-2">(Standard: {DEFAULT_PILOT_WEIGHT} kg)</span>
                                </FormLabel>
                                <NumberInput
                                    value={inputs.pilotFrontWeight}
                                    min={0}
                                    max={200}
                                    unit="kg"
                                    placeholder="Enter weight"
                                    onChange={(e) => handleInputChange('pilotFrontWeight', e.toString())}
                                />
                                <FormMessage>Weight must be between 0 and 200 kg</FormMessage>
                            </FormItem>
                            <FormItem>
                                <FormLabel>
                                    Rear Passengers (kg)
                                </FormLabel>
                                <NumberInput
                                    value={inputs.passengerRearWeight || 0}
                                    onChange={(e) => handleInputChange('passengerRearWeight', e.toString())}
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
                                                    //unit={inputs.fuelUnit}
                                                    onChange={(e) => handleInputChange('fuelAmount', e.toString())}
                                                    className="flex-1"
                                                />
                                                <Select
                                                    value={inputs.fuelUnit}
                                                    onValueChange={(value: 'liters' | 'kg') => handleFuelUnitChange(value)}
                                                >
                                                    <SelectTrigger className="w-24">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
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
                                                    variant={inputs.fuelAmount === aircraftData[selectedAircraft].stations.fuel.standardLiters ? "default" : "outline"}
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() => handleQuickFuelSelect('standard')}
                                                >
                                                    Standard Tanks
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={inputs.fuelAmount === aircraftData[selectedAircraft].stations.fuel.maxLiters ? "default" : "outline"}
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
                                            onChange={(minutes) => setInputs(prev => ({...prev, flightTime: minutes}))}
                                        />
                                    </FormItem>
                                </>
                            )}
                            <Button
                                type="submit"
                                disabled={!selectedAircraft}
                                className="w-full"
                            >
                                Calculate
                            </Button>
                        </form>

                        {results && (
                            <Alert className="mt-4"
                                   variant={results.takeoff.isWithinLimits ? "default" : "destructive"}>
                                <AlertDescription>
                                    <div className="space-y-2">
                                        <div className="font-semibold">Takeoff</div>
                                        <p>Weight: {results.takeoff.totalWeight.toFixed(1)} kg</p>
                                        <p>CG: {results.takeoff.cg.toFixed(3)} m</p>
                                        <p className={results.takeoff.isWithinLimits ? "text-green-600" : "text-red-600"}>
                                            Status: {results.takeoff.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}
                                        </p>

                                        <div className="font-semibold mt-4">Landing (estimated)</div>
                                        <p>Weight: {results.landing.totalWeight.toFixed(1)} kg</p>
                                        <p>CG: {results.landing.cg.toFixed(3)} m</p>
                                        <p>Fuel
                                            remaining: {results.landing.fuelRemaining.toFixed(1)} {inputs.fuelUnit}</p>
                                        <p className={results.landing.isWithinLimits ? "text-green-600" : "text-red-600"}>
                                            Status: {results.landing.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}
                                        </p>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Envelope Visualization Section */}
                        <div className="h-full min-h-[500px]">
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
            />
        )}
    </>
    );
};

export default WeightBalanceCalculator;