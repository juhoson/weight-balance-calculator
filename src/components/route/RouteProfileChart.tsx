import React from 'react';
import { X } from 'lucide-react';
import type { LegPlan, ProfilePlan, SegmentPlan } from '../../lib/enroute';
import { adviceFor, type AirspaceCheck } from '../../lib/airspace';
import { contactFrequencies, frequencyText } from '../../lib/frequencies';
import { SEVERITY_STYLE } from './AirspacePanel';

interface RouteProfileChartProps {
  legs: LegPlan[];
  altitudeFt: number;
  /** Climb and descent; without it the cruise altitude is drawn all the way. */
  profile?: ProfilePlan | null;
  /** Airspace under the route, drawn as boxes from floor to ceiling. */
  airspaces?: AirspaceCheck[];
}

const HEIGHT = 240;
const M = { top: 30, right: 10, bottom: 34, left: 40 };
const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');
const utc = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
const kft = (ft: number) => (ft === 0 ? '0' : `${ft / 1000}k`);

/** Width of an element, following resizes. */
function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** What's open: a segment's weather, or the airspace boxes under a tap. */
type Active = { kind: 'segment'; i: number } | { kind: 'airspace'; ids: number[]; x: number; below: boolean };

/**
 * The route from the side: cloud by height along the way, the cruise altitude, the freezing level
 * and the (averaged) terrain, with the wind at the cruise altitude along the top. Tap or hover a
 * segment (the wind strip along the top always works) for its weather; tap an airspace box for its
 * limits and frequency. The nav log below has the same numbers as a table.
 */
const RouteProfileChart: React.FC<RouteProfileChartProps> = ({ legs, altitudeFt, profile, airspaces = [] }) => {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const [active, setActive] = React.useState<Active | null>(null);
  React.useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setActive(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [active, ref]);
  const segments = legs.flatMap(l => l.segments);
  if (segments.length === 0) return null;

  const totalNm = segments.reduce((sum, s) => Math.max(sum, s.segment.startNm + s.segment.distanceNm), 0);
  const highest = profile ? profile.topFt : altitudeFt;
  const topFt = Math.min(20000, Math.max(6000, Math.ceil((highest + 3000) / 2000) * 2000));
  const plotW = Math.max(100, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (nm: number) => M.left + (nm / totalNm) * plotW;
  const y = (ft: number) => M.top + plotH - (Math.min(Math.max(ft, 0), topFt) / topFt) * plotH;
  const yTicks = Array.from({ length: topFt / 2000 + 1 }, (_, i) => i * 2000);

  // Wind arrows: as many as fit, at least ~36 px apart.
  const step = Math.max(1, Math.ceil(36 / (plotW / segments.length)));
  const freezing = segments.map(s => (s.freezingLevelFt === null ? null : {
    x: x(s.segment.startNm + s.segment.distanceNm / 2), y: y(s.freezingLevelFt),
  }));
  const freezingPath = freezing.reduce((d, p, i) => {
    if (!p) return d;
    return `${d}${i > 0 && freezing[i - 1] ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }, '');
  const terrain = segments.map(s => s.segment.groundFt ?? 0);
  const boundaries = legs.map(l => l.segments[0]?.segment.startNm).filter((nm): nm is number => nm !== undefined);
  const codes = [...legs.map(l => l.leg.from), legs[legs.length - 1].leg.to];
  const shown = active?.kind === 'segment' ? segments[active.i] : null;
  const activeSegment = active?.kind === 'segment' ? active.i : null;
  // Boxes that reach into the chart, widest first so narrow ones stay on top. Gliding sectors and
  // other information-only areas are left to the list: in grey they'd read as cloud.
  const placedLabels: Array<{ x0: number; x1: number; top: number }> = [];
  const shownAirspaces = airspaces
    .filter(c => c.floorFt < topFt && c.ceilingFt > 0 && adviceFor(c.airspace).severity !== 'info')
    .sort((a, b) => (b.toNm - b.fromNm) - (a.toNm - a.fromNm));
  const boxes = shownAirspaces.map(c => {
    const x0 = x(c.fromNm);
    return { c, x0, x1: Math.max(x(c.toNm), x0 + 2), top: y(Math.min(c.ceilingFt, topFt)), bottom: y(Math.max(0, c.floorFt)) };
  });
  const openAirspace = active?.kind === 'airspace' ? active.ids : [];
  /** A tap on a box lists every box under the finger, narrowest first; without a position, just that one. */
  const tapAirspace = (e: React.PointerEvent<SVGRectElement>, idx: number) => {
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    const px = svg && svg.width > 0 ? e.clientX - svg.left : null, py = svg && svg.width > 0 ? e.clientY - svg.top : null;
    const ids = px === null || py === null ? [idx]
      : boxes.map((b, i) => ({ b, i })).filter(({ b }) => px >= b.x0 && px <= b.x1 && py >= b.top - 1 && py <= b.bottom + 1).map(({ i }) => i).reverse();
    const list = ids.length ? ids : [idx];
    const same = active?.kind === 'airspace' && active.ids.join() === list.join();
    const b = boxes[list[0]];
    setActive(same ? null : { kind: 'airspace', ids: list, x: px ?? (b.x0 + b.x1) / 2, below: (b.top + b.bottom) / 2 < M.top + plotH / 2 });
  };

  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-primary"/>
          {profile
            ? profile.reachesCruise ? `Flight path, cruise ${altitudeFt.toLocaleString('en')} ft` : `Flight path, highest ≈ ${(Math.round(profile.topFt / 100) * 100).toLocaleString('en')} ft`
            : `Cruise ${altitudeFt.toLocaleString('en')} ft`}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-slate-400/70 dark:bg-slate-300/60"/> Cloud (darker = more)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-sky-600 dark:border-sky-400"/> 0 °C level</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-stone-400/60 dark:bg-stone-600/70"/> Terrain (model average)</span>
        {shownAirspaces.length > 0 && (
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border border-blue-600 bg-blue-500/15 dark:border-blue-400"/> Airspace (tap for limits and frequency)</span>
        )}
      </figcaption>
      <div ref={ref} className="relative w-full min-w-0 select-none" onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}>
        <svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="block" role="img"
          aria-label={`Route profile, ${Math.round(totalNm)} NM at ${altitudeFt} ft: cloud, freezing level, terrain and wind. Details in the nav log.`}>
          {/* Grid and height axis */}
          {yTicks.map(ft => (
            <g key={ft}>
              <line x1={M.left} x2={M.left + plotW} y1={y(ft)} y2={y(ft)} className="stroke-border" strokeWidth={1}/>
              <text x={M.left - 6} y={y(ft)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{kft(ft)}</text>
            </g>
          ))}
          <text x={4} y={M.top - 16} className="fill-muted-foreground text-[10px]">ft</text>

          {/* Cloud: each pressure level fills the band halfway to its neighbours. */}
          <g className="fill-slate-500 dark:fill-slate-300">
            {segments.map((s, i) => {
              const x0 = x(s.segment.startNm), x1 = x(s.segment.startNm + s.segment.distanceNm);
              const layers = s.layers;
              return layers.map((l, j) => {
                if (l.cloudCover < 10) return null;
                const below = j === 0 ? s.segment.groundFt ?? 0 : (layers[j - 1].heightFt + l.heightFt) / 2;
                const above = j === layers.length - 1
                  ? l.heightFt + (j > 0 ? (l.heightFt - layers[j - 1].heightFt) / 2 : 1000)
                  : (l.heightFt + layers[j + 1].heightFt) / 2;
                if (below >= topFt) return null;
                return <rect key={`${i}-${j}`} x={x0} width={Math.max(0, x1 - x0)} y={y(above)} height={Math.max(0, y(below) - y(above))}
                  fillOpacity={(l.cloudCover / 100) * 0.75}/>;
              });
            })}
          </g>

          {/* Airspace: floor to ceiling where the route is under its outline. */}
          <g aria-hidden="true">
            {boxes.map(({ c, x0, x1, top, bottom }, i) => {
              const style = SEVERITY_STYLE[adviceFor(c.airspace).severity].box;
              const open = openAirspace.includes(i);
              const label = c.airspace.name.length > 22 ? `${c.airspace.name.slice(0, 21)}…` : c.airspace.name;
              const labelW = label.length * 5.5 + 6;
              // One label per spot: skip a name that would overprint one already drawn.
              const fits = x1 - x0 > labelW && bottom - top > 14
                && !placedLabels.some(r => x0 < r.x1 && x0 + labelW > r.x0 && Math.abs(top - r.top) < 12);
              if (fits) placedLabels.push({ x0, x1: x0 + labelW, top });
              return (
                <g key={`${c.airspace.id}-${i}`} className={style}>
                  <rect x={x0} width={x1 - x0} y={top} height={Math.max(1, bottom - top)} fillOpacity={open ? 0.3 : 0.1}
                    strokeWidth={open ? 2 : 1} strokeDasharray={c.status === 'inside' || open ? undefined : '3 3'}/>
                  {fits && (
                    <text x={x0 + 3} y={top + 11} className="fill-foreground stroke-none text-[9px]" fillOpacity={0.8}>{label}</text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Terrain */}
          <path className="fill-stone-400/60 dark:fill-stone-600/70"
            d={`M${x(0)},${y(0)}${segments.map((s, i) => `L${x(s.segment.startNm)},${y(terrain[i])}L${x(s.segment.startNm + s.segment.distanceNm)},${y(terrain[i])}`).join('')}L${x(totalNm)},${y(0)}Z`}/>

          {/* Freezing level */}
          {freezingPath && <path d={freezingPath} fill="none" className="stroke-sky-600 dark:stroke-sky-400" strokeWidth={2} strokeDasharray="5 4"/>}

          {/* Flight path: climb to the top of climb, cruise, descend from the top of descent to circuit altitude. */}
          {profile ? (
            <g>
              <path fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round"
                d={`M${x(0)},${y(profile.departureFt)}L${x(profile.tocNm)},${y(profile.topFt)}L${x(profile.todNm)},${y(profile.topFt)}L${x(totalNm)},${y(profile.arrivalFt)}`}/>
              {(x(profile.todNm) - x(profile.tocNm) < 40
                // Too close to label apart (a short hop): one point.
                ? [{ nm: (profile.tocNm + profile.todNm) / 2, label: 'TOC/TOD', anchor: 'middle' as const, dx: 0 }]
                : [{ nm: profile.tocNm, label: 'TOC', anchor: 'start' as const, dx: 4 }, { nm: profile.todNm, label: 'TOD', anchor: 'end' as const, dx: -4 }]
              ).map(m => (
                <g key={m.label}>
                  <circle cx={x(m.nm)} cy={y(profile.topFt)} r={3.5} className="fill-background stroke-primary" strokeWidth={2}/>
                  <text x={x(m.nm) + m.dx} y={y(profile.topFt) - 7} textAnchor={m.anchor} className="fill-foreground text-[10px] font-semibold">{m.label}</text>
                </g>
              ))}
            </g>
          ) : (
            <line x1={M.left} x2={M.left + plotW} y1={y(altitudeFt)} y2={y(altitudeFt)} className="stroke-primary" strokeWidth={2}/>
          )}

          {/* Waypoints */}
          {[...boundaries, totalNm].map((nm, i) => (
            <g key={i}>
              <line x1={x(nm)} x2={x(nm)} y1={M.top} y2={M.top + plotH} className="stroke-muted-foreground" strokeOpacity={0.5} strokeDasharray="2 3"/>
              <text x={x(nm)} y={HEIGHT - M.bottom + 14} textAnchor={i === 0 ? 'start' : i === boundaries.length ? 'end' : 'middle'}
                className="fill-foreground text-[10px] font-medium">{codes[i]}</text>
            </g>
          ))}
          <text x={M.left + plotW} y={HEIGHT - 4} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{Math.round(totalNm)} NM</text>

          {/* Wind at the cruise altitude: arrows point where the air goes (north up). */}
          {segments.map((s, i) => {
            if (i % step !== 0) return null;
            const cx = x(s.segment.startNm + s.segment.distanceNm / 2);
            return (
              <g key={i} transform={`translate(${cx},${M.top - 18})`}>
                <g transform={`rotate(${s.wind.fromTrue + 180})`}>
                  <path d="M0,6 L0,-5 M-3,-2 L0,-6 L3,-2" fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinecap="round"/>
                </g>
                <text x={0} y={16} textAnchor="middle" className="fill-muted-foreground text-[9px] tabular-nums">{Math.round(s.wind.kt)}</text>
              </g>
            );
          })}

          {/* Hover/tap targets, a full column per segment */}
          {segments.map((s, i) => (
            <rect key={i} x={x(s.segment.startNm)} width={Math.max(1, x(s.segment.startNm + s.segment.distanceNm) - x(s.segment.startNm))}
              y={M.top - 28} height={plotH + 28} fill="transparent" data-segment={i}
              className={`cursor-pointer ${activeSegment === i ? 'fill-foreground/10' : ''}`}
              onPointerEnter={e => { if (e.pointerType === 'mouse' && active?.kind !== 'airspace') setActive({ kind: 'segment', i }); }}
              onPointerUp={() => setActive(a => (a?.kind === 'segment' && a.i === i ? null : { kind: 'segment', i }))}/>
          ))}

          {/* Airspace boxes on top of the columns, narrowest last so it wins the tap. */}
          {boxes.map(({ c, x0, x1, top, bottom }, i) => (
            <rect key={`hit-${i}`} x={x0} width={x1 - x0} y={top} height={Math.max(4, bottom - top)} fill="transparent"
              className="cursor-pointer" role="button" tabIndex={0} aria-label={`Airspace ${c.airspace.name}`}
              onPointerUp={e => tapAirspace(e, i)}
              onKeyDown={e => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                setActive({ kind: 'airspace', ids: [i], x: (x0 + x1) / 2, below: (top + bottom) / 2 < M.top + plotH / 2 });
              }}/>
          ))}
        </svg>
        {shown && (
          <Tooltip s={shown} left={x(shown.segment.startNm + shown.segment.distanceNm / 2)} width={width}
            // Away from the cruise line, so the flight path stays in view.
            below={y(altitudeFt) < M.top + plotH / 2} onClose={() => setActive(null)}/>
        )}
        {active?.kind === 'airspace' && (
          <AirspaceTooltip checks={active.ids.map(i => boxes[i].c)} left={active.x} width={width} below={active.below} onClose={() => setActive(null)}/>
        )}
      </div>
    </figure>
  );
};

/** A segment's details; tap it (or its ×) to close. Sits above or below the cruise line, never on it. */
const Tooltip: React.FC<{ s: SegmentPlan; left: number; width: number; below: boolean; onClose: () => void }> = ({
  s, left, width, below, onClose,
}) => {
  const w = 200;
  const clamped = Math.min(Math.max(left - w / 2, 0), Math.max(0, width - w));
  return (
    <div role="dialog" aria-label="Segment details" style={{ left: clamped, width: w, ...(below ? { bottom: M.bottom + 2 } : { top: M.top + 2 }) }}
      onPointerUp={e => { e.stopPropagation(); onClose(); }}
      className="absolute z-10 cursor-pointer rounded-md border border-border bg-popover/95 p-2 pr-7 text-[11px] leading-snug text-popover-foreground shadow-md tabular-nums">
      <button type="button" aria-label="Close segment details" onClick={onClose}
        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3.5 w-3.5"/>
      </button>
      <p className="font-medium">{Math.round(s.segment.startNm)}–{Math.round(s.segment.startNm + s.segment.distanceNm)} NM · {utc(s.departs)}–{utc(s.arrives)}</p>
      <p>Wind {pad3(s.wind.fromTrue)}°/{Math.round(s.wind.kt)} kt{s.wind.tempC !== null ? ` · ${Math.round(s.wind.tempC)} °C` : ''}</p>
      <p>MH {pad3(s.magneticHeading)}° · GS {Math.round(s.groundSpeedKt)} kt</p>
      <p>Cloud base {s.cloudBaseFt === null ? 'none (no broken layer)' : `≈ ${s.cloudBaseFt.toLocaleString('en')} ft`}</p>
      <p>0 °C {s.freezingLevelFt === null ? 'above 18,000 ft' : s.segment.groundFt !== null && s.freezingLevelFt <= s.segment.groundFt ? 'at the ground' : `≈ ${s.freezingLevelFt.toLocaleString('en')} ft`}</p>
    </div>
  );
};

const STATUS: Record<AirspaceCheck['status'], string> = {
  inside: 'You are in it', close: 'You pass close to a limit', above: 'You pass over it', below: 'You pass under it',
};
const activation = (a: AirspaceCheck['airspace']['activation']) =>
  a === 'NOTAM' ? ' Active by NOTAM.' : a === 'request' ? ' Active on request.' : a === 'demand' ? ' Active on demand.' : '';

/** The airspaces under a tap: where they start and end, and who to call. */
const AirspaceTooltip: React.FC<{ checks: AirspaceCheck[]; left: number; width: number; below: boolean; onClose: () => void }> = ({
  checks, left, width, below, onClose,
}) => {
  const w = 240;
  const clamped = Math.min(Math.max(left - w / 2, 0), Math.max(0, width - w));
  return (
    <div role="dialog" aria-label="Airspace details" style={{ left: clamped, width: w, ...(below ? { bottom: M.bottom + 2 } : { top: M.top + 2 }) }}
      onPointerUp={e => { e.stopPropagation(); onClose(); }}
      className="absolute z-10 max-h-[200px] cursor-pointer space-y-1.5 overflow-y-auto rounded-md border border-border bg-popover/95 p-2 pr-7 text-[11px] leading-snug text-popover-foreground shadow-md tabular-nums">
      <button type="button" aria-label="Close airspace details" onClick={onClose}
        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3.5 w-3.5"/>
      </button>
      {checks.map((c, i) => {
        const advice = adviceFor(c.airspace);
        const freqs = contactFrequencies(c.airspace.frequencies);
        return (
          <div key={`${c.airspace.id}-${i}`} className={i > 0 ? 'border-t border-border pt-1.5' : undefined}>
            <p className="font-medium">{c.airspace.name}</p>
            <p className={SEVERITY_STYLE[advice.severity].text}>{advice.label}</p>
            <p>{c.airspace.lower.label} – {c.airspace.upper.label}</p>
            <p className="text-muted-foreground">{Math.round(c.fromNm)}–{Math.round(c.toNm)} NM along the route. {STATUS[c.status]}.{activation(c.airspace.activation)}</p>
            {freqs.length
              ? freqs.map(f => <p key={f.value} className="font-semibold">{frequencyText(f)}{f.source && <span className="font-normal text-muted-foreground"> (from {f.source})</span>}</p>)
              : <p className="text-muted-foreground">No frequency listed</p>}
          </div>
        );
      })}
    </div>
  );
};

export default RouteProfileChart;
