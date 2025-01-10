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

interface CalculatorInputs {
    pilotFrontWeight: number;
    passengerRearWeight: number;
    baggageWeight: number;
    fuelAmount: number;
    fuelUnit: 'liters' | 'kg';
}

const WeightBalanceCalculator: React.FC = () => {
    const [selectedAircraft, setSelectedAircraft] = React.useState<string>('C172S (SE-MIA)');
    const [inputs, setInputs] = React.useState<CalculatorInputs>({
        pilotFrontWeight: 0,
        passengerRearWeight: 0,
        baggageWeight: 0,
        fuelAmount: 0,
        fuelUnit: 'liters'
    });
    const [results, setResults] = React.useState<{
        totalWeight: number;
        cg: number;
        isWithinLimits: boolean;
        moments: Record<string, number>;
    } | null>(null);

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
                newFuelAmount = inputs.fuelAmount * 0.72; // Convert liters to kg (approximate aviation fuel density)
            } else if (unit === 'liters' && inputs.fuelUnit === 'kg') {
                newFuelAmount = inputs.fuelAmount / 0.72; // Convert kg to liters
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

    const calculateWeightAndBalance = React.useCallback(() => {
        if (!selectedAircraft) return;

        const aircraft = aircraftData[selectedAircraft];

        // Calculate fuel weight based on input unit
        const fuelWeight = inputs.fuelUnit === 'kg'
            ? inputs.fuelAmount
            : inputs.fuelAmount * 0.72; // Convert liters to kg if needed

        // Calculate individual moments
        const moments = {
            empty: calculateMoment(aircraft.basicEmptyWeight, aircraft.armAftDatum),
            pilotFront: calculateMoment(inputs.pilotFrontWeight, aircraft.stations.pilotFront.arm),
            passengerRear: calculateMoment(inputs.passengerRearWeight, aircraft.stations.passengerRear.arm),
            baggage: calculateMoment(inputs.baggageWeight, aircraft.stations.baggage.arm),
            fuel: calculateMoment(fuelWeight, aircraft.stations.fuel.arm)
        };

        const totalWeight = aircraft.basicEmptyWeight +
            inputs.pilotFrontWeight +
            inputs.passengerRearWeight +
            inputs.baggageWeight +
            fuelWeight;

        const totalMoment = Object.values(moments).reduce((sum, moment) => sum + moment, 0);
        const cg = calculateCG(totalWeight, totalMoment);
        const isWithinLimits = isWithinEnvelope(aircraft, totalWeight, cg);

        setResults({
            totalWeight,
            cg,
            isWithinLimits,
            moments
        });
    }, [selectedAircraft, inputs]);

    const getMaxFuel = (aircraft: typeof aircraftData[keyof typeof aircraftData]) => {
        if (inputs.fuelUnit === 'liters') {
            return aircraft.stations.fuel.maxLiters;
        }
        return aircraft.stations.fuel.maxLiters * 0.72; // Convert max liters to kg
    };

    return (
        <>
        <Card>
            <CardHeader>
                <CardTitle>Aircraft Weight & Balance Calculator</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormItem>
                        <FormLabel>Aircraft Type</FormLabel>
                    <Select
                        onValueChange={setSelectedAircraft}
                    >
                        <SelectTrigger>
                            <SelectValue  />
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
                        <FormLabel>Pilot & Front Passenger Weight</FormLabel>
                            <NumberInput
                                value={inputs.pilotFrontWeight || 0}
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
                    <FormItem>
                        <FormLabel>Fuel</FormLabel>
                        <div className="flex space-x-2">
                            <NumberInput
                                value={inputs.fuelAmount || 0}
                                min={0}
                                max={selectedAircraft ? getMaxFuel(aircraftData[selectedAircraft]) : 0}
                                unit={inputs.fuelUnit}
                                onChange={(e) => handleInputChange('fuelAmount', e.toString())}
                                className="flex-1"
                            />
                            <Select
                                value={inputs.fuelUnit}
                                onValueChange={(value: 'liters' | 'kg') => handleFuelUnitChange(value)}
                            >
                                <SelectTrigger className="w-24">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="liters">Liters</SelectItem>
                                    <SelectItem value="kg">Kg</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedAircraft && (
                            <FormMessage>
                                Max fuel: {getMaxFuel(aircraftData[selectedAircraft]).toFixed(1)} {inputs.fuelUnit}
                            </FormMessage>
                        )}
                    </FormItem>
                    <Button
                        type="submit"
                        disabled={!selectedAircraft}
                        className="w-full"
                    >
                        Calculate
                    </Button>
                </form>

                {results && (
                    <Alert className="mt-4">
                        <AlertDescription>
                            <div className="space-y-2">
                                <p>Total Weight: {results.totalWeight.toFixed(1)} kg</p>
                                <p>Center of Gravity: {results.cg.toFixed(3)} m</p>
                                <p>Status: {results.isWithinLimits ? 'Within Limits' : 'Exceeds Limits!'}</p>
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

                    {/* Envelope Visualization Section */}
                    <div className="h-full min-h-[500px]">
                        {selectedAircraft && (
                            <CGEnvelopeVisualization
                                envelopePoints={aircraftData[selectedAircraft].envelope.points}
                                currentPoint={results ? {
                                    cg: results.cg,
                                    weight: results.totalWeight
                                } : undefined}
                                limits={aircraftData[selectedAircraft].envelope.limits}
                            />
                        )}
                    </div>
            </CardContent>

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
    )}</>
    );
};

export default WeightBalanceCalculator;