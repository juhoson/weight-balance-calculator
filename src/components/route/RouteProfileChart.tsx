import React from 'react';
import { X } from 'lucide-react';
import type { LegPlan, SegmentPlan } from '../../lib/enroute';

interface RouteProfileChartProps {
  legs: LegPlan[];
  altitudeFt: number;
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

/**
 * The route from the side: cloud by height along the way, the cruise altitude, the freezing level
 * and the (averaged) terrain, with the wind at the cruise altitude along the top. Tap or hover a
 * segment for its details; the nav log below has the same numbers as a table.
 */
const RouteProfileChart: React.FC<RouteProfileChartProps> = ({ legs, altitudeFt }) => {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const [active, setActive] = React.useState<number | null>(null);
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
  const topFt = Math.min(20000, Math.max(6000, Math.ceil((altitudeFt + 3000) / 2000) * 2000));
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
  const shown = active === null ? null : segments[active];

  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-primary"/> Cruise {altitudeFt.toLocaleString('en')} ft</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-slate-400/70 dark:bg-slate-300/60"/> Cloud (darker = more)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-sky-600 dark:border-sky-400"/> 0 °C level</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-stone-400/60 dark:bg-stone-600/70"/> Terrain (model average)</span>
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

          {/* Terrain */}
          <path className="fill-stone-400/60 dark:fill-stone-600/70"
            d={`M${x(0)},${y(0)}${segments.map((s, i) => `L${x(s.segment.startNm)},${y(terrain[i])}L${x(s.segment.startNm + s.segment.distanceNm)},${y(terrain[i])}`).join('')}L${x(totalNm)},${y(0)}Z`}/>

          {/* Freezing level */}
          {freezingPath && <path d={freezingPath} fill="none" className="stroke-sky-600 dark:stroke-sky-400" strokeWidth={2} strokeDasharray="5 4"/>}

          {/* Cruise altitude */}
          <line x1={M.left} x2={M.left + plotW} y1={y(altitudeFt)} y2={y(altitudeFt)} className="stroke-primary" strokeWidth={2}/>

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
              y={M.top - 28} height={plotH + 28} fill="transparent"
              className={active === i ? 'fill-foreground/10' : undefined}
              onPointerEnter={e => { if (e.pointerType === 'mouse') setActive(i); }}
              onPointerUp={() => setActive(a => (a === i ? null : i))}/>
          ))}
        </svg>
        {shown && (
          <Tooltip s={shown} left={x(shown.segment.startNm + shown.segment.distanceNm / 2)} width={width}
            // Away from the cruise line, so the flight path stays in view.
            below={y(altitudeFt) < M.top + plotH / 2} onClose={() => setActive(null)}/>
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
      <p>MH {pad3(s.magneticHeading)}° · GS {Math.round(s.triangle.groundSpeedKt)} kt</p>
      <p>Cloud base {s.cloudBaseFt === null ? 'none (no broken layer)' : `≈ ${s.cloudBaseFt.toLocaleString('en')} ft`}</p>
      <p>0 °C {s.freezingLevelFt === null ? 'above 18,000 ft' : s.segment.groundFt !== null && s.freezingLevelFt <= s.segment.groundFt ? 'at the ground' : `≈ ${s.freezingLevelFt.toLocaleString('en')} ft`}</p>
    </div>
  );
};

export default RouteProfileChart;
