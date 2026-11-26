import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { altitudeAlongPoints } from '../../lib/airspace';
import type { PathPoint } from '../../lib/enroute';
import {
  loadObstacles, OBSTACLE_CORRIDOR_NM, OBSTACLE_MARGIN_FT, obstacleKind, obstaclesAiracText, obstaclesAlong, obstaclesOutOfDate, type RouteObstacle,
} from '../../lib/obstacles';

type At = { lat: number; lon: number };
const ft = (n: number) => Math.round(n).toLocaleString('en');
/** Listed besides the warnings: the highest few. */
const SHOWN = 5;

/**
 * The obstacles of 100 m or more within 5 NM of the route (AIP ENR 5.4), against the planned
 * altitude abeam each: less than 500 ft clearance is a warning.
 */
const ObstaclePanel: React.FC<{ route: At[]; path: PathPoint[]; basis: string }> = ({ route, path, basis }) => {
  const [data, setData] = React.useState<Awaited<ReturnType<typeof loadObstacles>> | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    loadObstacles().then(d => { if (live) setData(d); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const list = React.useMemo(
    () => (data ? obstaclesAlong(data.obstacles, route, altitudeAlongPoints(path)) : []),
    [data, route, path]);

  if (failed) return null;
  if (!data) return <p className="text-xs text-muted-foreground">Loading obstacles…</p>;
  const warnings = list.filter(o => o.clearanceFt < OBSTACLE_MARGIN_FT);
  const others = list.filter(o => o.clearanceFt >= OBSTACLE_MARGIN_FT).sort((a, b) => b.topFt - a.topFt).slice(0, SHOWN);
  const stale = obstaclesOutOfDate(data.dates);

  return (
    <section aria-label="Obstacles along the route" className="space-y-2 rounded-md border border-border p-3 text-sm">
      <h3 className="font-semibold">
        Obstacles within {OBSTACLE_CORRIDOR_NM} NM <span className="font-normal text-muted-foreground">· {list.length} of 100 m (328 ft) or more</span>
      </h3>
      {warnings.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-red-400 bg-red-50 p-2 text-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="flex items-center gap-1 font-semibold">
            <TriangleAlert className="h-4 w-4"/>
            {warnings.length === 1 ? '1 obstacle' : `${warnings.length} obstacles`} less than {OBSTACLE_MARGIN_FT} ft below the planned altitude
          </p>
          <ul className="space-y-0.5">{warnings.slice(0, 8).map((o, i) => <Row key={i} o={o} warn/>)}</ul>
          {warnings.length > 8 && <p className="text-xs">and {warnings.length - 8} more: climb, or route around them.</p>}
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-muted-foreground">None listed near the route.</p>
      ) : others.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{warnings.length ? 'Others, highest first' : 'Highest'}, all at least {OBSTACLE_MARGIN_FT} ft below {basis}:</p>
          <ul className="space-y-0.5">{others.map((o, i) => <Row key={i} o={o}/>)}</ul>
        </>
      )}
      <p className={stale ? 'text-xs font-semibold text-amber-700 dark:text-amber-400' : 'text-xs text-muted-foreground'}>
        AIP ENR 5.4, {obstaclesAiracText(data.dates)}{stale ? ', out of date: check the AIP' : ''}. Only obstacles of 100 m or more,
        and LFV notes the list is not complete: lower masts, wind turbines and power lines are not in it.
      </p>
    </section>
  );
};

const Row: React.FC<{ o: RouteObstacle; warn?: boolean }> = ({ o, warn }) => (
  <li className="tabular-nums">
    <strong>{obstacleKind(o.type)}</strong> {o.name}: <strong>{ft(o.topFt)} ft MSL</strong> ({ft(o.heightFt)} AGL{o.lit ? ', lit' : ''}),
    {' '}{o.offNm < 0.5 ? 'on the route' : `${o.offNm.toFixed(1)} NM off`} at {Math.round(o.alongNm)} NM
    {warn && <> · planned {ft(o.plannedFt)} ft, {o.clearanceFt >= 0 ? `${ft(o.clearanceFt)} ft above it` : `${ft(-o.clearanceFt)} ft below its top`}</>}
  </li>
);

export default ObstaclePanel;
