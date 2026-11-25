/**
 * What a pilot accepts, once per account, before using the navigation mode. Raise the version when
 * the terms change in substance: everyone is asked again.
 */
export const NAV_TERMS_VERSION = 1;

export const NAV_TERMS = [
  'This is a VFR navigation aid. You remain responsible for the flight: navigate by what you see, the official charts and your instruments.',
  'Check the AIP and NOTAMs before flight. The airspace comes from openAIP, which volunteers maintain: it may be incomplete or out of date, and it has no NOTAMs, temporary areas or obstacles.',
  'Altitude is GPS altitude, not pressure altitude: it can be 100 ft or more from what your altimeter shows.',
  'The GPS needs the app in front with the screen on; a phone or tablet can lose its fix, its battery or its connection.',
];

const localKey = (userId: number) => `nav.terms.v${NAV_TERMS_VERSION}.${userId}`;

/** Accepted on this device but not yet saved to the account (no connection at the time). */
export function acceptedHere(userId: number): boolean {
  try { return localStorage.getItem(localKey(userId)) === 'yes'; } catch { return false; }
}

export function markAcceptedHere(userId: number): void {
  try { localStorage.setItem(localKey(userId), 'yes'); } catch { /* private mode */ }
}

/** "Airspace data is 31 days old": past one AIRAC cycle (28 days) the pilot should update it. */
export const AIRAC_DAYS = 28;
export function dataAgeDays(fetchedAt: number, now = Date.now()): number {
  return Math.floor((now - fetchedAt) / 86_400_000);
}
