// A club's own link to the calculator, e.g. https://songer.se/weight-balance/?club=vfk: the page then
// lists just that club's aircraft and plans from its airfield.

export const CLUB_PARAM = 'club';

/** The club code in the address, lower case; null without one. */
export function clubFromUrl(search: string = window.location.search): string | null {
  const code = new URLSearchParams(search).get(CLUB_PARAM)?.trim().toLowerCase();
  return code ? code : null;
}

/** The current address without the club filter, for "Show all aircraft". */
export function urlWithoutClub(href: string = window.location.href): string {
  const url = new URL(href);
  url.searchParams.delete(CLUB_PARAM);
  return url.pathname + url.search + url.hash;
}
