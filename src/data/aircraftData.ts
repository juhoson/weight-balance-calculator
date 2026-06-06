// Update the aircraftData object to include the new aircraft
// Add speed unit type
type SpeedUnit = 'KIAS' | 'MPH';

interface FuelConsumption {
    powerSetting: '55%' | '65%' | '75%';
    litersPerHour: number;
    speed: number;
    speedUnit: SpeedUnit;  // Added speed unit
}


interface AircraftPerformance {
    cruiseSpeed?: number;
    maxDemoCrosswind: number;
    stallSpeedClean: number;
    stallSpeedLanding: number;
    bestClimbSpeed: number;
    bestGlideSpeed?: number;
    approachSpeedNormal: number;
    speedUnit: SpeedUnit;  // Added speed unit for all performance speeds
    fuelConsumption: FuelConsumption[];
    taxiFuel: {
        liters: number;
        timeMinutes: number;
    };
    reserveFuel: {
        minimumMinutes: number;
        recommendedLiters: number;
    };
}

export const mphToKias = (mph: number): number => {
  return mph * 0.868976;
};

export const kiasToMph = (kias: number): number => {
  return kias / 0.868976;
};

interface AircraftStations {
    pilotFront: { arm: number; maxWeight: number; };
    passengerRear?: { arm: number; maxWeight: number; };  // Optional for standard layout
    passengerBack?: { arm: number; maxWeight: number; };  // Optional for tandem layout
    baggage: { arm: number; maxWeight: number; };
    fuel: {
        arm: number;
        maxLiters: number;
        standardLiters: number;
        weightPerLiter: number;
    };
}

export interface AircraftData {
    type: string;
    basicEmptyWeight: number;
    armAftDatum: number;
    mtow: number;
    maxBaggage: number;
    stations: AircraftStations;
    envelope: {
        points: Array<{ cg: number; weight: number; }>;
        limits: {
            maxWeight: number;
            minWeight: number;
            forwardCG: number;
            aftCG: number;
        };
    };
    performance: AircraftPerformance;
}

// Helper function to get speed in desired unit
export const getSpeedInUnit = (
  speed: number,
  fromUnit: SpeedUnit,
  toUnit: SpeedUnit
): number => {
  if (fromUnit === toUnit) return speed;
  return fromUnit === 'MPH' ? mphToKias(speed) : kiasToMph(speed);
};

// Helper function to format speed with unit
export const formatSpeed = (
  speed: number,
  unit: SpeedUnit,
  targetUnit?: SpeedUnit
): string => {
  const displaySpeed = targetUnit ?
    getSpeedInUnit(speed, unit, targetUnit) :
    speed;
  const displayUnit = targetUnit || unit;
  return `${Math.round(displaySpeed)} ${displayUnit}`;
};

export const aircraftData: Record<string, AircraftData> = {
  'DA40D (SE-MBC)': {
    type: 'Diamond DA40 D',
    basicEmptyWeight: 840,
    armAftDatum: 2.453,
    mtow: 1150,
    maxBaggage: 30,
    stations: {
      pilotFront: {arm: 2.30, maxWeight: 340},
      passengerRear: {arm: 3.25, maxWeight: 340},
      baggage: {arm: 3.65, maxWeight: 30},
      fuel: {
        arm: 2.63,
        weightPerLiter: 0.8,
        maxLiters: 148,
        standardLiters: 106
      }
    },
    envelope: {
      points: [
        {cg: 2.40, weight: 840},
        {cg: 2.40, weight: 980},
        {cg: 2.46, weight: 1150},
        {cg: 2.59, weight: 1150},
        {cg: 2.59, weight: 840},
        {cg: 2.40, weight: 840}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 15, speed: 106, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 18, speed: 116, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 22, speed: 122, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 11
      }
    }
  },
  'DA40NG (SE-MIO)': {
    type: 'Diamond DA40 NG',
    basicEmptyWeight: 930,
    armAftDatum: 2.467,
    mtow: 1280,
    maxBaggage: 45,
    stations: {
      pilotFront: {arm: 2.30, maxWeight: 340},
      passengerRear: {arm: 3.25, maxWeight: 340},
      baggage: {arm: 3.89, maxWeight: 45},
      fuel: {
        arm: 2.63,
        weightPerLiter: 0.8,
        maxLiters: 148,
        standardLiters: 106
      }
    },
    envelope: {
      points: [
        {cg: 2.40, weight: 940},
        {cg: 2.40, weight: 1080},
        {cg: 2.46, weight: 1280},
        {cg: 2.53, weight: 1280},
        {cg: 2.53, weight: 940},
        {cg: 2.40, weight: 940}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 15, speed: 96, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 19, speed: 113, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 25, speed: 125, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 11
      }
    }
  },
  'PA28-161 (SE-KMI)': {
    type: 'Piper PA-28-161',
    basicEmptyWeight: 682.4,
    armAftDatum: 2.13,
    mtow: 1055,
    maxBaggage: 23,
    stations: {
      pilotFront: {arm: 2.05, maxWeight: 340},
      passengerRear: {arm: 3.00, maxWeight: 340},
      baggage: {arm: 3.63, maxWeight: 23},
      fuel: {
        arm: 2.41,
        weightPerLiter: 0.72,
        maxLiters: 182,
        standardLiters: 128
      }
    },
    envelope: {
      points: [
        {cg: 2.11, weight: 750},
        {cg: 2.11, weight: 885},
        {cg: 2.21, weight: 1055},
        {cg: 2.36, weight: 1055},
        {cg: 2.36, weight: 750},
        {cg: 2.11, weight: 750}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 29.5, speed: 91, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 33.3, speed: 99, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 37.9, speed: 107, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4.2,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 22.1
      }
    }
  },
  'PA18-150 (SE-GCG)': {
    type: 'Piper PA-18-150 Super Cub',
    basicEmptyWeight: 467,
    armAftDatum: 2.31,
    mtow: 794,
    maxBaggage: 20,
    stations: {
      pilotFront: {
        arm: 2.16,
        maxWeight: 110
      },
      passengerBack: {
        arm: 3.12,
        maxWeight: 110
      },
      baggage: {
        arm: 3.68,
        maxWeight: 20
      },
      fuel: {
        arm: 2.79,
        weightPerLiter: 0.72,
        maxLiters: 140,
        standardLiters: 88
      }
    },
    envelope: {
      points: [
        {cg: 2.08, weight: 467},
        {cg: 2.08, weight: 680},
        {cg: 2.39, weight: 794},
        {cg: 2.54, weight: 794},
        {cg: 2.54, weight: 467},
        {cg: 2.08, weight: 467}
      ],
      limits: {
        maxWeight: 794,
        minWeight: 467,
        forwardCG: 2.08,
        aftCG: 2.54
      }
    },
    performance: {
      maxDemoCrosswind: 15,
      stallSpeedClean: 50,
      stallSpeedLanding: 45,
      bestClimbSpeed: 69,
      approachSpeedNormal: 63,
      speedUnit: 'MPH',
      fuelConsumption: [
        {
          powerSetting: '55%',
          litersPerHour: 18,
          speed: 98,
          speedUnit: 'MPH'
        },
        {
          powerSetting: '65%',
          litersPerHour: 22,
          speed: 109,
          speedUnit: 'MPH'
        },
        {
          powerSetting: '75%',
          litersPerHour: 26,
          speed: 117,
          speedUnit: 'MPH'
        }
      ],
      taxiFuel: {
        liters: 3,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 15
      }
    }
  },
  // New aircraft: OH-WOW - Diamond DA40 NG
  'DA40NG (OH-WOW)': {
    type: 'Diamond DA40 NG',
    basicEmptyWeight: 924,
    armAftDatum: 2.456,
    mtow: 1280,
    maxBaggage: 45,
    stations: {
      pilotFront: {arm: 2.30, maxWeight: 340},
      passengerRear: {arm: 3.25, maxWeight: 340},
      baggage: {arm: 3.89, maxWeight: 45},
      fuel: {
        arm: 2.63,
        weightPerLiter: 0.8,
        maxLiters: 148,
        standardLiters: 106
      }
    },
    envelope: {
      points: [
        {cg: 2.40, weight: 940},
        {cg: 2.40, weight: 1080},
        {cg: 2.46, weight: 1280},
        {cg: 2.53, weight: 1280},
        {cg: 2.53, weight: 940},
        {cg: 2.40, weight: 940}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 15, speed: 96, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 19, speed: 113, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 25, speed: 125, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 11
      }
    }
  },

  // New aircraft: SE-GVE - Piper PA-28-161 Warrior II
  'PA28-161 (SE-GVE)': {
    type: 'Piper PA-28-161 Warrior II',
    basicEmptyWeight: 685,
    armAftDatum: 2.14,
    mtow: 1055,
    maxBaggage: 23,
    stations: {
      pilotFront: {arm: 2.05, maxWeight: 340},
      passengerRear: {arm: 3.00, maxWeight: 340},
      baggage: {arm: 3.63, maxWeight: 23},
      fuel: {
        arm: 2.41,
        weightPerLiter: 0.72,
        maxLiters: 182,
        standardLiters: 128
      }
    },
    envelope: {
      points: [
        {cg: 2.11, weight: 750},
        {cg: 2.11, weight: 885},
        {cg: 2.21, weight: 1055},
        {cg: 2.36, weight: 1055},
        {cg: 2.36, weight: 750},
        {cg: 2.11, weight: 750}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 29.5, speed: 91, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 33.3, speed: 99, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 37.9, speed: 107, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4.2,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 22.1
      }
    }
  },
  'PA28-181 (SE-GLC)': {
    type: 'Piper PA-28-181 Cherokee Archer',
    basicEmptyWeight: 712, // kg - from provided load sheet (dated 2003-05-19)
    armAftDatum: 2.195, // m - from load sheet (219.5 cm converted to m)
    mtow: 1110, // kg - from load sheet (Normal Category)
    maxBaggage: 91, // kg - from load sheet

    stations: {
      pilotFront: {arm: 2.15, maxWeight: 135}, // Estimated arm from similar PA-28 models
      passengerRear: {arm: 3.00, maxWeight: 135}, // Estimated arm from similar PA-28 models
      baggage: {arm: 3.63, maxWeight: 91},  // Max baggage from load sheet
      fuel: {
        arm: 2.40, // Estimated from similar PA-28 models
        weightPerLiter: 0.72, // Standard aviation fuel density
        maxLiters: 182, // From load sheet (129 kg usable / 0.72 kg/L ≈ 182 L)
        standardLiters: 129 // From load sheet (standard tanks)
      }
    },

    envelope: {
      // Points derived from the CG envelope graph in the load sheet
      points: [
        {cg: 2.08, weight: 600},
        {cg: 2.08, weight: 950},
        {cg: 2.13, weight: 1110}, // MTOW
        {cg: 2.35, weight: 1110}, // MTOW
        {cg: 2.35, weight: 600},
        {cg: 2.08, weight: 600}  // Closes the envelope polygon
      ],
      limits: {
        maxWeight: 1110, // kg - Normal Category MTOW
        minWeight: 600,  // kg - Minimum in the envelope
        forwardCG: 2.08, // m
        aftCG: 2.35      // m
      }
    },

    performance: {
      maxDemoCrosswind: 17, // knots - standard for PA-28 models
      stallSpeedClean: 55, // knots - estimated from PA-28-181 data
      stallSpeedLanding: 49, // knots - estimated from PA-28-181 data
      bestClimbSpeed: 76, // knots - estimated from PA-28-181 data
      approachSpeedNormal: 70, // knots - estimated from PA-28-181 data
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 24, speed: 100, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 30, speed: 110, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 36, speed: 120, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 18
      }
    }
  },
  'PA-32R-300 (SE-GRZ)': {
    type: 'Piper PA-32R-300 Lance',
    basicEmptyWeight: 975.65, // kg from SE-GRZ document
    armAftDatum: 2.0401, // m from SE-GRZ document (204.01 cm converted to m)
    mtow: 1633, // kg
    maxBaggage: 91, // kg
    stations: {
      pilotFront: {arm: 2.04, maxWeight: 340},
      passengerRear: {arm: 2.99, maxWeight: 340}, // Middle row
      passengerBack: {arm: 3.65, maxWeight: 340}, // Back row (third row)
      baggage: {arm: 4.54, maxWeight: 91},
      fuel: {
        arm: 2.38,
        weightPerLiter: 0.72,
        maxLiters: 356, // from SE-GRZ document
        standardLiters: 253 // from SE-GRZ document
      }
    },
    envelope: {
      points: [
        {cg: 1.93, weight: 1089}, // 193.0 cm converted to m
        {cg: 2.032, weight: 1315}, // 203.2 cm converted to m
        {cg: 2.322, weight: 1633}, // 232.2 cm converted to m
        {cg: 2.413, weight: 1633}, // 241.3 cm converted to m
        {cg: 2.413, weight: 1089}, // 241.3 cm converted to m
        {cg: 1.93, weight: 1089} // Closes the envelope polygon
      ],
      limits: {
        maxWeight: 1633,
        minWeight: 1089,
        forwardCG: 1.93,
        aftCG: 2.413
      }
    },
    performance: {
      maxDemoCrosswind: 17, // knots - estimated from similar PA-32R models
      stallSpeedClean: 70, // knots - estimated 73 MPH converted
      stallSpeedLanding: 65, // knots - estimated 65 MPH converted
      bestClimbSpeed: 95, // knots - estimated 106 MPH converted
      approachSpeedNormal: 78, // knots - estimated 86 MPH converted
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 45, speed: 125, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 60, speed: 145, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 75, speed: 160, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 5,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 45
      }
    }
  },
  // PA28-161 Cadet HB-OJI — Lausanne Aeroclub
  // Empty weight from standard PA28-161 Cadet published values (aircraft-specific W&B sheet not available)
  // MTOW, max baggage, fuel and crosswind from CL-PA28-161-Cadet-EN1 checklist; arms from standard PA-28-161 datum
  'PA28-161 (HB-OJI)': {
    type: 'Piper PA-28-161 Cadet',
    basicEmptyWeight: 676,
    armAftDatum: 2.13,
    mtow: 1055,
    maxBaggage: 23,
    stations: {
      pilotFront: {arm: 2.05, maxWeight: 340},
      passengerRear: {arm: 3.00, maxWeight: 340},
      baggage: {arm: 3.63, maxWeight: 23},
      fuel: {
        arm: 2.41,
        weightPerLiter: 0.72,
        maxLiters: 182,
        standardLiters: 128
      }
    },
    envelope: {
      points: [
        {cg: 2.11, weight: 700},
        {cg: 2.11, weight: 885},
        {cg: 2.21, weight: 1055},
        {cg: 2.36, weight: 1055},
        {cg: 2.36, weight: 700},
        {cg: 2.11, weight: 700}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 29.5, speed: 91, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 34, speed: 99, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 37.9, speed: 107, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4.2,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 22.1
      }
    }
  },
  'TB9 (SE-KBH)': {
    type: 'SOCATA TB9 Tampico',
    basicEmptyWeight: 652,
    armAftDatum: 1.12,
    mtow: 1060,
    maxBaggage: 40,
    stations: {
      pilotFront: {arm: 1.09, maxWeight: 340},
      passengerRear: {arm: 1.745, maxWeight: 340},
      baggage: {arm: 2.29, maxWeight: 40},
      fuel: {
        arm: 1.395,
        weightPerLiter: 0.72,
        maxLiters: 152,
        standardLiters: 120
      }
    },
    envelope: {
      points: [
        {cg: 1.035, weight: 652},
        {cg: 1.035, weight: 900},
        {cg: 1.05, weight: 1060},
        {cg: 1.355, weight: 1060},
        {cg: 1.355, weight: 652},
        {cg: 1.035, weight: 652}
      ],
      limits: {
        maxWeight: 1060,
        minWeight: 650,
        forwardCG: 1.035,
        aftCG: 1.355
      }
    },
    performance: {
      maxDemoCrosswind: 25,
      stallSpeedClean: 58,
      stallSpeedLanding: 50,
      bestClimbSpeed: 85,
      bestGlideSpeed: 86,
      approachSpeedNormal: 80,
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 19, speed: 113, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 24, speed: 120, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 29, speed: 128, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 3,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 14
      }
    }
  },
  'PA28-161 (SE-KML)': {
    type: 'Piper PA-28-161 Cadet',
    basicEmptyWeight: 663,
    armAftDatum: 2.13,
    mtow: 1055,
    maxBaggage: 23,
    stations: {
      pilotFront: {arm: 2.05, maxWeight: 340},
      passengerRear: {arm: 3.00, maxWeight: 340},
      baggage: {arm: 3.63, maxWeight: 23},
      fuel: {
        arm: 2.41,
        weightPerLiter: 0.72,
        maxLiters: 182,
        standardLiters: 128
      }
    },
    envelope: {
      points: [
        {cg: 2.11, weight: 700},
        {cg: 2.11, weight: 885},
        {cg: 2.21, weight: 1055},
        {cg: 2.36, weight: 1055},
        {cg: 2.36, weight: 700},
        {cg: 2.11, weight: 700}
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
      speedUnit: 'KIAS',
      fuelConsumption: [
        {powerSetting: '55%', litersPerHour: 29.5, speed: 91, speedUnit: 'KIAS'},
        {powerSetting: '65%', litersPerHour: 33.3, speed: 99, speedUnit: 'KIAS'},
        {powerSetting: '75%', litersPerHour: 37.9, speed: 107, speedUnit: 'KIAS'}
      ],
      taxiFuel: {
        liters: 4.2,
        timeMinutes: 10
      },
      reserveFuel: {
        minimumMinutes: 45,
        recommendedLiters: 22.1
      }
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
  const point = {cg, weight};
  return isPointInPolygon(point, aircraft.envelope.points);
};