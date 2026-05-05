"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DIRECTIONS, DIRECTION_REPORT_COLORS, WEIGHT_FIELD_BY_DIRECTION } from "@/lib/directions";

const DIRECTION_CONFIG = DIRECTIONS.map((d) => ({
  key: WEIGHT_FIELD_BY_DIRECTION[d.key],
  label: d.label,
  color: DIRECTION_REPORT_COLORS[d.key],
}));

interface DirectionTrendDataPoint {
  cycleName: string;
  downward: number | null;
  upward: number | null;
  lateral: number | null;
  self: number | null;
  external: number | null;
}

interface DirectionTrendChartProps {
  data: DirectionTrendDataPoint[];
}

export function DirectionTrendChart({ data }: DirectionTrendChartProps) {
  const activeDirections = useMemo(
    () => DIRECTION_CONFIG.filter((rel) => data.some((d) => d[rel.key] !== null)),
    [data]
  );

  if (data.length === 0 || activeDirections.length === 0) {
    return (
      <div className="flex items-center justify-center h-[340px] text-[14px] text-gray-400 uppercase tracking-wider">
        No direction data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#DDDDDD"
          vertical={false}
        />
        <XAxis
          dataKey="cycleName"
          tick={{ fontSize: 11, fill: "#888888" }}
          axisLine={{ stroke: "#DDDDDD" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 5]}
          tick={{ fontSize: 11, fill: "#888888" }}
          axisLine={false}
          tickLine={false}
          tickCount={6}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 0,
            border: "1px solid #DDDDDD",
            fontSize: 13,
          }}
          formatter={(value, name) => [
            Number(value)?.toFixed(2) ?? "–",
            String(name),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        {activeDirections.map((rel) => (
          <Line
            key={rel.key}
            type="monotone"
            dataKey={rel.key}
            name={rel.label}
            stroke={rel.color}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 5, fill: rel.color, stroke: "#fff", strokeWidth: 2 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
