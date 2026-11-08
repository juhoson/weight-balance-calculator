export type SeatLayoutKind = 'standard' | 'tandem' | 'sixSeat';

interface HasStations {
  stations: { passengerRear?: unknown; passengerBack?: unknown };
}

/**
 * Seating layout from the stations the aircraft has, not from its name:
 * a back seat without a rear row is a tandem two-seater (e.g. PA-18), a rear and a back row
 * is a six-seater (e.g. PA-32), anything else the standard four seats.
 */
export function getSeatLayout(aircraft: HasStations | undefined): SeatLayoutKind {
  if (!aircraft) return 'standard';
  const { passengerRear, passengerBack } = aircraft.stations;
  if (passengerBack && !passengerRear) return 'tandem';
  if (passengerBack && passengerRear) return 'sixSeat';
  return 'standard';
}
