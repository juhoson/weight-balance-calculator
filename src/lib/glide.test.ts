import { glideArea, glideReachNm, groundSpeedKt, headingFor, reachesField, terrainAt, terrainGridFor, turnTo, type GlideInput } from './glide';
import type { Wind } from './openMeteo';

// Wind from the west at 20 kt: the air moves east.
const west20: Wind = { u: 20, v: 0, tempC: null };
const base: GlideInput = { at: { lat: 60, lon: 15 }, altFt: 3000, ratio: 9, tasKt: 70, wind: null, terrain: null, groundFt: 0 };

it('ground speed and heading in the wind', () => {
  expect(groundSpeedKt(70, west20, 90)).toBeCloseTo(90, 5); // tailwind
  expect(groundSpeedKt(70, west20, 270)).toBeCloseTo(50, 5); // headwind
  expect(groundSpeedKt(70, west20, 0)).toBeCloseTo(Math.sqrt(70 * 70 - 400), 5); // crosswind
  // Northbound with the wind from the west: crab left, into it.
  expect(headingFor(0, 70, west20)).toBeCloseTo(360 - 16.6, 0);
  expect(headingFor(90, 70, null)).toBe(90);
});

it('reaches further downwind than upwind, and the still-air glide is height × ratio', () => {
  // 3,000 ft × 9 = 27,000 ft ≈ 4.4 NM.
  expect(glideReachNm(base, 0)).toBeCloseTo(4.4, 0);
  const windy = { ...base, wind: west20 };
  expect(glideReachNm(windy, 90)).toBeGreaterThan(5.5);
  expect(glideReachNm(windy, 270)).toBeLessThan(3.5);
  expect(glideArea(windy)).toHaveLength(36);
});

it('a hill in the way ends the glide early, and keeps a field behind it out of reach', () => {
  const grid = terrainGridFor([base.at], 10, 0.5);
  if (!grid) throw new Error('no grid');
  const ft = Array.from({ length: grid.rows * grid.cols }, (_, i) => {
    const lon = grid.west + (i % grid.cols) * grid.dLon;
    // A 2,000 ft ridge 2–3 NM east.
    return lon > 15.067 && lon < 15.1 ? 2000 : 0;
  });
  const g = { ...base, terrain: { ...grid, ft } };
  expect(terrainAt(g.terrain, { lat: 60, lon: 15.08 })).toBe(2000);
  expect(glideReachNm(g, 90)).toBeLessThan(3);
  expect(glideReachNm(g, 270)).toBeCloseTo(4.4, 0);
  const field = { lat: 60, lon: 15.12, elevationFt: 0 }; // 3.6 NM east, behind the ridge
  expect(reachesField(base, field, 3.6, 90, 500)).toBe(true);
  expect(reachesField(g, field, 3.6, 90, 500)).toBe(false);
});

it('says which way to turn', () => {
  expect(turnTo(100, 168)).toBe('right');
  expect(turnTo(350, 260)).toBe('left');
  expect(turnTo(10, 355)).toBe('left');
  expect(turnTo(165, 168)).toBe('on');
});

it('warns of rising ground ahead and of flying low away from an airfield, not near one', async () => {
  const { terrainAlert, terrainGridFor: grid } = await import('./glide');
  const g = grid([{ lat: 60, lon: 15 }], 6, 0.25);
  if (!g) throw new Error('no grid');
  // Ground 800 ft, with a 1,500 ft hill 1–1.5 NM east.
  const ft = Array.from({ length: g.rows * g.cols }, (_, i) => {
    const lon = g.west + (i % g.cols) * g.dLon;
    return lon > 15.033 && lon < 15.05 ? 1500 : 800;
  });
  const terrain = { ...g, ft };
  const at = { lat: 60, lon: 15 };
  expect(terrainAlert(at, 90, 1700, 100, 0, terrain, [])).toMatchObject({ kind: 'ahead' });
  expect(terrainAlert(at, 270, 1700, 100, 0, terrain, [])).toBeNull(); // the other way: 900 ft clear
  expect(terrainAlert(at, 270, 1200, 100, -300, terrain, [])).toMatchObject({ kind: 'low', aglFt: 400 });
  expect(terrainAlert(at, 270, 1200, 100, 500, terrain, [])).toBeNull(); // climbing away
  expect(terrainAlert(at, 270, 1200, 100, -300, terrain, [{ lat: 60.02, lon: 15 }])).toBeNull(); // 1.2 NM from a field
  expect(terrainAlert(at, 90, 1700, 100, 0, null, [])).toBeNull();
});
