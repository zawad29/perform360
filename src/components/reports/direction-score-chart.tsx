"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { DIRECTIONS, DIRECTION_REPORT_COLORS } from "@/lib/directions";
import type { Direction } from "@/lib/directions";

interface DirectionScoreChartProps {
  downward: number | null;
  upward: number | null;
  lateral: number | null;
  self: number | null;
  external: number | null;
}

const COLOR_BY_LABEL: Record<string, string> = Object.fromEntries(
  DIRECTIONS.map((d) => [d.label, DIRECTION_REPORT_COLORS[d.key as Direction]])
);

export function DirectionScoreChart({
  downward,
  upward,
  lateral,
  self,
  external,
}: DirectionScoreChartProps) {
  const data = useMemo(
    () =>
      [
        { name: "Downward", score: downward },
        { name: "Upward", score: upward },
        { name: "Lateral", score: lateral },
        { name: "Self", score: self },
        { name: "External", score: external },
      ].filter((d): d is { name: string; score: number } => d.score !== null && d.score > 0),
    [downward, upward, lateral, self, external]
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[240px] text-[14px] text-gray-400 uppercase tracking-wider">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barSize={40} margin={{ bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DDDDDD" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "#888888" }}
          axisLine={{ stroke: "#DDDDDD" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 5]}
          tick={{ fontSize: 12, fill: "#888888" }}
          axisLine={false}
          tickLine={false}
          tickCount={6}
        />
        <Tooltip
          contentStyle={{ borderRadius: 0, border: "1px solid #DDDDDD", fontSize: 13 }}
          formatter={(value) => [Number(value).toFixed(2), "Avg Score"]}
        />
        <Bar dataKey="score" radius={[0, 0, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLOR_BY_LABEL[entry.name] ?? "#111111"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
