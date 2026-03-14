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

type SeatKey = keyof Omit<CalculatorInputs, 'fuelUnit' | 'flightTime' | 'powerSetting' | 'fuelAmount'>;

interface SeatButtonProps {
    label: string;
    weight: number;
    onClick: () => void;
}

const SeatButton: React.FC<SeatButtonProps> = ({label, weight, onClick}) => {
  const occupied = weight > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border-2 transition-all duration-150 min-w-[68px]
        ${occupied
      ? 'border-primary bg-primary/10 text-primary shadow-sm'
      : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary/70'
    }`}
    >
      <User size={26} strokeWidth={occupied ? 2.2 : 1.5}/>
      <span className="text-xs font-medium leading-tight">{label}</span>
      {occupied
        ? <span className="text-xs font-bold tabular-nums">{weight} kg</span>
        : <span className="text-[10px] opacity-50 leading-tight">tap to add</span>
      }
    </button>
  );
};

// Fuselage wrapper — aircraft silhouette as background, seat rows overlaid
const Fuselage: React.FC<{ children: React.ReactNode; rows: number }> = ({children}) => {
  return (
    <div className="relative w-full max-w-[900px] mx-auto select-none overflow-hidden" style={{minHeight: '500px'}}>
      {/* Aircraft silhouette — scaled wide so wing tips are cropped, fuselage is centred */}
      <img
        src="/weight-balance/images/vecteezy_top-view-of-plane-silhouette-icon_22093352.png"
        alt=""
        aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[190%] h-auto opacity-25 dark:invert dark:opacity-30 pointer-events-none"
      />
      {/* Seat rows */}
      <div className="absolute inset-0 flex flex-col items-center justify-around pt-[8%] pb-[20%]"
        style={{maxHeight: '450px'}}>
        {children}
      </div>
    </div>
  );
};

// Separate component for Tandem Layout (2 seats, front/back)
const TandemLayout = React.memo(({weights, onSeatClick}: LayoutProps) => (
  <Fuselage rows={2}>
    <SeatButton
      label="Pilot"
      weight={weights.pilotWeight}
      onClick={() => onSeatClick('pilotWeight')}
    />
    <SeatButton
      label="Back Seat"
      weight={weights.backPassengerWeight || 0}
      onClick={() => onSeatClick('backPassengerWeight')}
    />
  </Fuselage>
));

// Separate component for Standard Layout (4 seats, 2+2)
const StandardLayout = React.memo(({weights, onSeatClick}: LayoutProps) => (
  <Fuselage rows={2}>
    {/* Front row */}
    <div className="flex gap-3">
      <SeatButton
        label="Pilot"
        weight={weights.pilotWeight}
        onClick={() => onSeatClick('pilotWeight')}
      />
      <SeatButton
        label="Front Pass."
        weight={weights.frontPassengerWeight}
        onClick={() => onSeatClick('frontPassengerWeight')}
      />
    </div>
    {/* Rear row */}
    <div className="flex gap-3">
      <SeatButton
        label="Rear Left"
        weight={weights.rearLeftPassengerWeight}
        onClick={() => onSeatClick('rearLeftPassengerWeight')}
      />
      <SeatButton
        label="Rear Right"
        weight={weights.rearRightPassengerWeight}
        onClick={() => onSeatClick('rearRightPassengerWeight')}
      />
    </div>
  </Fuselage>
));

// Six-Seat Layout for PA-32R-300 Lance
const SixSeatLayout = React.memo(({weights, onSeatClick}: LayoutProps) => (
  <Fuselage rows={3}>
    {/* Front row */}
    <div className="flex gap-3">
      <SeatButton
        label="Pilot"
        weight={weights.pilotWeight}
        onClick={() => onSeatClick('pilotWeight')}
      />
      <SeatButton
        label="Co-Pilot"
        weight={weights.frontPassengerWeight}
        onClick={() => onSeatClick('frontPassengerWeight')}
      />
    </div>
    {/* Middle row */}
    <div className="flex gap-3">
      <SeatButton
        label="Mid Left"
        weight={weights.rearLeftPassengerWeight}
        onClick={() => onSeatClick('rearLeftPassengerWeight')}
      />
      <SeatButton
        label="Mid Right"
        weight={weights.rearRightPassengerWeight}
        onClick={() => onSeatClick('rearRightPassengerWeight')}
      />
    </div>
    {/* Back row */}
    <div className="flex gap-3">
      <SeatButton
        label="Back Left"
        weight={weights.backLeftPassengerWeight || 0}
        onClick={() => onSeatClick('backLeftPassengerWeight')}
      />
      <SeatButton
        label="Back Right"
        weight={weights.backRightPassengerWeight || 0}
        onClick={() => onSeatClick('backRightPassengerWeight')}
      />
    </div>
  </Fuselage>
));

const SeatLayout: React.FC<SeatLayoutProps> = ({weights, aircraftType, onChange}) => {
  const [selectedSeat, setSelectedSeat] = React.useState<SeatKey | null>(null);
  const [seatWeight, setSeatWeight] = React.useState<number>(0);

  const isTandem = aircraftType?.includes('PA18-150');
  const is6Seater = aircraftType?.includes('PA-32');

  const handleSeatClick = (seat: SeatKey) => {
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