import * as React from 'react';
import {User} from 'lucide-react';
import {CalculatorInputs} from './WeightBalanceCalculator';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from './ui/Dialog';
import {NumberInput} from './ui/NumberInput';

interface SeatLayoutProps {
    weights: CalculatorInputs;
    aircraftType: string;
    onChange: (seat: keyof Omit<CalculatorInputs, 'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'>, value: string) => void;
}

interface LayoutProps {
    weights: CalculatorInputs;
    onSeatClick: (seat: keyof Omit<CalculatorInputs, 'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'>) => void;
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

// Six-Seat Layout for PA-32R-300 Lance
const SixSeatLayout = React.memo(({weights, onSeatClick}: LayoutProps) => (
  <div className="flex flex-col items-center">
    {/* Front Row (Pilot and Co-Pilot) */}
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
        <span className="text-sm text-foreground">Co-Pilot</span>
        {weights.frontPassengerWeight > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.frontPassengerWeight} kg
          </span>
        )}
      </div>
    </div>

    {/* Middle Row (Two passengers) */}
    <div className="flex justify-center space-x-16 mb-8">
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('rearLeftPassengerWeight')}
      >
        <User
          size={32}
          className={weights.rearLeftPassengerWeight > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Middle Left</span>
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
        <span className="text-sm text-foreground">Middle Right</span>
        {weights.rearRightPassengerWeight > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.rearRightPassengerWeight} kg
          </span>
        )}
      </div>
    </div>

    {/* Back Row (Two passengers) */}
    <div className="flex justify-center space-x-16">
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('backLeftPassengerWeight')}
      >
        <User
          size={32}
          className={(weights.backLeftPassengerWeight || 0) > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Back Left</span>
        {(weights.backLeftPassengerWeight || 0) > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.backLeftPassengerWeight} kg
          </span>
        )}
      </div>
      <div
        className="cursor-pointer flex flex-col items-center"
        onClick={() => onSeatClick('backRightPassengerWeight')}
      >
        <User
          size={32}
          className={(weights.backRightPassengerWeight || 0) > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <span className="text-sm text-foreground">Back Right</span>
        {(weights.backRightPassengerWeight || 0) > 0 && (
          <span className="text-xs font-medium text-foreground">
            {weights.backRightPassengerWeight} kg
          </span>
        )}
      </div>
    </div>
  </div>
));

const SeatLayout: React.FC<SeatLayoutProps> = ({weights, aircraftType, onChange}) => {
  const [selectedSeat, setSelectedSeat] = React.useState<keyof Omit<
        CalculatorInputs,
        'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'
    > | null>(null);

  const [seatWeight, setSeatWeight] = React.useState<number>(0);

  const isTandem = aircraftType?.includes('PA18-150');
  const is6Seater = aircraftType?.includes('PA-32');

  const handleSeatClick = (seat: keyof Omit<
        CalculatorInputs,
        'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'
    >) => {
    setSelectedSeat(seat);
    setSeatWeight(weights[seat] || 0);
  };

  const handleSaveWeight = () => {
    if (selectedSeat) {
      onChange(selectedSeat, seatWeight.toString());
      setSelectedSeat(null);
    }
  };

  const handleDialogClose = () => {
    setSelectedSeat(null);
  };

  // Render the appropriate layout based on aircraft type
  const renderLayout = () => {
    if (isTandem) {
      return <TandemLayout weights={weights} onSeatClick={handleSeatClick}/>;
    } else if (is6Seater) {
      return <SixSeatLayout weights={weights} onSeatClick={handleSeatClick}/>;
    } else {
      return <StandardLayout weights={weights} onSeatClick={handleSeatClick}/>;
    }
  };

  return (
    <>
      {renderLayout()}

      <Dialog open={!!selectedSeat} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Passenger Weight</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <NumberInput
                value={seatWeight}
                onChange={(e) => setSeatWeight(parseFloat(e.toString()) || 0)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveWeight();
                  }
                }}
                autoFocus
                className="col-span-4"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded"
              onClick={handleSaveWeight}
            >
                            Save
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SeatLayout;