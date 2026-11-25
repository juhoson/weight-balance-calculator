import type { AirspaceView, Frequency, PointInfo } from '../types/route';
import { swedenControlAdvice, swedenControlAt } from './swedenControl';

const KIND_LABEL: Record<Frequency['kind'], string> = {
  TWR: 'Tower', APP: 'Approach', AFIS: 'AFIS', INFO: 'Information', RADIO: 'Radio', ATIS: 'ATIS', GND: 'Ground',
  FIS: 'FIS', CTAF: 'CTAF', DEL: 'Delivery', CENTER: 'Control', GLIDING: 'Gliding', OTHER: '',
};

/** "130.605 VÄSTERÅS TOWER", or "123.650 Radio" when it has no name. */
export function frequencyText(f: Frequency): string {
  const name = f.name?.trim() || KIND_LABEL[f.kind];
  return name ? `${f.value} ${name}` : f.value;
}

const KIND_ORDER: Frequency['kind'][] = ['TWR', 'AFIS', 'INFO', 'APP', 'CENTER', 'FIS', 'GND', 'RADIO', 'CTAF', 'GLIDING', 'OTHER'];

/** The ones to call (not ATIS or delivery): tower, AFIS, approach, ground, radio, the primary first within each. */
export function contactFrequencies(list: Frequency[] | null | undefined): Frequency[] {
  const rank = (f: Frequency) => { const i = KIND_ORDER.indexOf(f.kind); return i < 0 ? KIND_ORDER.length : i; };
  return (list ?? [])
    .filter(f => !['ATIS', 'DEL'].includes(f.kind))
    .sort((a, b) => rank(a) - rank(b) || Number(b.primary) - Number(a.primary));
}

/** Whether an altitude (ft above sea level) is inside an airspace's limits; AGL limits taken over sea-level ground. */
export function containsAltitude(a: AirspaceView, ft: number): boolean {
  const floor = a.lower.datum === 'GND' && a.lower.ft === 0 ? -Infinity : a.lower.ft;
  return ft >= floor && ft <= a.upper.ft;
}

/**
 * The lowest floor when nothing reaches the ground here, e.g. "FL95" under a high control area:
 * the air below it is uncontrolled. Null when some airspace starts at the ground.
 */
export function uncontrolledBelow(airspaces: AirspaceView[]): string | null {
  if (airspaces.length === 0) return null;
  if (airspaces.some(a => a.lower.datum === 'GND' && a.lower.ft === 0)) return null;
  const lowest = airspaces.reduce((lo, a) => (a.lower.ft < lo.lower.ft ? a : lo));
  return lowest.lower.label;
}

/**
 * Who to call outside controlled airspace. In Sweden that's Sweden Control (flight information
 * and flight following), on the frequency of the sector the point is in.
 */
export function classGHint(info: PointInfo): string {
  const here = swedenControlAt(info.lat, info.lon);
  if (here) return swedenControlAdvice(here);
  const swedish = info.airports.length > 0 && info.airports.every(a => a.code.startsWith('ES'))
    || info.airspaces.some(a => /SUECIA|SWEDEN/i.test(a.name));
  return swedish
    ? 'Call Sweden Control for flight information or flight following; the frequency for your sector is on the chart.'
    : 'Call the flight information service (FIS); its frequency is on the chart.';
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));

/** A map popup's HTML: the airspaces at the point, lowest first, then the nearest airports. */
export function pointInfoHtml(info: PointInfo): string {
  const rows = info.airspaces
    .filter(a => a.lower.ft < 19500 || a.lower.datum === 'GND')
    .map(a => {
      const freqs = contactFrequencies(a.frequencies);
      const cls = a.icaoClass ? ` · class ${a.icaoClass}` : '';
      return `<div class="pi-row"><div><strong>${esc(a.name)}</strong></div>`
        + `<div class="pi-sub">${esc(a.lower.label)} – ${esc(a.upper.label)}${cls}</div>`
        + (freqs.length
          ? freqs.map(f => `<div class="pi-freq">${esc(frequencyText(f))}${f.source ? ` <span class="pi-sub">(from ${esc(f.source)})</span>` : ''}</div>`).join('')
          : '<div class="pi-sub">No frequency listed</div>')
        + '</div>';
    });
  const airports = info.airports.slice(0, 3).map(ap => {
    const freqs = contactFrequencies(ap.frequencies).slice(0, 2);
    return `<div class="pi-sub">${esc(ap.code)} ${ap.distanceNm.toFixed(0)} NM: ${freqs.map(f => esc(frequencyText(f))).join(', ') || '–'}</div>`;
  });
  const below = uncontrolledBelow(info.airspaces);
  return '<div class="point-info">'
    + (rows.length ? rows.join('') : `<div class="pi-sub">No airspace listed here: uncontrolled (class G). ${esc(classGHint(info))}</div>`)
    + (below ? `<div class="pi-sub">Below ${esc(below)}: no airspace listed, uncontrolled (class G). ${esc(classGHint(info))}</div>` : '')
    + (airports.length ? `<div class="pi-head">Nearest airports</div>${airports.join('')}` : '')
    + `<div class="pi-note">openAIP${swedenControlAt(info.lat, info.lon) ? ' · Sweden Control sectors from the AIP (ENR 6.1)' : ''} · check the AIP and NOTAMs</div></div>`;
}
