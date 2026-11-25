import { aipOutOfDate, airacText } from './aipData';

test('an amendment checked again in a later cycle stays current through that cycle', () => {
  const d = { effective: '2026-08-06', checked: '2026-10-01' };
  expect(airacText(d)).toBe('AIRAC 6 Aug 2026');
  expect(aipOutOfDate(d, Date.UTC(2026, 9, 28, 23))).toBe(false);
  expect(aipOutOfDate(d, Date.UTC(2026, 9, 29))).toBe(true);
});
