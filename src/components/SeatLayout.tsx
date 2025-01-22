import React from 'react';
import {User} from 'lucide-react';
import {CalculatorInputs} from './WeightBalanceCalculator';

interface SeatLayoutProps {
    weights: CalculatorInputs;
    onChange: (seat: keyof Omit<CalculatorInputs, 'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'>, value: string) => void;
}

const SeatLayout: React.FC<SeatLayoutProps> = ({weights, onChange}) => {
  const handleSeatClick = (seat: keyof Omit<CalculatorInputs, 'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'>) => {
    const value = prompt(`Enter weight for ${seat} (kg):`, weights[seat].toString());
    if (value !== null) {
      onChange(seat, value);
    }
  };

  return (
    <div className="relative w-full bg-gray-100 rounded-lg p-6">
      <div className="flex justify-center space-x-4 mb-8">
        {/* Front seats */}
        <div className="space-y-2">
          <div
            className="cursor-pointer flex flex-col items-center"
            onClick={() => handleSeatClick('pilotWeight')}
          >
            <User
              size={32}
              className={weights.pilotWeight > 0 ? 'text-blue-600' : 'text-gray-400'}
            />
            <span className="text-sm">Pilot</span>
            {weights.pilotWeight > 0 && (
              <span className="text-xs font-medium">{weights.pilotWeight} kg</span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div
            className="cursor-pointer flex flex-col items-center"
            onClick={() => handleSeatClick('frontPassengerWeight')}
          >
            <User
              size={32}
              className={weights.frontPassengerWeight > 0 ? 'text-blue-600' : 'text-gray-400'}
            />
            <span className="text-sm">Front Pass.</span>
            {weights.frontPassengerWeight > 0 && (
              <span className="text-xs font-medium">{weights.frontPassengerWeight} kg</span>
            )}
          </div>
        </div>
      </div>

      {/* Rear seats */}
      <div className="flex justify-center space-x-4">
        <div className="space-y-2">
          <div
            className="cursor-pointer flex flex-col items-center"
            onClick={() => handleSeatClick('rearLeftPassengerWeight')}
          >
            <User
              size={32}
              className={weights.rearLeftPassengerWeight > 0 ? 'text-blue-600' : 'text-gray-400'}
            />
            <span className="text-sm">Rear Left</span>
            {weights.rearLeftPassengerWeight > 0 && (
              <span className="text-xs font-medium">{weights.rearLeftPassengerWeight} kg</span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div
            className="cursor-pointer flex flex-col items-center"
            onClick={() => handleSeatClick('rearRightPassengerWeight')}
          >
            <User
              size={32}
              className={weights.rearRightPassengerWeight > 0 ? 'text-blue-600' : 'text-gray-400'}
            />
            <span className="text-sm">Rear Right</span>
            {weights.rearRightPassengerWeight > 0 && (
              <span className="text-xs font-medium">{weights.rearRightPassengerWeight} kg</span>
            )}
          </div>
        </div>
      </div>

      {/* Aircraft outline */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-full h-full border-2 border-gray-300 rounded-lg"/>
        <div className="absolute top-1/2 left-0 w-full border-t-2 border-gray-300"/>
      </div>
    </div>
  );
};

export default SeatLayout;