import type { FC } from 'react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Line,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Label
} from 'recharts';

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
                        line={{ stroke: '#8884d8' }}
                        fill="#8884d8"
                        lineJointType="monotoneX"
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

                    {/* Takeoff point */}
                    {takeoffPoint && (
                        <Scatter
                            name="Takeoff"
                            data={takeoffData}
                            fill="#ff0000"
                            shape="triangle"
                        />
                    )}

                    {/* Landing point */}
                    {landingPoint && (
                        <Scatter
                            name="Landing"
                            data={landingData}
                            fill="#00ff00"
                            shape="square"
                        />
                    )}

                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CGEnvelopeVisualization;