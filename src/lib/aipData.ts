/**
 * The dates the AIP data files carry (see scripts/update-aip.py): the amendment the data is from,
 * and the AIRAC cycle it was last checked against. Past that cycle (28 days) a newer amendment may
 * be in force, so the data may be out of date.
 */
export interface AipDates {
  /** The amendment's effective date, YYYY-MM-DD. */
  effective: string;
  /** The AIRAC cycle the data was checked against, YYYY-MM-DD. */
  checked: string;
}

const DAY_MS = 86_400_000;
export const AIRAC_CYCLE_DAYS = 28;

const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Whether the cycle it was checked against is over. */
export const aipOutOfDate = (d: AipDates, now = Date.now()) => now >= utc(d.checked) + AIRAC_CYCLE_DAYS * DAY_MS;

/** "AIRAC 26 Nov 2026": the amendment the data is from. */
export const airacText = (d: AipDates) =>
  `AIRAC ${new Date(utc(d.effective)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
