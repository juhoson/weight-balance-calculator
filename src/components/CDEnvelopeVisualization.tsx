import type { FC } from 'react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
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

interface CGEnvelopeProps {
    envelopePoints: EnvelopePoint[];
    currentPoint?: EnvelopePoint;
    limits: {
        maxWeight: number;
        minWeight: number;
        forwardCG: number;
        aftCG: number;
    };
}

const CGEnvelopeVisualization: FC<CGEnvelopeProps> = ({
                                                                envelopePoints,
                                                                currentPoint,
                                                                limits
                                                            }) => {
    const boundaryData = envelopePoints.map(point => ({
        cg: point.cg,
        weight: point.weight,
    }));

    const currentData = currentPoint ? [{
        cg: currentPoint.cg,
        weight: currentPoint.weight,
        z: 1
    }] : [];

    return (
        <div className="w-full h-96 p-4">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                    margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
                >
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
                    <ZAxis range={[100]} />

                    <Scatter
                        name="Envelope"
                        data={boundaryData}
                        line={{ stroke: '#8884d8' }}
                        fill="#8884d8"
                        lineJointType="monotoneX"
                    />

                    {currentPoint && (
                        <Scatter
                            name="Current Position"
                            data={currentData}
                            fill="#ff0000"
                            shape="circle"
                        />
                    )}

                    <ReferenceLine
                        x={limits.forwardCG}
                        stroke="red"
                        strokeDasharray="3 3"
                    >
                        <Label value="Forward CG Limit" angle={90} position="insideBottom" />
                    </ReferenceLine>

                    <ReferenceLine
                        x={limits.aftCG}
                        stroke="red"
                        strokeDasharray="3 3"
                    >
                        <Label value="Aft CG Limit" angle={90} position="insideBottom" />
                    </ReferenceLine>

                    <ReferenceLine
                        y={limits.maxWeight}
                        stroke="red"
                        strokeDasharray="3 3"
                    >
                        <Label value="Max Weight" position="insideRight" />
                    </ReferenceLine>

                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-white p-2 border border-gray-200 rounded shadow">
                                        <p>CG: {payload[0].payload.cg.toFixed(2)} m</p>
                                        <p>Weight: {payload[0].payload.weight.toFixed(1)} kg</p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Legend />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};
export default CGEnvelopeVisualization;