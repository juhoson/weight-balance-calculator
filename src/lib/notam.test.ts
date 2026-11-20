import { notamSource } from './notam';

it('sends Swedish airports to the ESAA FIR bulletins', () => {
  const s = notamSource('essx');
  expect(s.url).toContain('NOTAM%20Sweden');
  expect(s.hint).toMatch(/ESSX in the "ESAA FIR VFR 24hr"/);
});

it('sends Finnish, Danish and Norwegian airports to the other Nordic bulletins', () => {
  expect(notamSource('EKCH').url).toContain('NOTAM%20Other');
  expect(notamSource('ENGM').hint).toMatch(/ENOR ENOB FIR 24hr/);
  expect(notamSource('EFHK').hint).toMatch(/EFIN FIR 24hr/);
});

it('has no link elsewhere, only a reminder', () => {
  expect(notamSource('EGLL')).toEqual({ label: 'NOTAMs', url: null, hint: 'Check NOTAMs for EGLL with the national AIS or your briefing provider.' });
});
