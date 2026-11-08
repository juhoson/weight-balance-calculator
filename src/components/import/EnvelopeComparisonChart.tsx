import React from 'react';
import {
  CartesianGrid,
  Label,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Point {
  cg: number;
  weight: number;
}

interface EnvelopeComparisonChartProps {
  standard: Point[];
  imported: Point[];
}

const STANDARD_COLOR = '#9CA3AF';
const IMPORTED_COLOR = '#3b82f6';

/** Closes the polygon so the outline is drawn all the way round. */
function closed(points: Point[]): Point[] {
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first.cg === last.cg && first.weight === last.weight ? points : [...points, first];
}

function paddedDomain(values: number[], fraction: number): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * fraction || 1;
  return [Number((min - pad).toFixed(3)), Number((max + pad).toFixed(3))];
}

/** The standard's CG envelope (dashed grey) with the imported one (blue) on top. */
const EnvelopeComparisonChart: React.FC<EnvelopeComparisonChartProps> = ({ standard, imported }) => {
  const standardData = React.useMemo(() => closed(standard), [standard]);
  const importedData = React.useMemo(() => closed(imported), [imported]);
  const all = [...standard, ...imported];
  const xDomain = paddedDomain(all.map(p => p.cg), 0.1);
  const yDomain = paddedDomain(all.map(p => p.weight), 0.08);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
        <XAxis type="number" dataKey="cg" domain={xDomain} stroke="currentColor" tick={{ fontSize: 12 }}>
          <Label value="CG (m aft of datum)" position="bottom" offset={20} style={{ fill: 'currentColor', fontSize: 12 }} />
        </XAxis>
        <YAxis type="number" dataKey="weight" domain={yDomain} stroke="currentColor" tick={{ fontSize: 12 }}>
          <Label value="Weight (kg)" angle={-90} position="insideLeft" style={{ fill: 'currentColor', fontSize: 12 }} />
        </YAxis>
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Point;
            return (
              <div className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow">
                {p.cg.toFixed(3)} m · {p.weight.toFixed(0)} kg
              </div>
            );
          }}
        />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
        <Scatter
          name="Standard"
          data={standardData}
          fill={STANDARD_COLOR}
          line={{ stroke: STANDARD_COLOR, strokeWidth: 2, strokeDasharray: '6 4' }}
          isAnimationActive={false}
        />
        <Scatter
          name="Your values"
          data={importedData}
          fill={IMPORTED_COLOR}
          line={{ stroke: IMPORTED_COLOR, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

export default EnvelopeComparisonChart;
