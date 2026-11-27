export type SeatLayoutKind = 'standard' | 'tandem' | 'sixSeat' | 'twoSeat';

interface HasStations {
  stations: { passengerRear?: unknown; passengerBack?: unknown };
}

/**
 * Seating layout from the stations the aircraft has, not from its name:
 * a back seat without a rear row is a tandem two-seater (e.g. PA-18), a rear and a back row
 * is a six-seater (e.g. PA-32), only the front row a side-by-side two-seater (e.g. Cessna 152),
 * anything else the standard four seats.
 */
export function getSeatLayout(aircraft: HasStations | undefined): SeatLayoutKind {
  if (!aircraft) return 'standard';
  const { passengerRear, passengerBack } = aircraft.stations;
  if (passengerBack && !passengerRear) return 'tandem';
  if (passengerBack && passengerRear) return 'sixSeat';
  if (!passengerRear && !passengerBack) return 'twoSeat';
  return 'standard';
}

/** The seats each layout has, by their weight field. */
const SEATS: Record<SeatLayoutKind, string[]> = {
  twoSeat: ['pilotWeight', 'frontPassengerWeight'],
  tandem: ['pilotWeight', 'backPassengerWeight'],
  standard: ['pilotWeight', 'frontPassengerWeight', 'rearLeftPassengerWeight', 'rearRightPassengerWeight'],
  sixSeat: ['pilotWeight', 'frontPassengerWeight', 'rearLeftPassengerWeight', 'rearRightPassengerWeight', 'backLeftPassengerWeight', 'backRightPassengerWeight'],
};

/** Persons on board: the layout's seats with a weight in them (at least the pilot). */
export function personsOnBoard(weights: Partial<Record<string, number | undefined>>, layout: SeatLayoutKind): number {
  return Math.max(1, SEATS[layout].filter(k => (weights[k] ?? 0) > 0).length);
}
