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
                <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200">
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

    const CustomLegend = ({ payload }: any) => (
        <div className="flex justify-center gap-6 mt-4 mb-8">
            {payload.map((entry: any, index: number) => (
                <div key={index} className="flex items-center gap-2">
                    {entry.value === 'Takeoff' ? (
                        <>
                            <Plane size={16} className="text-orange-500 rotate-45" />
                            <span className="text-sm font-medium">Takeoff</span>
                        </>
                    ) : entry.value === 'Landing' ? (
                        <>
                            <PlaneLanding size={16} className="text-green-500 -rotate-45" />
                            <span className="text-sm font-medium">Landing</span>
                        </>
                    ) : (
                        <>
                            <div className="w-3 h-3 rounded-full bg-blue-500 opacity-70" />
                            <span className="text-sm font-medium">Envelope</span>
                        </>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="w-full h-[600px] p-4"> {/* Increased height for better visibility */}
            <ResponsiveContainer>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 70, left: 60 }}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#E5E7EB"
                    />
                    <XAxis
                        type="number"
                        dataKey="cg"
                        domain={[limits.forwardCG, limits.aftCG]}
                        tickFormatter={(value) => value.toFixed(2)}
                        stroke="#6B7280"
                    >
                        <Label
                            value="Center of Gravity (meters)"
                            position="bottom"
                            offset={40}
                            style={{ fill: '#374151', fontSize: 14 }}
                        />
                    </XAxis>
                    <YAxis
                        type="number"
                        dataKey="weight"
                        domain={[limits.minWeight, limits.maxWeight]}
                        tickFormatter={(value) => value.toFixed(0)}
                        stroke="#6B7280"
                    >
                        <Label
                            value="Weight (kg)"
                            angle={-90}
                            position="left"
                            offset={40}
                            style={{ fill: '#374151', fontSize: 14 }}
                        />
                    </YAxis>

                    {/* Envelope boundary */}
                    <Scatter
                        name="Envelope"
                        data={envelopePoints.map(point => ({ ...point, dataType: 'boundary' }))}
                        line={{ stroke: '#3B82F6', strokeWidth: 2 }}
                        fill="#3B82F6"
                        lineJointType="linear"
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

                    {/* Reference lines for MTOW and CG limits */}
                    <ReferenceLine
                        y={limits.maxWeight}
                        stroke="#DC2626"
                        strokeDasharray="3 3"
                        label={{
                            value: 'MTOW',
                            position: 'right',
                            fill: '#DC2626'
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