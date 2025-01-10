// src/components/FuelSelector.tsx
import React from 'react';
import { NumberInput } from './ui/NumberInput';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/Select';
import { Button } from './ui/Button';
import { Progress } from './ui/Progress';
import { FormItem, FormLabel, FormMessage } from './ui/Form';

interface FuelSelectorProps {
    value: number;
    unit: 'liters' | 'kg';
    maxFuel: number;
    standardFuel: number;
    onValueChange: (value: number) => void;
    onUnitChange: (unit: 'liters' | 'kg') => void;
    onQuickSelect: (type: 'standard' | 'full') => void;
}

const FuelSelector: React.FC<FuelSelectorProps> = ({
                                                       value,
                                                       unit,
                                                       maxFuel,
                                                       standardFuel,
                                                       onValueChange,
                                                       onUnitChange,
                                                       onQuickSelect,
                                                   }) => {
    // Calculate fuel level percentage
    const fuelPercentage = (value / maxFuel) * 100;

    // Determine progress bar color based on fuel level
    const getProgressColor = () => {
        if (fuelPercentage <= 25) return 'bg-red-500';
        if (fuelPercentage <= 50) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    // Get fuel level label
    const getFuelLevelLabel = () => {
        if (value === 0) return 'Empty';
        if (value === maxFuel) return 'Full';
        if (value === standardFuel) return 'Standard';
        if (value < standardFuel) return 'Below Standard';
        if (value > standardFuel) return 'Above Standard';
        return 'Custom';
    };

    return (
        <FormItem>
            <FormLabel>Fuel</FormLabel>
            <div className="space-y-2">
                <div className="flex space-x-2">
                    <NumberInput
                        value={value}
                        min={0}
                        max={maxFuel}
                        unit={unit}
                        onChange={onValueChange}
                        className="flex-1"
                    />
                    <Select
                        value={unit}
                        onValueChange={onUnitChange}
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

                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>{getFuelLevelLabel()}</span>
                        <span>{Math.round(fuelPercentage)}%</span>
                    </div>
                    <Progress
                        value={fuelPercentage}
                        className="h-2"
                        indicatorClassName={getProgressColor()}
                    />
                </div>

                <div className="flex space-x-2">
                    <Button
                        type="button"
                        variant={value === standardFuel ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => onQuickSelect('standard')}
                    >
                        Standard Tanks
                    </Button>
                    <Button
                        type="button"
                        variant={value === maxFuel ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => onQuickSelect('full')}
                    >
                        Full Tanks
                    </Button>
                </div>
            </div>
            <FormMessage>
                Max fuel: {maxFuel.toFixed(1)} {unit}
            </FormMessage>
        </FormItem>
    );
};

export default FuelSelector;