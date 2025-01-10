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
    Label,
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

const CustomScatterTakeoff = (props: any) => {
    const { cx, cy } = props;
    return (
        <Plane
            x={cx - 12}  // Offset to center the icon
            y={cy - 12}
            size={24}
            className="text-green-500 rotate-45"  // Rotate for takeoff angle
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
            className="text-yellow-500 -rotate-45"  // Rotate for landing angle
        />
    );
};

const CustomLegend = ({ payload }: any) => {
    return (
        <div className="flex gap-4 justify-center mb-8"> {/* Added margin bottom */}
            {payload.map((entry: any, index: number) => (
                <div key={`item-${index}`} className="flex items-center gap-2">
                    {entry.value === 'Envelope' ? (
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                    ) : (
                        <div className="flex items-center text-black"> {/* Force black color for text */}
                            {entry.value === 'Takeoff' ? (
                                <Plane size={16} className="text-orange-500 rotate-45" />
                            ) : (
                                <PlaneLanding size={16} className="text-green-500 -rotate-45" />
                            )}
                            <span className="ml-2">{entry.value}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const CGEnvelopeVisualization: React.FC<CGEnvelopeVisualizationProps> = ({
                                                                             envelopePoints,
                                                                             takeoffPoint,
                                                                             landingPoint,
                                                                             limits,
                                                                         }) => {
    const boundaryData = envelopePoints.map(point => ({
        cg: point.cg,
        weight: point.weight,
        dataType: 'boundary'
    }));

    // Add data type to differentiate points in tooltip
    const takeoffData = takeoffPoint ? [{
        ...takeoffPoint,
        dataType: 'takeoff'
    }] : [];

    const landingData = landingPoint ? [{
        ...landingPoint,
        dataType: 'landing'
    }] : [];

    // Create flight path line if both points exist
    const flightPathData = takeoffPoint && landingPoint ? [
        { cg: takeoffPoint.cg, weight: takeoffPoint.weight },
        { cg: landingPoint.cg, weight: landingPoint.weight }
    ] : [];

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length > 0) {
            const data = payload[0].payload;

            // Different content based on data type
            if (data.dataType === 'takeoff') {
                return (
                    <div className="bg-white p-2 border border-gray-200 rounded shadow">
                        <p className="font-semibold">Takeoff</p>
                        <p>CG: {data.cg.toFixed(2)} m</p>
                        <p>Weight: {data.weight.toFixed(1)} kg</p>
                    </div>
                );
            } else if (data.dataType === 'landing') {
                return (
                    <div className="bg-white p-2 border border-gray-200 rounded shadow">
                        <p className="font-semibold">Landing</p>
                        <p>CG: {data.cg.toFixed(2)} m</p>
                        <p>Weight: {data.weight.toFixed(1)} kg</p>
                    </div>
                );
            }
        }
        return null;
    };

    return (
        <div className="w-full h-96 p-4">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                    <CartesianGrid />
                    <XAxis
                        type="number"
                        dataKey="cg"
                        domain={[limits.forwardCG, limits.aftCG]}
                    >
                        <Label value="Center of Gravity (meters)" position="bottom" offset={20} />
                    </XAxis>
                    <YAxis
                        type="number"
                        dataKey="weight"
                        domain={[limits.minWeight, limits.maxWeight]}
                    >
                        <Label value="Weight (kg)" angle={-90} position="left" offset={20} />
                    </YAxis>

                    {/* Envelope boundary */}
                    <Scatter
                        name="Envelope"
                        data={boundaryData}
                        line={{ stroke: '#8884d8', type: 'linear' }}
                        fill="#8884d8"
                        lineJointType="linear"
                    />

                    {/* Flight path line */}
                    {flightPathData.length > 0 && (
                        <Line
                            data={flightPathData}
                            type="linear"
                            dataKey="weight"
                            stroke="#ff7300"
                            strokeWidth={2}
                            dot={false}
                        />
                    )}

                    {takeoffPoint && (
                        <Scatter
                            name="Takeoff"
                            data={takeoffData}
                            shape={<CustomScatterTakeoff />}
                        />
                    )}

                    {landingPoint && (
                        <Scatter
                            name="Landing"
                            data={landingData}
                            shape={<CustomScatterLanding />}
                        />
                    )}

                    <Tooltip content={<CustomTooltip />} />
                    <CustomLegend />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CGEnvelopeVisualization;