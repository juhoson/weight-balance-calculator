// The empty weight and arm a pilot entered for a generic aircraft, remembered per model in this
// browser so they don't have to type their aircraft's weighing values every time.

export type EmptyOverrides = Record<string, { weight: number; arm: number }>;

const KEY = 'genericEmptyWeights.v1';

export function loadEmptyOverrides(): EmptyOverrides {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as EmptyOverrides;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: EmptyOverrides = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && Number.isFinite(v.weight) && Number.isFinite(v.arm)) out[k] = { weight: v.weight, arm: v.arm };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveEmptyOverrides(overrides: EmptyOverrides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    // Not remembered; the calculator still works.
  }
}
