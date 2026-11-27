import { samplesAlong } from './terrainProfile';

it('samples the route evenly from end to end, at most 300 points', () => {
  const short = samplesAlong([{ lat: 59, lon: 16 }, { lat: 59.0667, lon: 16 }]); // ≈ 4 NM
  expect(short[0].nm).toBe(0);
  expect(short).toHaveLength(18); // 4.005 NM in ¼ NM steps
  expect(short[short.length - 1].lat).toBeCloseTo(59.0667, 3);
  const long = samplesAlong([{ lat: 59, lon: 16 }, { lat: 62, lon: 16 }]);
  expect(long).toHaveLength(300);
  expect(samplesAlong([{ lat: 59, lon: 16 }])).toEqual([]);
});
