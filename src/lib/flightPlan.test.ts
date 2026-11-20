import { parseFlightPlan } from './flightPlan';

it('reads a bare route with DCT between the points', () => {
  expect(parseFlightPlan('ESSX DCT ESOW DCT 5930N01700E DCT ESSA')).toEqual({
    from: 'ESSX', to: 'ESSA', via: ['ESOW', '5930N01700E'], skipped: [],
  });
});

it('reads a route without DCT, in lower case, with ForeFlight-style positions', () => {
  expect(parseFlightPlan('essx  5930N/01700E\nessa')).toEqual({ from: 'ESSX', to: 'ESSA', via: ['5930N01700E'], skipped: [] });
});

it('reads item 15 alone: speed/level first, speed changes on points, no aerodromes', () => {
  const p = parseFlightPlan('N0105VFR DCT 59N017E DCT ESOW/N0100A035 DCT 593015N0170030E');
  expect(p).toEqual({ from: null, to: null, via: ['59N017E', 'ESOW', '593015N0170030E'], skipped: [] });
});

it('reads a whole FPL message', () => {
  const p = parseFlightPlan(`(FPL-SEABC-VG
-C172/L-SDFGY/S
-ESSX1200
-N0105VFR DCT 5930N01700E DCT ESOW DCT 5915N01630E
-ESSA0130 ESGG
-DOF/261120 RMK/LOCAL-FLIGHT)`);
  expect(p).toEqual({ from: 'ESSX', to: 'ESSA', via: ['5930N01700E', 'ESOW', '5915N01630E'], skipped: [] });
});

it('lists what it cannot place, and treats ZZZZ as unknown', () => {
  const p = parseFlightPlan('(FPL-SEABC-VG -C172/L-S/C -ZZZZ1200 -N0105VFR DCT TROSA DCT NOR DCT UN872 DCT ESOW180040 -ESSA0130 -DEP/GRASS STRIP)');
  expect(p.from).toBeNull();
  expect(p.to).toBe('ESSA');
  expect(p.via).toEqual([]);
  expect(p.skipped.map(s => s.token)).toEqual(['ZZZZ', 'TROSA', 'NOR', 'UN872', 'ESOW180040']);
});

it('drops aerodromes repeated inside the route of a message', () => {
  expect(parseFlightPlan('(FPL-X-VG -C172/L-S/C -ESSX1200 -N0105VFR ESSX DCT ESOW DCT ESSA -ESSA0130)').via).toEqual(['ESOW']);
});
