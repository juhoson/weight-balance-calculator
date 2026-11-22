// Anonymous usage statistics via Umami Cloud (cookieless: no consent banner needed).
// Page views, country, device and referrer are recorded by Umami's script; track() adds the few
// in-app actions worth counting. Nothing personal is sent: no names, emails or registrations.
//
// Off unless REACT_APP_UMAMI_WEBSITE_ID is set at build time, and Umami itself only counts visits
// on the production domain (data-domains), so local development never shows up in the stats.

const WEBSITE_ID = process.env.REACT_APP_UMAMI_WEBSITE_ID;
const SCRIPT_URL = 'https://cloud.umami.is/script.js';
const DOMAINS = 'www.flightplanningtool.com';

type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventData) => void };
  }
}

/** Adds Umami's script to the page, once. Call at startup. */
export function initAnalytics(): void {
  if (!WEBSITE_ID || document.querySelector(`script[src="${SCRIPT_URL}"]`)) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = SCRIPT_URL;
  script.dataset.websiteId = WEBSITE_ID;
  script.dataset.domains = DOMAINS;
  document.head.appendChild(script);
}

/** Counts an in-app action. A blocked or not-yet-loaded script just means it isn't counted. */
export function track(event: string, data?: EventData): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // Statistics must never break the planner.
  }
}
