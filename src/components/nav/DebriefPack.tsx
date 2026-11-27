import React from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, Share2, X } from 'lucide-react';
import type { TrackPoint } from '../../api/backend';
import { type BlockTimes, hhmm, localTime, utcTime } from '../../lib/blockTimes';
import { distanceNm } from '../../lib/openMeteo';
import { flightKml, kmlFileName } from '../../lib/kml';
import { isNative } from '../../lib/native';
import { saveFile, standaloneHtml } from '../../lib/share';

export interface PlannedPoint { lat: number; lon: number; code?: string }

export interface FlightFacts {
  flownNm: number;
  plannedNm: number | null;
  maxAltFt: number | null;
  maxKt: number | null;
  /** Between takeoff and landing. */
  airborneAvgKt: number | null;
}

const ms = (t: string | null | undefined) => (t ? new Date(t).getTime() : null);

/** The numbers worth looking back at: how far, how high, how fast. */
export function flightFacts(points: TrackPoint[], times: BlockTimes, planned: PlannedPoint[]): FlightFacts {
  let flown = 0, maxKt: number | null = null, air = 0;
  const to = ms(times.takeoff), ldg = ms(times.landing);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const nm = distanceNm(a.lat, a.lon, b.lat, b.lon);
    flown += nm;
    const h = (b.at - a.at) / 3_600_000;
    // Over a few seconds at least: the GPS's jitter between close fixes isn't a speed.
    if (h > 3 / 3600) maxKt = Math.max(maxKt ?? 0, nm / h);
    if (to != null && ldg != null && a.at >= to && b.at <= ldg) air += nm;
  }
  const alts = points.map(p => p.altFt).filter((a): a is number => a != null);
  const airH = to != null && ldg != null && ldg > to ? (ldg - to) / 3_600_000 : 0;
  let plannedNm: number | null = null;
  if (planned.length > 1) {
    plannedNm = 0;
    for (let i = 1; i < planned.length; i++) plannedNm += distanceNm(planned[i - 1].lat, planned[i - 1].lon, planned[i].lat, planned[i].lon);
  }
  return {
    flownNm: flown, plannedNm, maxAltFt: alts.length ? Math.max(...alts) : null, maxKt: maxKt == null ? null : Math.round(maxKt),
    airborneAvgKt: airH > 0.05 && air > 0 ? Math.round(air / airH) : null,
  };
}

const nm1 = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));
const ft = (n: number) => Math.round(n).toLocaleString('en');

/** The logged times as a logbook would have them, with the block and flight time. */
export const TimesTable: React.FC<{ times: BlockTimes; dark?: boolean }> = ({ times, dark }) => {
  const rows: Array<[string, string | null]> = [
    ['Off block', times.offBlock], ['Takeoff', times.takeoff],
    [`Landing${(times.landings ?? 0) > 1 ? ` (last of ${times.landings})` : ''}`, times.landing], ['On block', times.onBlock],
  ];
  const muted = dark ? 'text-slate-400' : 'text-neutral-500';
  return (
    <table className="w-full text-sm tabular-nums">
      <tbody>
        {rows.map(([label, t]) => (
          <tr key={label}>
            <td className="py-0.5 pr-3">{label}</td>
            <td className="py-0.5 pr-3 text-right font-semibold">{utcTime(t)}</td>
            <td className={`py-0.5 text-right ${muted}`}>{t ? `${localTime(t)} local` : 'not recorded'}</td>
          </tr>
        ))}
        <tr className={dark ? 'border-t border-slate-700' : 'border-t border-neutral-300'}>
          <td className="pt-1 pr-3">Block time</td>
          <td className="pt-1 pr-3 text-right font-semibold">{hhmm(times.offBlock, times.onBlock) ?? '–'}</td>
          <td className={`pt-1 text-right ${muted}`}>off block to on block</td>
        </tr>
        <tr>
          <td className="py-0.5 pr-3">Flight time</td>
          <td className="py-0.5 pr-3 text-right font-semibold">{hhmm(times.takeoff, times.landing) ?? '–'}</td>
          <td className={`py-0.5 text-right ${muted}`}>takeoff to landing{times.landings != null ? ` · ${times.landings} landing${times.landings === 1 ? '' : 's'}` : ''}</td>
        </tr>
      </tbody>
    </table>
  );
};

/** The flown track over the planned route, drawn plain (prints, and needs no map tiles or connection). */
const TrackMap: React.FC<{ points: TrackPoint[]; planned: PlannedPoint[]; times: BlockTimes }> = ({ points, planned, times }) => {
  const W = 680, H = 380, PAD = 44;
  const all = [...points, ...planned];
  if (all.length < 2) return null;
  const lat0 = all.reduce((s, p) => s + p.lat, 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map(p => p.lon * k), ys = all.map(p => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-6), (H - 2 * PAD) / Math.max(y1 - y0, 1e-6));
  const ox = (W - (x1 - x0) * scale) / 2, oy = (H - (y1 - y0) * scale) / 2;
  const px = (p: { lat: number; lon: number }) => [ox + (p.lon * k - x0) * scale, H - (oy + (p.lat - y0) * scale)] as const;
  const path = (ps: Array<{ lat: number; lon: number }>) => ps.map((p, i) => `${i ? 'L' : 'M'}${px(p)[0].toFixed(1)},${px(p)[1].toFixed(1)}`).join('');
  const at = (t: string | null) => {
    if (!t || !points.length) return null;
    const ms0 = new Date(t).getTime();
    return points.reduce((b, p) => (Math.abs(p.at - ms0) < Math.abs(b.at - ms0) ? p : b), points[0]);
  };
  const marks = ([['T/O', times.takeoff], ['LDG', times.landing]] as const).map(([l, t]) => ({ l, p: at(t) })).filter(m => m.p);
  // A scale bar: the round NM nearest a fifth of the width.
  // scale is px per degree of latitude, which is 60 NM.
  const nmPerPx = 60 / scale;
  const barNm = [0.5, 1, 2, 5, 10, 20, 50, 100].find(n => n / nmPerPx > W / 6) ?? 100;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-neutral-300" role="img" aria-label="The flown track over the planned route">
      {planned.length > 1 && <path d={path(planned)} fill="none" stroke="#64748b" strokeWidth={2} strokeDasharray="6 5"/>}
      {planned.map((p, i) => (
        <g key={i}>
          <circle cx={px(p)[0]} cy={px(p)[1]} r={3.5} fill="#fff" stroke="#64748b" strokeWidth={1.5}/>
          {p.code && (
            <text x={px(p)[0] + (px(p)[0] > W / 2 ? -6 : 6)} y={px(p)[1] - 6} textAnchor={px(p)[0] > W / 2 ? 'end' : 'start'}
              fontSize={11} fill="#334155" fontWeight={600}>{p.code}</text>
          )}
        </g>
      ))}
      {points.length > 1 && <path d={path(points)} fill="none" stroke="#c026d3" strokeWidth={2.5} strokeLinejoin="round"/>}
      {marks.map(({ l, p }) => p && (
        <g key={l}>
          <circle cx={px(p)[0]} cy={px(p)[1]} r={4} fill="#c026d3"/>
          <text x={px(p)[0] + (px(p)[0] > W / 2 ? -6 : 6)} y={px(p)[1] + 14} textAnchor={px(p)[0] > W / 2 ? 'end' : 'start'}
            fontSize={10} fill="#86198f" fontWeight={700}>{l}</text>
        </g>
      ))}
      <g transform={`translate(${PAD},${H - 12})`}>
        <line x1={0} x2={barNm / nmPerPx} y1={0} y2={0} stroke="#334155" strokeWidth={2}/>
        <text x={0} y={-4} fontSize={10} fill="#334155">{barNm} NM</text>
      </g>
      <text x={W - PAD} y={PAD - 6} fontSize={11} textAnchor="end" fill="#334155">N ↑</text>
    </svg>
  );
};

/** GPS altitude through the flight, with the takeoff and landing marked. */
const AltitudeChart: React.FC<{ points: TrackPoint[]; times: BlockTimes }> = ({ points, times }) => {
  const W = 680, H = 170, L = 44, R = 10, T = 10, B = 22;
  const pts = points.filter(p => p.altFt != null);
  if (pts.length < 2) return null;
  const t0 = pts[0].at, t1 = pts[pts.length - 1].at;
  const top = Math.max(1000, Math.ceil((Math.max(...pts.map(p => p.altFt as number)) + 200) / 1000) * 1000);
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (a: number) => T + (1 - Math.max(0, a) / top) * (H - T - B);
  const step = top / 1000 > 6 ? 2000 : 1000;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const mark = (t: string | null, label: string) => {
    if (!t) return null;
    const tx = x(new Date(t).getTime());
    if (tx < L || tx > W - R) return null;
    return (
      <g key={label}>
        <line x1={tx} x2={tx} y1={T} y2={H - B} stroke="#c026d3" strokeDasharray="3 3"/>
        <text x={tx + 3} y={T + 10} fontSize={10} fill="#86198f" fontWeight={700}>{label} {utcTime(t)}</text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GPS altitude through the flight">
      {ticks.map(a => (
        <g key={a}>
          <line x1={L} x2={W - R} y1={y(a)} y2={y(a)} stroke="#e5e7eb"/>
          <text x={L - 6} y={y(a)} dy="0.32em" textAnchor="end" fontSize={10} fill="#6b7280">{a === 0 ? '0' : `${a / 1000}k`}</text>
        </g>
      ))}
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.altFt as number).toFixed(1)}`).join('')} fill="none" stroke="#2563eb" strokeWidth={2}/>
      {mark(times.takeoff, 'T/O')}
      {mark(times.landing, 'LDG')}
      <text x={L} y={H - 6} fontSize={10} fill="#6b7280">{utcTime(t0)}</text>
      <text x={W - R} y={H - 6} fontSize={10} fill="#6b7280" textAnchor="end">{utcTime(t1)}</text>
      <text x={4} y={T + 8} fontSize={10} fill="#6b7280">ft</text>
    </svg>
  );
};

const QUESTIONS = [
  'What went as planned? What didn’t, and why?',
  'Radio calls, airspace and clearances: anything to do differently?',
  'Weather and fuel compared with the plan',
  'Takeoff, approach and landing: how did they go?',
  'One thing to practise or do differently next time',
];

/**
 * The flight looked back on, on a page of its own (printable, or saved as PDF): the logged times,
 * the flown track over the planned route, the altitude through the flight, and questions to
 * debrief by, with room to write.
 */
const DebriefPack: React.FC<{
  name: string; points: TrackPoint[]; times: BlockTimes; planned: PlannedPoint[]; demo?: boolean; onClose: () => void;
  /** Ends the flight from here (out of navigation mode), with what that does, e.g. "saves it to My flights". */
  onExit?: () => void; exitNote?: string | null;
}> = ({ name, points, times, planned, demo, onClose, onExit, exitNote }) => {
  const facts = React.useMemo(() => flightFacts(points, times, planned), [points, times, planned]);
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); document.body.classList.remove('print-debrief'); };
  }, [onClose]);
  const article = React.useRef<HTMLElement>(null);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const print = () => {
    document.body.classList.add('print-debrief');
    window.print();
    // Safari returns at once; the class stays until the pack closes, which is harmless on screen.
  };
  // The apps can't print from their web view: the pack goes to the share sheet as a page of its own.
  const share = () => {
    if (!article.current) return;
    setShareError(null);
    saveFile(kmlFileName(points).replace(/^flight-/, 'debrief-').replace(/\.kml$/, '.html'),
      standaloneHtml(`Flight debrief: ${name}`, article.current), 'text/html')
      .catch(() => setShareError('Could not share the pack.'));
  };
  const kml = () => {
    setShareError(null);
    saveFile(kmlFileName(points), flightKml(name, points, times), 'application/vnd.google-earth.kml+xml')
      .catch(() => setShareError('Could not share the KML.'));
  };
  const date = new Date(points[0]?.at ?? Date.now()).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return createPortal(
    <div className="debrief-pack fixed inset-0 z-[3000] overflow-y-auto bg-white text-neutral-900" role="dialog" aria-modal="true" aria-label="Debriefing pack">
      <div className="no-print safe-top sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white/95 px-4 py-2">
        <strong className="mr-auto">Debriefing pack</strong>
        {shareError && <span className="text-sm text-red-600" role="alert">{shareError}</span>}
        {isNative() ? (
          <button type="button" className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white" onClick={share}>
            <Share2 className="h-4 w-4"/> Share (print, PDF, mail)
          </button>
        ) : (
          <button type="button" className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white" onClick={print}>
            <Printer className="h-4 w-4"/> Print or save as PDF
          </button>
        )}
        <button type="button" className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold" onClick={kml}>
          <Download className="h-4 w-4"/> KML
        </button>
        <button type="button" aria-label="Close debriefing pack" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-neutral-100" onClick={onClose}>
          <X className="h-5 w-5"/> Back
        </button>
      </div>
      <article ref={article} className="mx-auto max-w-[186mm] space-y-5 p-4 print:p-0">
        <header>
          <h1 className="text-2xl font-bold">Flight debrief: {name}</h1>
          <p className="text-sm text-neutral-600">
            {date} · times worked out from the GPS (check them against the tech log){demo ? ' · DEMO FLIGHT (4× speed: not real times)' : ''}
          </p>
        </header>
        <section className="grid gap-5 sm:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-500">Times</h2>
            <TimesTable times={times}/>
          </div>
          <div>
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-500">The flight</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm tabular-nums">
              <dt>Flown</dt><dd className="font-semibold">{nm1(facts.flownNm)} NM{facts.plannedNm != null ? ` (planned ${nm1(facts.plannedNm)} NM)` : ''}</dd>
              <dt>Highest</dt><dd className="font-semibold">{facts.maxAltFt != null ? `${ft(facts.maxAltFt)} ft GPS` : '–'}</dd>
              <dt>Ground speed</dt><dd className="font-semibold">{facts.airborneAvgKt != null ? `${facts.airborneAvgKt} kt average airborne` : '–'}{facts.maxKt != null ? `, ${facts.maxKt} kt highest` : ''}</dd>
            </dl>
          </div>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-500">Track (magenta) and plan (dashed)</h2>
          <TrackMap points={points} planned={planned} times={times}/>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-500">Altitude</h2>
          <AltitudeChart points={points} times={times}/>
        </section>
        <section className="break-inside-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-500">Debrief</h2>
          <ol className="space-y-3 text-sm">
            {QUESTIONS.map(q => (
              <li key={q}>
                <p className="font-semibold">{q}</p>
                <div className="mt-5 border-b border-neutral-300"/>
                <div className="mt-5 border-b border-neutral-300"/>
              </li>
            ))}
          </ol>
        </section>
      </article>
      {onExit && (
        <div className="no-print safe-bottom sticky bottom-0 border-t border-neutral-200 bg-white/95 px-4 py-3">
          <button type="button" onClick={onExit}
            className="mx-auto block w-full max-w-md rounded-lg bg-red-600 px-4 py-3 text-lg font-bold uppercase tracking-wide text-white hover:bg-red-700">
            Exit flight
          </button>
          {exitNote && <p className="mt-1 text-center text-xs text-neutral-600">{exitNote}</p>}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default DebriefPack;
