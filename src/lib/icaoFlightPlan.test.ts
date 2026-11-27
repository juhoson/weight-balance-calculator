import { flightPlan, fplCoordinates, isIcaoAerodrome, routeElement, typeDesignator, type FlightPlanInput } from './icaoFlightPlan';
import { namePosition, positionCode } from './routePoint';

test('coordinates as item 15 writes them: degrees and minutes', () => {
  expect(fplCoordinates(59.5894, 16.6336)).toBe('5935N01638E');
  expect(fplCoordinates(-33.95, -18.6)).toBe('3357S01836W');
});

test('a visual reporting point goes in as coordinates; an IFR fix by its name', () => {
  const vrp = positionCode(59.6123, 16.4512, true);
  namePosition(vrp, 'WHISKEY');
  expect(routeElement({ code: vrp, lat: 59.6123, lon: 16.4512 })).toBe('5937N01627E');
  // A name that is no AIP fix, or a fix's name far from the fix, is still coordinates.
  const fake = positionCode(60, 15, true);
  namePosition(fake, 'ABCDE');
  expect(routeElement({ code: fake, lat: 60, lon: 15 })).toBe('6000N01500E');
  // An airfield on the way, too.
  expect(routeElement({ code: 'ESSU', lat: 59.3509, lon: 16.7084 })).toBe('5921N01643E');
});

test('aerodromes without an ICAO indicator are ZZZZ', () => {
  expect(isIcaoAerodrome('ESOW')).toBe(true);
  expect(isIcaoAerodrome('SE-0062')).toBe(false);
  expect(isIcaoAerodrome('KF45')).toBe(false); // a local (FAA) identifier, not an ICAO location indicator
});

const input: FlightPlanInput = {
  callsign: 'SE-KMI', aircraftType: 'P28A', wake: 'L', equipment: 'SY/C',
  departure: { code: 'ESOW', name: 'Västerås', lat: 59.5894, lon: 16.6336 },
  offBlock: new Date(Date.UTC(2026, 10, 28, 9, 30)),
  speedKt: 107, level: 3000, via: [],
  destination: { code: 'SE-0062', name: 'Helby Säteri', lat: 59.1, lon: 17.2 },
  eetMinutes: 48, alternate: 'ESSU', remarks: '',
  enduranceMinutes: 245, fuelLiters: 128.4, personsOnBoard: 2, colours: 'white red', pilot: 'A Pilot',
};

test('the whole plan: items, the ATS message, item 19 and what is on board', () => {
  const p = flightPlan(input);
  expect(p.message).toBe('(FPL-SEKMI-VG\n-P28A/L-SY/C\n-ESOW0930\n-N0107A030 DCT\n-ZZZZ0048 ESSU\n-DOF/261128 DEST/HELBY SATERI 5906N01712E)');
  expect(p.supplementary).toBe('E/0405 P/002 A/WHITE RED C/A PILOT');
  expect(p.onBoard).toEqual([
    { label: 'Fuel on board', value: '128 L' },
    { label: 'Endurance (E/)', value: '0405 (4 h 05 min)' },
    { label: 'Persons on board (P/)', value: '2' },
  ]);
});

test('reporting points on the way are named in the remarks', () => {
  const vrp = positionCode(59.6123, 16.4512, true);
  namePosition(vrp, 'WHISKEY');
  const p = flightPlan({ ...input, level: 'VFR', via: [{ code: vrp, lat: 59.6123, lon: 16.4512 }], remarks: 'training' });
  expect(p.items.find(i => i.item === '15')?.value).toBe('N0107VFR DCT 5937N01627E DCT');
  expect(p.items.find(i => i.item === '18')?.value).toMatch(/RMK\/VIA WHISKEY 5937N01627E TRAINING$/);
});

test('ICAO type designators for the app\'s models', () => {
  expect(typeDesignator('PA28-161')).toBe('P28A');
  expect(typeDesignator('C172S')).toBe('C172');
  expect(typeDesignator('DA40NG')).toBe('DA40');
  expect(typeDesignator('Unknown')).toBe('');
});

test('persons on board: the layout\'s seats with someone in them', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { personsOnBoard } = require('./seatLayout') as typeof import('./seatLayout');
  expect(personsOnBoard({ pilotWeight: 80, frontPassengerWeight: 70, rearLeftPassengerWeight: 60 }, 'standard')).toBe(3);
  // A rear seat weight left over from another aircraft doesn't count in a two-seater.
  expect(personsOnBoard({ pilotWeight: 80, rearLeftPassengerWeight: 60 }, 'twoSeat')).toBe(1);
  expect(personsOnBoard({}, 'tandem')).toBe(1);
});
