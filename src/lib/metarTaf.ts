// Plain-language decoding of raw METAR and TAF text (ICAO format, with the common US variants).
// Anything not recognised is listed in `unparsed` so nothing is silently dropped.
import type { FlightCategory } from '../types/route';

export interface CloudLayer {
  cover: 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'VV';
  /** Feet above the station; null when not reported (///). */
  baseFt: number | null;
  type: 'CB' | 'TCU' | null;
}

/** Weather elements in one report or forecast group. Undefined = not stated. */
export interface Conditions {
  wind?: string;
  /** Metres; 10000 = 10 km or more. */
  visibilityM?: number;
  visibility?: string;
  /** Plain-language present weather; [] = none (NSW, CAVOK). */
  weather?: string[];
  /** [] = no significant cloud. */
  clouds?: CloudLayer[];
  cavok?: boolean;
}

export interface DecodedMetar extends Conditions {
  auto: boolean;
  corrected: boolean;
  rvr: string[];
  recent: string[];
  windShear: string[];
  tempC?: number;
  dewpointC?: number;
  qnh?: string;
  trend: string[];
  unparsed: string[];
}

export type TafPeriodKind = 'BASE' | 'FM' | 'BECMG' | 'TEMPO' | 'PROB';

export interface TafPeriod {
  kind: TafPeriodKind;
  /** 'From', 'Becoming', 'Temporarily', '30% chance', '40% chance, temporarily'. */
  label: string;
  from: Date | null;
  to: Date | null;
  /** What this group states. */
  changes: Conditions;
  /** Conditions in effect during the group: the prevailing ones with this group's changes applied. */
  effective: Conditions;
  category: FlightCategory | null;
  extras: string[];
}

export interface DecodedTaf {
  amended: boolean;
  corrected: boolean;
  cancelled: boolean;
  issued: Date | null;
  validFrom: Date | null;
  validTo: Date | null;
  periods: TafPeriod[];
  unparsed: string[];
}

// ---- Elements --------------------------------------------------------------

const INTENSITY: Record<string, string> = { '-': 'light', '+': 'heavy' };
const DESCRIPTOR: Record<string, string> = {
  MI: 'shallow', PR: 'partial', BC: 'patches of', DR: 'low drifting', BL: 'blowing', SH: 'showers', TS: 'thunderstorm', FZ: 'freezing',
};
const PHENOMENON: Record<string, string> = {
  DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains', IC: 'ice crystals', PL: 'ice pellets', GR: 'hail', GS: 'small hail',
  UP: 'unknown precipitation', BR: 'mist', FG: 'fog', FU: 'smoke', VA: 'volcanic ash', DU: 'dust', SA: 'sand', HZ: 'haze',
  PY: 'spray', PO: 'dust whirls', SQ: 'squalls', FC: 'funnel cloud', SS: 'sandstorm', DS: 'duststorm',
};
const WEATHER_RE = /^(RE)?([-+]|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const thousands = (n: number) => n.toLocaleString('en-US');

/** "-SHRA" → "light rain showers"; null when the token is not a weather group. */
export function decodeWeather(token: string): { text: string; recent: boolean } | null {
  const m = WEATHER_RE.exec(token);
  if (!m || (!m[3] && !m[4]) || token === 'RE') return null;
  const [, re, intensity, descriptor, phen] = m;
  const phenomena = (phen.match(/../g) ?? []).map(p => PHENOMENON[p]);
  let text: string;
  if (intensity === '+' && phen === 'FC') text = 'tornado or waterspout';
  else if (descriptor === 'TS') text = `thunderstorm${phenomena.length ? ` with ${listAnd(phenomena)}` : ''}`;
  else if (descriptor === 'SH') text = `${phenomena.length ? listAnd(phenomena) : 'precipitation'} showers`;
  else text = [descriptor ? DESCRIPTOR[descriptor] : '', listAnd(phenomena)].filter(Boolean).join(' ');
  if (intensity && INTENSITY[intensity] && phen !== 'FC') text = `${INTENSITY[intensity]} ${text}`;
  if (intensity === 'VC') text = `${text} in the vicinity`;
  return { text: capitalise(text), recent: re !== undefined };
}

const WIND_RE = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/;
const toKt = (v: number, unit: string) => Math.round(unit === 'MPS' ? v * 1.944 : unit === 'KMH' ? v / 1.852 : v);

function decodeWind(token: string): string | null {
  const m = WIND_RE.exec(token);
  if (!m) return null;
  const speed = toKt(Number(m[2]), m[4]);
  const gust = m[3] ? toKt(Number(m[3]), m[4]) : null;
  if (m[1] !== 'VRB' && Number(m[1]) === 0 && speed === 0) return 'Calm';
  const from = m[1] === 'VRB' ? 'Variable' : `From ${m[1]}°`;
  return `${from} at ${speed} kt${gust ? `, gusts ${gust} kt` : ''}`;
}

function visibilityText(m: number): string {
  if (m >= 10000) return '10 km or more';
  if (m < 50) return 'Less than 50 m';
  return m >= 5000 ? `${Math.round(m / 1000)} km` : `${thousands(m)} m`;
}

/** Statute miles → metres, "P6SM" → more than 6 SM. */
function decodeStatuteMiles(token: string): { m: number; text: string } | null {
  const sm = /^([PM])?(\d+(?:\/\d+)?|\d+ \d\/\d)SM$/.exec(token);
  if (!sm) return null;
  const value = sm[2].split(' ').reduce((sum, part) => {
    const [a, b] = part.split('/').map(Number);
    return sum + (b ? a / b : a);
  }, 0);
  const prefix = sm[1] === 'P' ? 'More than ' : sm[1] === 'M' ? 'Less than ' : '';
  const m = Math.round(value * 1609);
  return { m: sm[1] === 'P' && value >= 6 ? 10000 : m, text: `${prefix}${sm[2]} SM` };
}

const COVER_TEXT: Record<CloudLayer['cover'], string> = { FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', VV: 'Sky obscured' };

export function cloudText(c: CloudLayer): string {
  const height = c.baseFt === null ? 'height unknown' : `${thousands(c.baseFt)} ft`;
  if (c.cover === 'VV') return `Sky obscured, vertical visibility ${height}`;
  const type = c.type === 'CB' ? ' cumulonimbus' : c.type === 'TCU' ? ' towering cumulus' : '';
  return `${COVER_TEXT[c.cover]}${type} at ${height}`;
}

/** Lowest broken, overcast or obscured layer. */
export function ceilingFt(clouds: CloudLayer[] | undefined): number | null {
  const bases = (clouds ?? []).filter(c => c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'VV').map(c => c.baseFt ?? 0);
  return bases.length ? Math.min(...bases) : null;
}

/** US rules, as aviationweather.gov uses for the METAR category. */
export function flightCategory(c: Conditions): FlightCategory | null {
  if (c.visibilityM === undefined && c.clouds === undefined) return null;
  const vis = c.visibilityM ?? 10000;
  const ceil = ceilingFt(c.clouds) ?? Infinity;
  if (ceil < 500 || vis < 1609) return 'LIFR';
  if (ceil < 1000 || vis < 4828) return 'IFR';
  if (ceil <= 3000 || vis <= 8047) return 'MVFR';
  return 'VFR';
}

/** Try one token (or two, for "1 1/2SM") as a condition element. Returns tokens consumed, 0 if not one. */
function readCondition(tokens: string[], i: number, c: Conditions): number {
  const t = tokens[i];
  const wind = decodeWind(t);
  if (wind) { c.wind = wind; return 1; }
  const varying = /^(\d{3})V(\d{3})$/.exec(t);
  if (varying && c.wind) { c.wind += `, varying ${varying[1]}°–${varying[2]}°`; return 1; }
  if (t === 'CAVOK') {
    Object.assign(c, { cavok: true, visibilityM: 10000, visibility: '10 km or more', weather: [], clouds: [] });
    return 1;
  }
  const vis = /^(\d{4})(N|NE|E|SE|S|SW|W|NW|NDV)?$/.exec(t);
  if (vis) {
    const m = Number(vis[1]) === 9999 ? 10000 : Number(vis[1]);
    if (c.visibilityM === undefined) {
      c.visibilityM = m;
      c.visibility = visibilityText(m);
    } else {
      c.visibility += `, lowest ${visibilityText(m)}${vis[2] && vis[2] !== 'NDV' ? ` to the ${vis[2]}` : ''}`;
    }
    return 1;
  }
  const twoPart = /^\d$/.test(t) && tokens[i + 1] && /^\d\/\dSM$/.test(tokens[i + 1]) ? decodeStatuteMiles(`${t} ${tokens[i + 1]}`) : null;
  const sm = twoPart ?? decodeStatuteMiles(t);
  if (sm) { c.visibilityM = sm.m; c.visibility = sm.text; return twoPart ? 2 : 1; }
  if (t === 'NSW') { c.weather = []; return 1; }
  if (['NSC', 'NCD', 'SKC', 'CLR'].includes(t)) { c.clouds = []; return 1; }
  const cloud = /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/.exec(t);
  if (cloud) {
    c.clouds = [...(c.clouds ?? []), {
      cover: cloud[1] as CloudLayer['cover'],
      baseFt: cloud[2] === '///' ? null : Number(cloud[2]) * 100,
      type: cloud[3] === 'CB' || cloud[3] === 'TCU' ? cloud[3] : null,
    }];
    return 1;
  }
  const wx = decodeWeather(t);
  if (wx && !wx.recent) { c.weather = [...(c.weather ?? []), wx.text]; return 1; }
  return 0;
}

/** "Wind from 250° at 12 kt · 10 km or more · Broken at 2,000 ft". */
export function summarise(c: Conditions): string[] {
  const parts: string[] = [];
  if (c.wind) parts.push(c.wind === 'Calm' ? 'Wind calm' : `Wind ${c.wind.charAt(0).toLowerCase()}${c.wind.slice(1)}`);
  if (c.cavok) {
    parts.push('CAVOK: visibility 10 km or more, no cloud below 5,000 ft, no significant weather');
    return parts;
  }
  if (c.visibility) parts.push(`Visibility ${c.visibility.charAt(0).toLowerCase()}${c.visibility.slice(1)}`);
  if (c.weather) parts.push(c.weather.length ? c.weather.join(', ') : 'No significant weather');
  if (c.clouds) parts.push(c.clouds.length ? c.clouds.map(cloudText).join(', ') : 'No significant cloud');
  return parts;
}

// ---- METAR -----------------------------------------------------------------

function decodeRvr(token: string): string | null {
  const m = /^R(\d{2}[LCR]?)\/([PM])?(\d{4})(?:V([PM])?(\d{4}))?(FT)?\/?([UDN])?$/.exec(token);
  if (!m) return null;
  const unit = m[6] ? ' ft' : ' m';
  const bound = (p: string | undefined, v: string) => `${p === 'P' ? 'more than ' : p === 'M' ? 'less than ' : ''}${Number(v)}${unit}`;
  const range = m[5] ? `${bound(m[2], m[3])} to ${bound(m[4], m[5])}` : bound(m[2], m[3]);
  const tendency = m[7] === 'U' ? ', improving' : m[7] === 'D' ? ', worsening' : m[7] === 'N' ? ', steady' : '';
  return `Runway ${m[1]}: ${range}${tendency}`;
}

const TREND_TIME: Record<string, string> = { FM: 'from', TL: 'until', AT: 'at' };

export function decodeMetar(raw: string): DecodedMetar {
  const tokens = raw.trim().split(/\s+/);
  const d: DecodedMetar = { auto: false, corrected: false, rvr: [], recent: [], windShear: [], trend: [], unparsed: [] };
  let i = 0;
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') i++;
  if (tokens[i] === 'COR') { d.corrected = true; i++; }
  if (/^[A-Z][A-Z0-9]{3}$/.test(tokens[i] ?? '')) i++;
  if (/^\d{6}Z$/.test(tokens[i] ?? '')) i++;

  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'RMK') break;
    if (t === 'NOSIG') { d.trend.push('No significant change expected in the next 2 hours'); i++; continue; }
    if (t === 'BECMG' || t === 'TEMPO') {
      const c: Conditions = {};
      const times: string[] = [];
      let j = i + 1;
      while (j < tokens.length && !['RMK', 'BECMG', 'TEMPO', 'NOSIG'].includes(tokens[j])) {
        const tm = /^(FM|TL|AT)(\d{2})(\d{2})$/.exec(tokens[j]);
        if (tm) { times.push(`${TREND_TIME[tm[1]]} ${tm[2]}:${tm[3]} UTC`); j++; continue; }
        const used = readCondition(tokens, j, c);
        if (!used) { d.unparsed.push(tokens[j]); j++; } else j += used;
      }
      const when = times.length ? ` ${times.join(' ')}` : ' within 2 hours';
      d.trend.push(`${t === 'BECMG' ? 'Becoming' : 'Temporarily'}${when}: ${summarise(c).join(' · ') || 'see raw report'}`);
      i = j;
      continue;
    }
    if (t === 'AUTO') { d.auto = true; i++; continue; }
    if (t === 'COR') { d.corrected = true; i++; continue; }
    const rvr = decodeRvr(t);
    if (rvr) { d.rvr.push(rvr); i++; continue; }
    const temp = /^(M?\d{2})\/(M?\d{2})?$/.exec(t);
    if (temp) {
      const n = (s: string) => Number(s.replace('M', '-'));
      d.tempC = n(temp[1]);
      if (temp[2]) d.dewpointC = n(temp[2]);
      i++; continue;
    }
    const q = /^([QA])(\d{4})$/.exec(t);
    if (q) {
      d.qnh = q[1] === 'Q' ? `${Number(q[2])} hPa` : `${(Number(q[2]) / 100).toFixed(2)} inHg (${Math.round(Number(q[2]) / 100 * 33.8639)} hPa)`;
      i++; continue;
    }
    if (t === 'WS') {
      if (tokens[i + 1] === 'ALL' && tokens[i + 2] === 'RWY') { d.windShear.push('Wind shear on all runways'); i += 3; continue; }
      const r = /^R(?:WY)?(\d{2}[LCR]?)$/.exec(tokens[i + 1] ?? '');
      if (r) { d.windShear.push(`Wind shear on runway ${r[1]}`); i += 2; continue; }
    }
    const wx = decodeWeather(t);
    if (wx?.recent) { d.recent.push(wx.text); i++; continue; }
    if (/^(RE)?\/+(KT)?$/.test(t)) { i++; continue; } // element not reported (automatic station)
    // Runway state (R27/290050, 88290050) and sea state (W15/S3): not useful here.
    if (/^R\d{2}[LCR]?\/[0-9/]{6}$/.test(t) || /^R\d{2}[LCR]?\/CLRD/.test(t) || /^\d{8}$/.test(t) || /^W[M\d]{2}\/[SH]/.test(t)) { i++; continue; }
    const used = readCondition(tokens, i, d);
    if (used) { i += used; continue; }
    d.unparsed.push(t);
    i++;
  }
  return d;
}

// ---- TAF -------------------------------------------------------------------

/** Day-of-month and hour → the nearest such moment to `ref` (handles month ends and hour 24). */
export function resolveDayHour(day: number, hour: number, minute: number, ref: Date): Date {
  let best: Date | null = null;
  for (const offset of [-1, 0, 1]) {
    const midnight = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + offset, day));
    if (midnight.getUTCDate() !== day) continue; // e.g. the 31st in a 30-day month
    const d = new Date(midnight.getTime() + (hour * 60 + minute) * 60000);
    if (!best || Math.abs(d.getTime() - ref.getTime()) < Math.abs(best.getTime() - ref.getTime())) best = d;
  }
  return best ?? new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), day, hour, minute));
}

function range(token: string, ref: Date): { from: Date; to: Date } | null {
  const m = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(token);
  if (!m) return null;
  const from = resolveDayHour(Number(m[1]), Number(m[2]), 0, ref);
  return { from, to: resolveDayHour(Number(m[3]), Number(m[4]), 0, from) };
}

const merge = (base: Conditions, change: Conditions): Conditions => {
  const out: Conditions = { ...base, ...Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)) };
  if (!change.cavok && (change.visibilityM !== undefined || change.clouds !== undefined || change.weather !== undefined)) out.cavok = false;
  return out;
};

function tempGroup(t: string, ref: Date): string | null {
  const m = /^T([XN])(M?\d{2})\/(\d{2})(\d{2})Z$/.exec(t);
  if (!m) return null;
  const at = resolveDayHour(Number(m[3]), Number(m[4]), 0, ref);
  return `${m[1] === 'X' ? 'High' : 'Low'} of ${Number(m[2].replace('M', '-'))} °C ${formatUtc(at)}`;
}

export function decodeTaf(raw: string, issuedAt: string | null = null, now: Date = new Date()): DecodedTaf {
  const tokens = raw.trim().split(/\s+/);
  const d: DecodedTaf = { amended: false, corrected: false, cancelled: false, issued: issuedAt ? new Date(issuedAt) : null, validFrom: null, validTo: null, periods: [], unparsed: [] };
  let ref = issuedAt ? new Date(issuedAt) : now;
  let i = 0;
  if (tokens[i] === 'TAF') i++;
  while (tokens[i] === 'AMD' || tokens[i] === 'COR') {
    if (tokens[i] === 'AMD') d.amended = true; else d.corrected = true;
    i++;
  }
  if (/^[A-Z][A-Z0-9]{3}$/.test(tokens[i] ?? '')) i++;
  const issue = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] ?? '');
  if (issue) {
    if (!issuedAt) {
      ref = resolveDayHour(Number(issue[1]), Number(issue[2]), Number(issue[3]), now);
      d.issued = ref;
    }
    i++;
  }
  const validity = range(tokens[i] ?? '', ref);
  if (validity) { d.validFrom = validity.from; d.validTo = validity.to; i++; }

  let prevailing: Conditions = {};
  let current: TafPeriod = { kind: 'BASE', label: 'Initially', from: d.validFrom, to: d.validTo, changes: {}, effective: {}, category: null, extras: [] };
  const finish = () => {
    const replaces = current.kind === 'BASE' || current.kind === 'FM';
    current.effective = replaces ? current.changes : merge(prevailing, current.changes);
    current.category = flightCategory(current.effective);
    if (replaces || current.kind === 'BECMG') prevailing = current.effective;
    const empty = Object.keys(current.changes).length === 0 && current.extras.length === 0;
    if (!(current.kind === 'BASE' && empty)) d.periods.push(current);
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'CNL') { d.cancelled = true; i++; continue; }
    if (t === 'NIL' || t === 'RMK') break;
    const fm = /^FM(\d{2})(\d{2})(\d{2})$/.exec(t);
    const prob = /^PROB(30|40)$/.exec(t);
    if (fm || t === 'BECMG' || t === 'TEMPO' || prob) {
      finish();
      let kind: TafPeriodKind;
      let label: string;
      let from: Date | null = null;
      let to: Date | null = null;
      if (fm) {
        kind = 'FM';
        label = 'From';
        from = resolveDayHour(Number(fm[1]), Number(fm[2]), Number(fm[3]), ref);
        to = d.validTo;
        i++;
      } else {
        kind = prob ? 'PROB' : (t as 'BECMG' | 'TEMPO');
        label = t === 'BECMG' ? 'Becoming' : t === 'TEMPO' ? 'Temporarily' : `${prob?.[1]}% chance`;
        i++;
        if (prob && tokens[i] === 'TEMPO') { label += ', temporarily'; i++; }
        const r = range(tokens[i] ?? '', ref);
        if (r) { from = r.from; to = r.to; i++; }
      }
      // A FM group ends the previous FM / base period.
      if (fm) {
        for (let k = d.periods.length - 1; k >= 0; k--) {
          if (d.periods[k].kind === 'FM' || d.periods[k].kind === 'BASE') { d.periods[k].to = from; break; }
        }
      }
      current = { kind, label, from, to, changes: {}, effective: {}, category: null, extras: [] };
      continue;
    }
    const tg = tempGroup(t, ref);
    if (tg) { current.extras.push(tg); i++; continue; }
    const ws = /^WS(\d{3})\/(\d{3})(\d{2,3})KT$/.exec(t);
    if (ws) { current.extras.push(`Low-level wind shear at ${thousands(Number(ws[1]) * 100)} ft: ${ws[2]}° at ${Number(ws[3])} kt`); i++; continue; }
    const used = readCondition(tokens, i, current.changes);
    if (used) { i += used; continue; }
    d.unparsed.push(t);
    i++;
  }
  finish();
  return d;
}

export type TafState = 'active' | 'upcoming' | 'expired' | 'cancelled' | 'unknown';

/** Whether the forecast is in force at `now`, e.g. { state: 'upcoming', label: 'Not yet valid', detail: 'starts Fri 18Z' }. */
export function tafStatus(d: DecodedTaf, now: number): { state: TafState; label: string; detail: string } {
  if (d.cancelled) return { state: 'cancelled', label: 'Cancelled', detail: 'this forecast was cancelled' };
  if (!d.validFrom || !d.validTo) return { state: 'unknown', label: 'Validity unknown', detail: '' };
  if (now >= d.validTo.getTime()) return { state: 'expired', label: 'Expired', detail: `ran out ${formatUtc(d.validTo)}` };
  if (now < d.validFrom.getTime()) return { state: 'upcoming', label: 'Not yet valid', detail: `starts ${formatUtc(d.validFrom)}` };
  return { state: 'active', label: 'Active', detail: `valid until ${formatUtc(d.validTo)}` };
}

/** The period covers `now`. */
export const periodIsNow = (p: TafPeriod, now: number) =>
  !!p.from && p.from.getTime() <= now && (!p.to || now < p.to.getTime());

// ---- Formatting ------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}${d.getUTCMinutes() ? `:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''}Z`;

/** "Thu 14Z". */
export function formatUtc(d: Date): string {
  return `${DAYS[d.getUTCDay()]} ${hhmm(d)}`;
}

/** "Thu 12–18Z", "Thu 22Z – Fri 06Z". */
export function formatUtcRange(from: Date | null, to: Date | null): string {
  if (!from) return '';
  if (!to) return `from ${formatUtc(from)}`;
  const day = `${DAYS[from.getUTCDay()]} ${hhmm(from).replace('Z', '')}`;
  const endsAtMidnight = to.getUTCHours() === 0 && to.getUTCMinutes() === 0 && to.getTime() - from.getTime() <= 24 * 3600000;
  if (endsAtMidnight && new Date(to.getTime() - 1).getUTCDate() === from.getUTCDate()) return `${day}–24Z`;
  return from.getUTCDate() === to.getUTCDate() ? `${day}–${hhmm(to)}` : `${formatUtc(from)} – ${formatUtc(to)}`;
}
