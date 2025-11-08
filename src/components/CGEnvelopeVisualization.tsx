import {
  CartesianGrid,
  Label,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {Plane, PlaneLanding} from 'lucide-react';
import React from 'react';

interface EnvelopePoint {
    cg: number;
    weight: number;
}

interface CGEnvelopeVisualizationProps {
    envelopePoints: EnvelopePoint[];
    takeoffPoint?: EnvelopePoint;
    landingPoint?: EnvelopePoint;
    limits: {
        maxWeight: number;
        minWeight: number;
        forwardCG: number;
        aftCG: number;
    };
}

const CGEnvelopeVisualization: React.FC<CGEnvelopeVisualizationProps> = ({
  envelopePoints,
  takeoffPoint,
  landingPoint,
  limits
}) => {
  // Responsive sizing hook
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Memoize data to prevent re-renders
  const envelopeData = React.useMemo(
    () => envelopePoints.map(point => ({...point, dataType: 'boundary'})),
    [envelopePoints]
  );

  const flightPathData = React.useMemo(
    () => takeoffPoint && landingPoint ? [
      {...takeoffPoint, dataType: 'path'},
      {...landingPoint, dataType: 'path'}
    ] : null,
    [takeoffPoint, landingPoint]
  );

  const takeoffData = React.useMemo(
    () => takeoffPoint ? [{...takeoffPoint, dataType: 'takeoff'}] : null,
    [takeoffPoint]
  );

  const landingData = React.useMemo(
    () => landingPoint ? [{...landingPoint, dataType: 'landing'}] : null,
    [landingPoint]
  );

  const referenceLabelConfig = React.useMemo(
    () => ({
      value: `MTOW (${limits.maxWeight} kg)`,
      position: 'right' as const,
      fill: '#dc2626',
      fontSize: isMobile ? 10 : 12
    }),
    [limits.maxWeight, isMobile]
  );

  const chartMargin = React.useMemo(
    () => isMobile ?
      {top: 20, right: 10, bottom: 50, left: 40} :
      {top: 20, right: 30, bottom: 70, left: 60},
    [isMobile]
  );

  const axisTickStyle = React.useMemo(
    () => ({fontSize: isMobile ? 10 : 12}),
    [isMobile]
  );

  const labelStyle = React.useMemo(
    () => ({
      fill: 'currentColor',
      fontSize: isMobile ? 10 : 12
    }),
    [isMobile]
  );

  const CustomTooltip = React.useCallback(({active, payload}: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      const isEnvelope = data.dataType === 'boundary';

      return (
        <div
          className="bg-card/90 backdrop-blur-sm p-2 rounded-lg shadow-lg border border-border text-foreground text-xs md:text-sm md:p-3">
          {isEnvelope ? (
            <div className="font-medium">
              <p>Envelope Point</p>
              <p>CG: {data.cg.toFixed(3)} m</p>
              <p>Weight: {data.weight.toFixed(1)} kg</p>
            </div>
          ) : data.dataType === 'takeoff' ? (
            <div>
              <p className="font-semibold text-orange-500">Takeoff</p>
              <p>CG: {data.cg.toFixed(3)} m</p>
              <p>Weight: {data.weight.toFixed(1)} kg</p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-green-500">Landing</p>
              <p>CG: {data.cg.toFixed(3)} m</p>
              <p>Weight: {data.weight.toFixed(1)} kg</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  }, []);

  const CustomLegend = React.useCallback(({payload}: any) => (
    <div className="flex justify-center gap-3 md:gap-6 mt-2 md:mt-4 mb-4 md:mb-8 text-foreground">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-1 md:gap-2">
          {entry.value === 'Takeoff' ? (
            <>
              <Plane size={isMobile ? 12 : 16} className="text-orange-500 rotate-45"/>
              <span className="text-xs md:text-sm font-medium">Takeoff</span>
            </>
          ) : entry.value === 'Landing' ? (
            <>
              <PlaneLanding size={isMobile ? 12 : 16} className="text-green-500 -rotate-45"/>
              <span className="text-xs md:text-sm font-medium">Landing</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-blue-500 opacity-70"/>
              <span className="text-xs md:text-sm font-medium">Envelope</span>
            </>
          )}
        </div>
      ))}
    </div>
  ), [isMobile]);

  return (
    <div className="mt-4 md:mt-8 p-2 md:p-4">
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 500}>
        <ScatterChart margin={chartMargin}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.1}
          />
          <XAxis
            type="number"
            dataKey="cg"
            domain={[limits.forwardCG, limits.aftCG]}
            stroke="currentColor"
            tick={axisTickStyle}
          >
            <Label
              value="Center of Gravity (meters)"
              position="bottom"
              offset={isMobile ? 25 : 40}
              style={labelStyle}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="weight"
            domain={[limits.minWeight, limits.maxWeight]}
            stroke="currentColor"
            tick={axisTickStyle}
          >
            <Label
              value="Weight (kg)"
              angle={-90}
              position="left"
              offset={isMobile ? 25 : 40}
              style={labelStyle}
            />
          </YAxis>

          {/* Envelope boundary */}
          <Scatter
            name="Envelope"
            data={envelopeData}
            line={{stroke: '#3b82f6'}}
            fill="#3b82f6"
            opacity={0.7}
          />

          {/* Flight path line */}
          {flightPathData && (
            <Line
              data={flightPathData}
              type="linear"
              dataKey="weight"
              stroke="#9CA3AF"
              strokeWidth={isMobile ? 1 : 2}
              strokeDasharray="4 4"
              dot={false}
            />
          )}

          {/* MTOW Line */}
          <ReferenceLine
            y={limits.maxWeight}
            stroke="#dc2626"
            strokeDasharray="3 3"
            label={referenceLabelConfig}
          />

          {/* Points */}
          {takeoffData && (
            <Scatter
              name="Takeoff"
              data={takeoffData}
              shape={<CustomScatterTakeoff size={isMobile ? 18 : 24}/>}
            />
          )}

          {landingData && (
            <Scatter
              name="Landing"
              data={landingData}
              shape={<CustomScatterLanding size={isMobile ? 18 : 24}/>}
            />
          )}

          <Tooltip content={<CustomTooltip/>}/>
          <Legend content={<CustomLegend/>}/>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

// Custom scatter shapes - memoized to prevent re-renders
const CustomScatterTakeoff = React.memo((props: any) => {
  const {cx, cy, size} = props;
  return (
    <g transform={`translate(${cx - size / 2}, ${cy - size / 2}) rotate(45 ${size / 2} ${size / 2})`}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 21 4s-2 0-3.5 1.5L14 9l-8.2-1.8c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 1.5 4.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
      </svg>
    </g>
  );
});

const CustomScatterLanding = React.memo((props: any) => {
  const {cx, cy, size} = props;
  return (
    <g transform={`translate(${cx - size / 2}, ${cy - size / 2}) rotate(-45 ${size / 2} ${size / 2})`}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 22h20"/>
        <path
          d="M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z"/>
      </svg>
    </g>
  );
});

CustomScatterTakeoff.displayName = 'CustomScatterTakeoff';
CustomScatterLanding.displayName = 'CustomScatterLanding';

export default React.memo(CGEnvelopeVisualization);