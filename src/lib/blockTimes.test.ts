import { blockTimesOf, finishBlockLog, hhmm, newBlockLog, nextBlockLog, ON_BLOCK_MS, utcTime, type BlockLog } from './blockTimes';

/** A fix every second: [seconds, kt], moving east at that speed. */
function fly(plan: Array<[number, number]>, start = newBlockLog()): BlockLog {
  let log = start, lon = 17, t = 0;
  for (const [secs, kt] of plan) {
    for (let i = 0; i < secs; i++) {
      t += 1000;
      lon += (kt * 1852) / 3600 / (111_320 * Math.cos((59 * Math.PI) / 180));
      log = nextBlockLog(log, { lat: 59, lon, speedKt: kt, at: t });
    }
  }
  return log;
}

describe('block times', () => {
  it('off block, takeoff, landing, and on block after a stop of 4 minutes', () => {
    const log = fly([[60, 0], [120, 10], [60, 0], [20, 60], [1800, 100], [60, 60], [30, 15], [300, 0]]);
    expect(log.offBlockAt).toBe(61_000); // after a minute parked
    expect(log.takeoffAt).toBe(241_000); // after taxiing and holding a minute
    expect(log.landingAt).toBe((241 + 20 + 1800 + 60) * 1000); // slowed below 35 kt
    expect(log.landings).toBe(1);
    expect(log.onBlockAt).toBe((241 + 20 + 1800 + 60 + 30) * 1000);
    expect(log.phase).toBe('on-block');
  });

  it('a stop of under 4 minutes on the way in (a clearance) is not on block', () => {
    const log = fly([[10, 10], [20, 60], [600, 100], [60, 60], [20, 15], [180, 0], [60, 10]]);
    expect(log.phase).toBe('taxi-in');
    expect(log.onBlockAt).toBeNull();
    // Ended while still taxiing: on block now.
    const ended = finishBlockLog(log, 999_999);
    expect(ended.onBlockAt).toBe(999_999);
  });

  it('ended while standing after landing (under 4 minutes): on block since it stopped', () => {
    const log = fly([[10, 10], [20, 60], [600, 100], [60, 60], [20, 15], [60, 0]]);
    const since = log.stop?.since ?? NaN;
    const ended = finishBlockLog(log, since + 60_000);
    expect(ended.onBlockAt).toBe(since);
    expect(ON_BLOCK_MS).toBe(240_000);
  });

  it('touch-and-goes: the first takeoff, the last landing, every landing counted', () => {
    const log = fly([[10, 10], [20, 60], [300, 90], [20, 30], [20, 60], [300, 90], [30, 20], [300, 0]]);
    expect(log.landings).toBe(2);
    expect(log.takeoffAt).toBe(11_000);
    expect(log.landingAt).toBe((10 + 20 + 300 + 20 + 20 + 300) * 1000 + 1000);
  });

  it('GPS drift while parked is not off block, and unknown speed is skipped', () => {
    let log = newBlockLog();
    for (let t = 1; t < 300; t++) log = nextBlockLog(log, { lat: 59 + (t % 2) * 0.00005, lon: 17, speedKt: t % 2 ? 4 : 0, at: t * 1000 });
    log = nextBlockLog(log, { lat: 59, lon: 17, speedKt: null, at: 400_000 });
    expect(log.offBlockAt).toBeNull();
    expect(log.phase).toBe('parked');
  });

  it('recording started on the takeoff roll: off block is the first that is known', () => {
    const log = fly([[30, 60]]);
    expect(log.offBlockAt).toBe(1000);
    expect(log.takeoffAt).toBe(1000);
  });

  it('formats for the logbook and the server', () => {
    expect(hhmm(0, 67 * 60_000)).toBe('1:07');
    expect(hhmm(null, 1)).toBeNull();
    expect(utcTime(Date.UTC(2026, 10, 27, 14, 5))).toBe('14:05Z');
    const times = blockTimesOf({ ...newBlockLog(), takeoffAt: 0, landings: 1 });
    expect(times).toEqual({ offBlock: null, takeoff: '1970-01-01T00:00:00.000Z', landing: null, onBlock: null, landings: 1 });
  });
});
