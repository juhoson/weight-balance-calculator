import { loadObstacles, obstacleAhead, obstacleKind, obstaclesAlong, type Obstacle } from './obstacles';

const mast = (lat: number, lon: number, topFt: number): Obstacle =>
  ({ lat, lon, topFt, heightFt: topFt - 100, type: 'ANTENNA', name: 'TEST MAST', lit: true });

// East along 60°N, 0.5° of longitude ≈ 15 NM.
const route = [{ lat: 60, lon: 15 }, { lat: 60, lon: 15.5 }];

it('lists the obstacles within 5 NM of the route, least clearance first, with the planned altitude abeam', () => {
  const near = mast(60.05, 15.25, 1600); // 3 NM north, halfway
  const tall = mast(59.97, 15.1, 1900); // 1.8 NM south, early on
  const far = mast(60.2, 15.25, 3000); // 12 NM off
  const list = obstaclesAlong([near, tall, far], route, nm => (nm < 5 ? 1500 : 2500));
  expect(list.map(o => o.topFt)).toEqual([1900, 1600]);
  expect(list[0].clearanceFt).toBe(-400);
  expect(list[1].plannedFt).toBe(2500);
  expect(list[1].offNm).toBeCloseTo(3, 0);
});

it('calls out an obstacle ahead within 2 NM that the aircraft is not 500 ft above', () => {
  const ahead = mast(60, 15.05, 1300); // 1.5 NM east
  const behind = mast(60, 14.97, 1300);
  const at = { lat: 60, lon: 15 };
  expect(obstacleAhead([ahead, behind], at, 90, 1500)?.nm).toBeCloseTo(1.5, 1);
  expect(obstacleAhead([ahead, behind], at, 90, 1800)).toBeNull(); // 500 ft clear
  expect(obstacleAhead([ahead, behind], at, 0, 1500)).toBeNull(); // heading north: off to the side
  expect(obstacleAhead([ahead], at, 90, null)).toBeNull();
});

it('names the kinds, and the dataset loads with thousands of obstacles', async () => {
  expect(obstacleKind('WINDMILL')).toBe('Wind turbine');
  const { obstacles, dates } = await loadObstacles();
  expect(obstacles.length).toBeGreaterThan(1000);
  expect(obstacles[0].topFt).toBeGreaterThan(obstacles[0].heightFt);
  expect(dates.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
