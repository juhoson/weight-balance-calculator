import type { AircraftMeta } from './aircraftCatalog';

export const GENERIC_GROUP = 'Generic aircraft';
export const OWN_GROUP = 'Your aircraft';

/** What the picker shows for an aircraft: a title and a line under it. */
export function describe(key: string, meta: AircraftMeta | undefined): { title: string; subtitle: string } {
  if (!meta) return { title: key, subtitle: '' };
  if (meta.kind === 'generic') return { title: meta.label, subtitle: `Generic ${meta.code} · your own empty weight` };
  const owner = meta.owned ? 'Your aircraft' : meta.club ?? '';
  return { title: meta.registration, subtitle: [meta.model, owner].filter(Boolean).join(' · ') };
}

/** The picker's sections: generic models, your own aircraft, then each club by name. */
export function groupKeys(keys: string[], meta: Record<string, AircraftMeta>): Array<{ title: string; keys: string[] }> {
  const groups = new Map<string, string[]>();
  const add = (title: string, key: string) => groups.set(title, [...(groups.get(title) ?? []), key]);
  for (const key of keys) {
    const m = meta[key];
    if (!m || m.kind === 'generic') add(GENERIC_GROUP, key);
    else if (m.owned) add(OWN_GROUP, key);
    else add(m.club ?? 'Other aircraft', key);
  }
  const fixed = [GENERIC_GROUP, OWN_GROUP];
  const clubs = Array.from(groups.keys()).filter(t => !fixed.includes(t)).sort((a, b) => a.localeCompare(b));
  return [...fixed, ...clubs].filter(t => groups.has(t)).map(title => ({ title, keys: groups.get(title) as string[] }));
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const compact = (s: string) => fold(s).replace(/[^a-z0-9]/g, '');

/**
 * Does the aircraft match the search? Every word must appear in its registration, code, model or
 * club. Dashes and spaces are ignored, so "sekmi", "pa28" and "warrior" all find SE-KMI.
 */
export function matchesQuery(key: string, meta: AircraftMeta | undefined, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const fields = [key];
  if (meta) {
    fields.push(meta.label, meta.code);
    if (meta.kind === 'airframe') fields.push(meta.registration, meta.model, meta.club ?? '', meta.owned ? 'yours own' : '');
    else fields.push('generic');
  }
  const text = fold(fields.join(' '));
  const squashed = compact(fields.join(' '));
  return words.every(w => text.includes(w) || squashed.includes(compact(w)));
}
