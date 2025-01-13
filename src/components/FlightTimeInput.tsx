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
  // Function to format time as HH:mm
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  // Handle increment and decrement with bounds checking
  const handleIncrement = () => {
    const newValue = Math.min(value + 10, 12 * 60); // Max 12 hours
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(value - 10, 10); // Min 10 minutes
    onChange(newValue);
  };

  return (
    <FormItem>
      <FormLabel>Flight Time (HH:mm)</FormLabel>
      <div className="flex items-center space-x-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-background"
          onClick={handleDecrement}
          //onTouchStart={handleDecrement}
        >
          <Minus className="h-4 w-4"/>
        </Button>
        <Input
          type="text"
          value={formatTime(value)}
          readOnly
          className="text-center bg-background"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-background"
          onClick={handleIncrement}
          //onTouchStart={handleIncrement}
        >
          <Plus className="h-4 w-4"/>
        </Button>
      </div>
    </FormItem>
  );
};

export default FlightTimeInput;