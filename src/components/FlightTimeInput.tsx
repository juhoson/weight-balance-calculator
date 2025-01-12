import React from 'react';
import { Button } from './ui/Button';
import { FormItem, FormLabel } from './ui/Form';
import { Input } from './ui/Input';
import { Minus, Plus } from 'lucide-react';

interface FlightTimeInputProps {
    value: number;
    onChange: (minutes: number) => void;
}

const FlightTimeInput: React.FC<FlightTimeInputProps> = ({ value, onChange }) => {
    const increment = () => {
        onChange(Math.min(value + 5, 360)); // Max 6 hours
    };

    const decrement = () => {
        onChange(Math.max(value - 5, 30)); // Min 30 minutes
    };

    const formatTime = (minutes: number) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}:${mins.toString().padStart(2, '0')}`;
    };

    return (
        <FormItem>
            <FormLabel>Flight Time</FormLabel>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="icon"
                    className="bg-background"
                >
                    <Minus className="h-4 w-4"/>
                </Button>
                <Input
                    type="text"
                    value={value}
                    readOnly
                    className="text-center bg-background"
                />
                <Button
                    variant="outline"
                    size="icon"
                    className="bg-background"
                >
                    <Plus className="h-4 w-4"/>
                </Button>
            </div>
        </FormItem>
    );
};

export default FlightTimeInput;