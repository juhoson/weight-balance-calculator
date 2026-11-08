import { aircraftData } from '../data/aircraftData';
import { builtinCatalog, loadCachedCatalog, saveCachedCatalog, toAircraftData, toCatalog } from './aircraftCatalog';
import { getSeatLayout } from './seatLayout';
import { allBuiltinViews, genericFromBuiltin, viewFromBuiltin } from './testViews';

describe('toCatalog', () => {
  it('turns database aircraft back into exactly the built-in calculator data', () => {
    const { aircraft, skipped } = toCatalog(allBuiltinViews());
    expect(skipped).toEqual([]);
    expect(Object.keys(aircraft).sort()).toEqual(Object.keys(aircraftData).sort());
    for (const key of Object.keys(aircraftData)) {
      expect(aircraft[key]).toEqual(aircraftData[key]);
    }
  });

  it('keeps a user\'s own copy of a shared aircraft under its own key', () => {
    const shared = viewFromBuiltin('PA28-161 (SE-KMI)');
    const mine = viewFromBuiltin('PA28-161 (SE-KMI)', { owned: true, basicEmptyWeight: 690 });
    const { aircraft, meta } = toCatalog([mine, shared]);
    expect(aircraft['PA28-161 (SE-KMI)'].basicEmptyWeight).toBe(682.4);
    expect(aircraft['PA28-161 (SE-KMI, yours)'].basicEmptyWeight).toBe(690);
    expect(meta['PA28-161 (SE-KMI, yours)']).toMatchObject({ kind: 'airframe', owned: true, club: null });
  });

  it('lists generic types first, by name, with the typical values as empty weight and arm', () => {
    const club = viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Västerås Flygklubb' } });
    const { aircraft, meta } = toCatalog([club], [
      genericFromBuiltin('TB9 (F-GKVK)'),
      genericFromBuiltin('DA40D (SE-MBC)', { typicalEmptyWeight: 800, typicalEmptyArm: 2.5 }),
    ]);
    expect(Object.keys(aircraft)).toEqual(['DA40D (generic)', 'TB9 (generic)', 'PA28-161 (SE-KMI)']);
    expect(aircraft['DA40D (generic)']).toMatchObject({ basicEmptyWeight: 800, armAftDatum: 2.5 });
    expect(meta['DA40D (generic)']).toEqual({
      kind: 'generic', label: aircraftData['DA40D (SE-MBC)'].type, code: 'DA40D', typeStatus: 'CURATED',
    });
    expect(meta['PA28-161 (SE-KMI)']).toMatchObject({ kind: 'airframe', club: 'Västerås Flygklubb' });
  });

  it('leaves out aircraft the calculator cannot use', () => {
    const noBaggage = viewFromBuiltin('TB9 (F-GKVK)');
    delete noBaggage.spec.stations.baggage;
    const no75 = viewFromBuiltin('PA28-140 (SE-ILO)');
    no75.spec.performance.fuelConsumption = no75.spec.performance.fuelConsumption.slice(0, 2);
    const noFuelDensity = viewFromBuiltin('DA40D (SE-MBC)');
    noFuelDensity.spec.stations.fuel.weightPerLiter = null;

    const { aircraft, skipped } = toCatalog([noBaggage, no75, noFuelDensity, viewFromBuiltin('PA28-161 (SE-GVE)')]);
    expect(Object.keys(aircraft)).toEqual(['PA28-161 (SE-GVE)']);
    expect(skipped.sort()).toEqual(['F-GKVK', 'SE-ILO', 'SE-MBC']);
  });

  it('drops optional speeds that are null instead of passing null through', () => {
    const view = viewFromBuiltin('PA28-161 (SE-KMI)');
    view.spec.performance.bestGlideSpeed = null;
    expect(toAircraftData(view)?.performance).not.toHaveProperty('bestGlideSpeed');
  });
});

describe('builtinCatalog', () => {
  it('offers one generic aircraft per model and no registrations', () => {
    const { aircraft, meta } = builtinCatalog();
    expect(Object.keys(aircraft).sort()).toEqual([
      'DA40D (generic)', 'DA40NG (generic)', 'PA-32R-300 (generic)', 'PA18-150 (generic)', 'PA28-140 (generic)',
      'PA28-161 (generic)', 'PA28-181 (generic)', 'TB9 (generic)',
    ]);
    expect(Object.values(meta).every(m => m.kind === 'generic')).toBe(true);
    expect(aircraft['PA28-161 (generic)']).toEqual(aircraftData['PA28-161 (SE-KMI)']);
  });
});

describe('getSeatLayout', () => {
  it('matches the old name-based rule for every built-in aircraft', () => {
    for (const [key, a] of Object.entries(aircraftData)) {
      const expected = key.includes('PA18-150') ? 'tandem' : key.includes('PA-32') ? 'sixSeat' : 'standard';
      expect([key, getSeatLayout(a)]).toEqual([key, expected]);
    }
  });

  it('works for an aircraft whose name the old rule would not have recognised', () => {
    const cub = toAircraftData(viewFromBuiltin('PA18-150 (SE-GCG)', { }));
    expect(getSeatLayout(cub ?? undefined)).toBe('tandem');
  });
});

describe('offline cache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the database list', () => {
    const views = allBuiltinViews();
    const generics = [genericFromBuiltin('TB9 (F-GKVK)')];
    saveCachedCatalog(views, generics, 7, new Date('2026-11-01T10:00:00Z'));
    const cached = loadCachedCatalog(7);
    expect(cached?.savedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(cached?.views).toEqual(views);
    expect(cached?.generics).toEqual(generics);
  });

  it('ignores a corrupt cache', () => {
    localStorage.setItem('aircraftCatalog.v3', '{not json');
    expect(loadCachedCatalog(null)).toBeNull();
    localStorage.setItem('aircraftCatalog.v3', JSON.stringify({ views: 'nope' }));
    expect(loadCachedCatalog(null)).toBeNull();
  });

  it('only returns a list cached for the same user', () => {
    saveCachedCatalog(allBuiltinViews(), [], 7);
    expect(loadCachedCatalog(7)).not.toBeNull();
    expect(loadCachedCatalog(8)).toBeNull();
    expect(loadCachedCatalog(null)).toBeNull(); // signed out must not see user 7's own aircraft
    saveCachedCatalog([], [], null);
    expect(loadCachedCatalog(null)).not.toBeNull();
    expect(loadCachedCatalog(7)).toBeNull();
  });
});
