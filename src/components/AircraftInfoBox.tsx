import React from 'react';
import {Card, CardContent} from './ui/Card';

interface AircraftPerformanceProps {
    maxDemoCrosswind: number;
    stallSpeedClean: number;
    stallSpeedLanding: number;
    bestClimbSpeed: number;
    approachSpeedNormal: number;
    emptyWeight: number;
    mtow: number;
    maxBaggage: number;
    maxFuelLiters: number;
    speedUnit?: 'KIAS' | 'MPH';  // Add speed unit
    aircraftType: string;        // Add aircraft type for identification
}

const AircraftInfoBox: React.FC<AircraftPerformanceProps> = ({
  maxDemoCrosswind,
  stallSpeedClean,
  stallSpeedLanding,
  bestClimbSpeed,
  approachSpeedNormal,
  emptyWeight,
  mtow,
  maxBaggage,
  maxFuelLiters,
  speedUnit = 'KIAS',
  aircraftType
}) => {
  // Helper function to format speed display
  const formatSpeed = (speed: number) => {
    if (aircraftType.includes('PA18-150')) {
      const kias = Math.round(speed * 0.868976); // Convert MPH to KIAS
      return `${speed} MPH (${kias} KIAS)`;
    }
    return `${speed} KIAS`;
  };

  return (
    <Card className="mt-4 bg-card text-card-foreground">
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Weights</h3>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Empty Weight:</span>
                <span className="font-medium">{emptyWeight} kg</span>
              </li>
              <li className="flex justify-between">
                <span>MTOW:</span>
                <span className="font-medium">{mtow} kg</span>
              </li>
              <li className="flex justify-between">
                <span>Max Baggage:</span>
                <span className="font-medium">{maxBaggage} kg</span>
              </li>
              <li className="flex justify-between">
                <span>Max Fuel:</span>
                <span className="font-medium">{maxFuelLiters} L</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Speeds</h3>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Best Climb:</span>
                <span className="font-medium whitespace-nowrap">{formatSpeed(bestClimbSpeed)}</span>
              </li>
              <li className="flex justify-between">
                <span>Approach:</span>
                <span
                  className="font-medium whitespace-nowrap">{formatSpeed(approachSpeedNormal)}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Stall Speeds</h3>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Clean:</span>
                <span className="font-medium whitespace-nowrap">{formatSpeed(stallSpeedClean)}</span>
              </li>
              <li className="flex justify-between">
                <span>Landing:</span>
                <span className="font-medium whitespace-nowrap">{formatSpeed(stallSpeedLanding)}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Limitations</h3>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Max Crosswind:</span>
                <span className="font-medium">{maxDemoCrosswind} kts</span>
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AircraftInfoBox;