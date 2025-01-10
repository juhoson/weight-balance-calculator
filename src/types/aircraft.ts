export interface AircraftModel {
    type: string;
    basicEmptyWeight: number;
    armAftDatum: number;
    mtow: number;
    maxBaggage: number;
    usableFuel: {
        gallons: number;
        liters: number;
        weight: number;
    };
    stations: {
        pilotFront: {
            arm: number;
            maxWeight: number;
        };
        passengerRear: {
            arm: number;
            maxWeight: number;
        };
        baggage: {
            arm: number;
            maxWeight: number;
        };
        fuel: {
            arm: number;
        };
    };
}
