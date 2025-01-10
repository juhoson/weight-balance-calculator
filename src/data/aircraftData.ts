export interface AircraftData {
    type: string;
    basicEmptyWeight: number;
    armAftDatum: number;
    mtow: number;
    maxBaggage: number;
    stations: {
        pilotFront: { arm: number; maxWeight: number; };
        passengerRear: { arm: number; maxWeight: number; };
        baggage: { arm: number; maxWeight: number; };
        fuel: {
            arm: number;
            maxLiters: number;
            standardLiters: number;
            weightPerLiter: number;
        };
    };
    envelope: {
        points: Array<{ cg: number; weight: number; }>;
        limits: {
            maxWeight: number;
            minWeight: number;
            forwardCG: number;
            aftCG: number;
        };
    };
    performance: {
        cruiseSpeed?: number;
        maxDemoCrosswind: number;
        stallSpeedClean: number;
        stallSpeedLanding: number;
        bestClimbSpeed: number;
        approachSpeedNormal: number;
        fuelConsumption: number
    };
}


export const aircraftData: Record<string, AircraftData> = {
    'C172S (SE-MIA)': {
        type: 'Cessna 172S',
        basicEmptyWeight: 800.4,
        armAftDatum: 1.062,
        mtow: 1155,
        maxBaggage: 54,
        stations: {
            pilotFront: { arm: 0.94, maxWeight: 340 },
            passengerRear: { arm: 1.85, maxWeight: 340 },
            baggage: { arm: 2.41, maxWeight: 54 },
            fuel: {
                arm: 1.17,
                weightPerLiter: 0.72,
                maxLiters: 200,
                standardLiters: 132
            }
        },
        envelope: {
            points: [
                { cg: 0.89, weight: 800 },
                { cg: 0.89, weight: 883 },
                { cg: 1.04, weight: 1155 },
                { cg: 1.20, weight: 1155 },
                { cg: 1.20, weight: 800 },
                { cg: 0.89, weight: 800 }
            ],
            limits: {
                maxWeight: 1155,
                minWeight: 750,
                forwardCG: 0.85,
                aftCG: 1.25
            }
        },
        performance: {
            maxDemoCrosswind: 15,
            stallSpeedClean: 48,
            stallSpeedLanding: 40,
            bestClimbSpeed: 74,
            approachSpeedNormal: 65,
            fuelConsumption: 38
        }
    },
    'DA40D (SE-MBC)': {
        type: 'Diamond DA40 D',
        basicEmptyWeight: 840,
        armAftDatum: 2.453,
        mtow: 1150,
        maxBaggage: 30,
        stations: {
            pilotFront: { arm: 2.30, maxWeight: 340 },
            passengerRear: { arm: 3.25, maxWeight: 340 },
            baggage: { arm: 3.65, maxWeight: 30 },
            fuel: {
                arm: 2.63,
                weightPerLiter: 0.8,
                maxLiters: 148,
                standardLiters: 106
            }
        },
        envelope: {
            points: [
                { cg: 2.40, weight: 840 },
                { cg: 2.40, weight: 980 },
                { cg: 2.46, weight: 1150 },
                { cg: 2.59, weight: 1150 },
                { cg: 2.59, weight: 840 },
                { cg: 2.40, weight: 840 }
            ],
            limits: {
                maxWeight: 1150,
                minWeight: 800,
                forwardCG: 2.38,
                aftCG: 2.60
            }
        },
        performance: {
            maxDemoCrosswind: 20,
            stallSpeedClean: 52,
            stallSpeedLanding: 49,
            bestClimbSpeed: 66,
            approachSpeedNormal: 67,
            fuelConsumption: 22
        }
    },
    'DA40NG (SE-MIO)': {
        type: 'Diamond DA40 NG',
        basicEmptyWeight: 930,
        armAftDatum: 2.467,
        mtow: 1280,
        maxBaggage: 45,
        stations: {
            pilotFront: { arm: 2.30, maxWeight: 340 },
            passengerRear: { arm: 3.25, maxWeight: 340 },
            baggage: { arm: 3.89, maxWeight: 45 },
            fuel: {
                arm: 2.63,
                weightPerLiter: 0.8,
                maxLiters: 148,
                standardLiters: 106
            }
        },
        envelope: {
            points: [
                { cg: 2.40, weight: 940 },
                { cg: 2.40, weight: 1080 },
                { cg: 2.46, weight: 1280 },
                { cg: 2.53, weight: 1280 },
                { cg: 2.53, weight: 940 },
                { cg: 2.40, weight: 940 }
            ],
            limits: {
                maxWeight: 1280,
                minWeight: 900,
                forwardCG: 2.38,
                aftCG: 2.54
            }
        },
        performance: {
            maxDemoCrosswind: 25,
            stallSpeedClean: 64,
            stallSpeedLanding: 59,
            bestClimbSpeed: 72,
            approachSpeedNormal: 77,
            fuelConsumption: 25
        }
    },
    'PA28-161 (SE-KMI)': {
        type: 'Piper PA-28-161',
        basicEmptyWeight: 682.4,
        armAftDatum: 2.13,
        mtow: 1055,
        maxBaggage: 23,
        stations: {
            pilotFront: { arm: 2.05, maxWeight: 340 },
            passengerRear: { arm: 3.00, maxWeight: 340 },
            baggage: { arm: 3.63, maxWeight: 23 },
            fuel: {
                arm: 2.41,
                weightPerLiter: 0.72,
                maxLiters: 182,
                standardLiters: 128
            }
        },
        envelope: {
            points: [
                { cg: 2.11, weight: 750 },
                { cg: 2.11, weight: 885 },
                { cg: 2.21, weight: 1055 },
                { cg: 2.36, weight: 1055 },
                { cg: 2.36, weight: 750 },
                { cg: 2.11, weight: 750 }
            ],
            limits: {
                maxWeight: 1055,
                minWeight: 700,
                forwardCG: 2.05,
                aftCG: 2.40
            }
        },
        performance: {
            maxDemoCrosswind: 17,
            stallSpeedClean: 50,
            stallSpeedLanding: 44,
            bestClimbSpeed: 79,
            approachSpeedNormal: 63,
            fuelConsumption: 38
        }
    }
};

// Utility functions for weight and balance calculations
export const calculateMoment = (weight: number, arm: number): number => {
    return weight * arm;
};

export const calculateCG = (totalWeight: number, totalMoment: number): number => {
    return totalMoment / totalWeight;
};

// Function to check if a point is inside a polygon (using ray casting algorithm)
const isPointInPolygon = (point: { cg: number; weight: number }, polygon: Array<{ cg: number; weight: number }>) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].cg, yi = polygon[i].weight;
        const xj = polygon[j].cg, yj = polygon[j].weight;

        const intersect = ((yi > point.weight) !== (yj > point.weight))
            && (point.cg < (xj - xi) * (point.weight - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }
    return inside;
};

export const isWithinEnvelope = (
    aircraft: typeof aircraftData[keyof typeof aircraftData],
    weight: number,
    cg: number
): boolean => {
    // Basic limit checks
    if (weight > aircraft.mtow) return false;
    if (weight < aircraft.envelope.limits.minWeight) return false;
    if (cg < aircraft.envelope.limits.forwardCG) return false;
    if (cg > aircraft.envelope.limits.aftCG) return false;

    // Check if point is inside the envelope polygon
    const point = { cg, weight };
    return isPointInPolygon(point, aircraft.envelope.points);
};