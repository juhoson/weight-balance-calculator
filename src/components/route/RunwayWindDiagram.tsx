import React from 'react';
import type { Runway } from '../../types/route';
import type { RunwayWind } from '../../lib/wind';

interface RunwayWindDiagramProps {
  windDirTrue: number;
  windKt: number;
  gustKt: number | null;
  best: RunwayWind;
  /** Runways the best one was picked from. */
  runways: Runway[];
  /** Runways left out (grass in winter), drawn dashed. */
  excluded?: Runway[];
}

const STREAK_X = [-80, -60, -40, -20, 0, 20, 40, 60, 80];

/** One runway, drawn through the centre at its true heading (schematic: not to scale, not where it lies on the field). */
function RunwayShape({ runway, dashed }: { runway: Runway; dashed?: boolean }) {
  const heading = runway.leHeadingTrue ?? (runway.heHeadingTrue !== null ? runway.heHeadingTrue - 180 : null);
  if (heading === null) return null;
  return (
    <rect x={-4} y={-52} width={8} height={104} rx={1} transform={`rotate(${heading})`}
      className={dashed ? 'fill-none stroke-muted-foreground' : 'fill-muted-foreground'} fillOpacity={dashed ? undefined : 0.4}
      strokeDasharray={dashed ? '4 3' : undefined} strokeWidth={dashed ? 1.2 : 0}/>
  );
}

/**
 * North-up sketch of the wind across the best runway: streaks flow with the wind
 * (faster for stronger wind, pulsing when gusty) and an arrow marks the take-off/landing direction.
 */
const RunwayWindDiagram: React.FC<RunwayWindDiagramProps> = ({ windDirTrue, windKt, gustKt, best, runways, excluded = [] }) => {
  const clipId = React.useId();
  const pair = runways.find(r => r.le === best.runway || r.he === best.runway);
  const reciprocal = pair ? (pair.le === best.runway ? pair.he : pair.le) : '';
  const duration = Math.min(4, Math.max(0.35, 10 / Math.max(windKt, 1)));
  const gusty = gustKt !== null && gustKt > windKt;

  return (
    <svg viewBox="-100 -100 200 200" className="h-40 w-40 shrink-0" role="img"
      aria-label={`Wind from ${windDirTrue}° at ${windKt} knots${gusty ? `, gusting ${gustKt}` : ''}, across runway ${best.runway}`}>
      <defs>
        <clipPath id={clipId}><circle r={86}/></clipPath>
      </defs>
      <circle r={86} className="fill-muted stroke-border" fillOpacity={0.5} strokeWidth={1}/>
      <text y={-90} textAnchor="middle" className="fill-muted-foreground text-[11px] font-semibold">N</text>

      {/* Other runways, then excluded grass runways, then the best one on top. */}
      {runways.filter(r => r !== pair).map((r, i) => <RunwayShape key={`u${i}`} runway={r}/>)}
      {excluded.map((r, i) => <RunwayShape key={`x${i}`} runway={r} dashed/>)}
      <g transform={`rotate(${best.headingTrue})`}>
        <rect x={-7} y={-58} width={14} height={116} rx={1.5} className="fill-foreground" fillOpacity={0.8}/>
        <line x1={0} y1={-34} x2={0} y2={34} strokeDasharray="6 5" strokeWidth={1.2} className="stroke-background"/>
        <text y={53} textAnchor="middle" className="fill-background text-[10px] font-bold">{best.runway}</text>
        {reciprocal && (
          <text y={53} textAnchor="middle" transform="rotate(180)" className="fill-background text-[10px] font-bold">{reciprocal}</text>
        )}
        {/* Direction of take-off and landing. */}
        <path d="M0 -76 L-7 -64 L7 -64 Z" className="fill-primary"/>
      </g>

      {/* Wind: drawn in a frame where it blows from the top down. */}
      <g transform={`rotate(${windDirTrue})`} clipPath={`url(#${clipId})`}>
        {STREAK_X.map((x, i) => (
          <line key={x} x1={x} y1={-100} x2={x} y2={100} strokeDasharray="14 26" strokeLinecap="round" strokeWidth={2.2}
            className={`stroke-sky-500 dark:stroke-sky-400 ${gusty ? 'wind-streak-gusty' : 'wind-streak'}`}
            style={{ '--wind-duration': `${duration}s`, animationDelay: `${-((i * 0.37) % 1) * duration}s`, opacity: 0.7 } as React.CSSProperties}/>
        ))}
      </g>
      <g transform={`rotate(${windDirTrue})`}>
        <path d="M0 -84 L0 -64 M-7 -72 L0 -62 L7 -72" fill="none" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
          className="stroke-sky-600 dark:stroke-sky-300"/>
      </g>
    </svg>
  );
};

export default RunwayWindDiagram;
