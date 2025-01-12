import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Line,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Label, ReferenceLine,
} from 'recharts';

import { Plane, PlaneLanding } from 'lucide-react';

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
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length > 0) {
            const data = payload[0].payload;
            const isEnvelope = data.dataType === 'boundary';

            return (
                <div
                    className="bg-card/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border text-foreground">

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
    };

    const CustomLegend = ({payload}: any) => (
        <div className="flex justify-center gap-6 mt-4 mb-8 text-foreground">
            {payload.map((entry: any, index: number) => (
                <div key={index} className="flex items-center gap-2">
                    {entry.value === 'Takeoff' ? (
                        <>
                            <Plane size={16} className="text-orange-500 rotate-45"/>
                            <span className="text-sm font-medium">Takeoff</span>
                        </>
                    ) : entry.value === 'Landing' ? (
                        <>
                            <PlaneLanding size={16} className="text-green-500 -rotate-45"/>
                            <span className="text-sm font-medium">Landing</span>
                        </>
                    ) : (
                        <>
                            <div className="w-3 h-3 rounded-full bg-blue-500 opacity-70"/>
                            <span className="text-sm font-medium">Envelope</span>
                        </>
                    )}
                </div>
            ))}
        </div>
    );

    // src/components/CGEnvelopeVisualization.tsx
    return (
        <div className="mt-8 p-4">
            <ResponsiveContainer width="100%" height={500}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 70, left: 60 }}>
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
                    >
                        <Label
                            value="Center of Gravity (meters)"
                            position="bottom"
                            offset={40}
                            style={{ fill: "currentColor" }}
                        />
                    </XAxis>
                    <YAxis
                        type="number"
                        dataKey="weight"
                        domain={[limits.minWeight, limits.maxWeight]}
                        stroke="currentColor"
                    >
                        <Label
                            value="Weight (kg)"
                            angle={-90}
                            position="left"
                            offset={40}
                            style={{ fill: "currentColor" }}
                        />
                    </YAxis>

                    {/* Envelope boundary */}
                    <Scatter
                        name="Envelope"
                        data={envelopePoints.map(point => ({ ...point, dataType: 'boundary' }))}
                        line={{ stroke: '#3b82f6' }}
                        fill="#3b82f6"
                        opacity={0.7}
                    />

                    {/* Flight path line */}
                    {takeoffPoint && landingPoint && (
                        <Line
                            data={[
                                { ...takeoffPoint, dataType: 'path' },
                                { ...landingPoint, dataType: 'path' }
                            ]}
                            type="linear"
                            dataKey="weight"
                            stroke="#9CA3AF"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                        />
                    )}

                    {/* MTOW Line */}
                    <ReferenceLine
                        y={limits.maxWeight}
                        stroke="#dc2626"
                        strokeDasharray="3 3"
                        label={{
                            value: `MTOW (${limits.maxWeight} kg)`,
                            position: 'right',
                            fill: '#dc2626'
                        }}
                    />

                    {/* Points */}
                    {takeoffPoint && (
                        <Scatter
                            name="Takeoff"
                            data={[{ ...takeoffPoint, dataType: 'takeoff' }]}
                            shape={<CustomScatterTakeoff />}
                        />
                    )}

                    {landingPoint && (
                        <Scatter
                            name="Landing"
                            data={[{ ...landingPoint, dataType: 'landing' }]}
                            shape={<CustomScatterLanding />}
                        />
                    )}

                    <Tooltip content={<CustomTooltip />} />
                    <Legend content={<CustomLegend />} />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};

// Custom scatter shapes
const CustomScatterTakeoff = (props: any) => {
    const { cx, cy } = props;
    return (
        <Plane
            x={cx - 12}
            y={cy - 12}
            size={24}
            className="text-orange-500 rotate-45"
        />
    );
};

const CustomScatterLanding = (props: any) => {
    const { cx, cy } = props;
    return (
        <PlaneLanding
            x={cx - 12}
            y={cy - 12}
            size={24}
            className="text-green-500 -rotate-45"
        />
    );
};

export default CGEnvelopeVisualization;