import React from 'react';
import { Card, CardContent } from './ui/Card';

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
  maxFuelLiters
}) => {
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
                <span className="font-medium">{bestClimbSpeed} KIAS</span>
              </li>
              <li className="flex justify-between">
                <span>Approach:</span>
                <span className="font-medium">{approachSpeedNormal} KIAS</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Stall Speeds</h3>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Clean:</span>
                <span className="font-medium">{stallSpeedClean} KIAS</span>
              </li>
              <li className="flex justify-between">
                <span>Landing:</span>
                <span className="font-medium">{stallSpeedLanding} KIAS</span>
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