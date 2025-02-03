import React from 'react';
import {User} from 'lucide-react';

interface CalculatorInputs {
    pilotWeight: number;
    frontPassengerWeight: number;
    rearLeftPassengerWeight: number;
    rearRightPassengerWeight: number;
    backPassengerWeight?: number; // New field for tandem aircraft
    fuelUnit: string;
    flightTime: number;
    powerSetting: string;
    fuelAmount: number;
}

interface SeatLayoutProps {
    weights: CalculatorInputs;
    aircraftType: string;
    onChange: (
        seat: keyof Omit<
            CalculatorInputs,
            'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'
        >,
        value: string
    ) => void;
}

interface LayoutProps {
    weights: CalculatorInputs;
    onSeatClick: (seat: keyof Omit<
        CalculatorInputs,
        'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'
    >) => void;
}

// Separate component for Tandem Layout
const TandemLayout = React.memo(({weights, onSeatClick}: LayoutProps) => (
  <div className="flex flex-col items-center space-y-16">
    <div
      className="cursor-pointer flex flex-col items-center"
      onClick={() => onSeatClick('pilotWeight')}
    >
      <User
        size={32}
        className={weights.pilotWeight > 0 ? 'text-primary' : 'text-muted-foreground'}
      />
      <span className="text-sm text-foreground">Pilot</span>
      {weights.pilotWeight > 0 && (
        <span className="text-xs font-medium text-foreground">
          {weights.pilotWeight} kg
        </span>
      )}
    </div>

    <div
      className="cursor-pointer flex flex-col items-center"
      onClick={() => onSeatClick('backPassengerWeight')}
    >
      <User
        size={32}
        className={(weights.backPassengerWeight || 0) > 0 ? 'text-primary' : 'text-muted-foreground'}
      />
      <span className="text-sm text-foreground">Back Seat</span>
      {(weights.backPassengerWeight || 0) > 0 && (
        <span className="text-xs font-medium text-foreground">
          {weights.backPassengerWeight} kg
        </span>
      )}
    </div>
  </div>
));

// Separate component for Standard Layout
const StandardLayout = React.memo(({weights, onSeatClick}: LayoutProps) => (
  <div className="flex flex-col items-center">
    <div className="flex justify-center items-center space-x-8 mb-8">
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('pilotWeight')}
      >
        <User
          size={32}
          className={weights.pilotWeight > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Pilot</span>
        {weights.pilotWeight > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.pilotWeight} kg
          </span>
        )}
      </div>
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('frontPassengerWeight')}
      >
        <User
          size={32}
          className={weights.frontPassengerWeight > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Front Pass.</span>
        {weights.frontPassengerWeight > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.frontPassengerWeight} kg
          </span>
        )}
      </div>
    </div>

    <div className="flex justify-center space-x-16">
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('rearLeftPassengerWeight')}
      >
        <User
          size={32}
          className={weights.rearLeftPassengerWeight > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Rear Left</span>
        {weights.rearLeftPassengerWeight > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.rearLeftPassengerWeight} kg
          </span>
        )}
      </div>
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('rearRightPassengerWeight')}
      >
        <User
          size={32}
          className={weights.rearRightPassengerWeight > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Rear Right</span>
        {weights.rearRightPassengerWeight > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.rearRightPassengerWeight} kg
          </span>
        )}
      </div>
    </div>
  </div>
));

const SeatLayout: React.FC<SeatLayoutProps> = ({weights, aircraftType, onChange}) => {
  const isTandemLayout = aircraftType.includes('PA18-150');

  const handleSeatClick = React.useCallback(
    (seat: keyof Omit<
            CalculatorInputs,
            'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'
        >) => {
      console.log('Handling click for:', seat);
      const value = prompt(
        `Enter weight for ${seat} (kg):`,
        weights[seat]?.toString() || '0'
      );
      if (value !== null) {
        console.log('Calling onChange with:', seat, value);
        onChange(seat, value);
      }
    },
    [onChange, weights]
  );

  return (
    <div className="relative w-full bg-background rounded-lg p-6 border border-border">
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-full h-full border-2 border-border rounded-lg"/>
        {!isTandemLayout && (
          <div className="absolute top-1/2 left-0 w-full border-t-2 border-border"/>
        )}
      </div>

      {isTandemLayout ? (
        <TandemLayout weights={weights} onSeatClick={handleSeatClick}/>
      ) : (
        <StandardLayout weights={weights} onSeatClick={handleSeatClick}/>
      )}
    </div>
  );
};

// Add display names for debugging
TandemLayout.displayName = 'TandemLayout';
StandardLayout.displayName = 'StandardLayout';
SeatLayout.displayName = 'SeatLayout';

export default React.memo(SeatLayout);