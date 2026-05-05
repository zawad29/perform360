"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DIRECTIONS, DIRECTION_REPORT_COLORS, WEIGHT_FIELD_BY_DIRECTION } from "@/lib/directions";
import type { CategoryScore, DirectionScores } from "@/types/report";

interface CategoryDirectionData {
  category: string;
  scores: DirectionScores;
}

interface DirectionComparisonChartProps {
  categories: CategoryScore[];
  /** Per-category direction breakdown. If not provided, falls back to single-bar view. */
  categoryDirectionScores?: CategoryDirectionData[];
  overallDirection: DirectionScores;
}

export function DirectionComparisonChart({
  categories,
  categoryDirectionScores,
  overallDirection,
}: DirectionComparisonChartProps) {
  const data = useMemo(
    () =>
      categoryDirectionScores
        ? categoryDirectionScores.map((c) => ({
            category: c.category,
            Downward: c.scores.downward,
            Lateral: c.scores.lateral,
            Upward: c.scores.upward,
            Self: c.scores.self,
            External: c.scores.external,
          }))
        : categories.map((c) => ({
            category: c.category,
            Downward: overallDirection.downward,
            Lateral: overallDirection.lateral,
            Upward: overallDirection.upward,
            Self: overallDirection.self,
            External: overallDirection.external,
          })),
    [categoryDirectionScores, categories, overallDirection]
  );

  const activeBars = useMemo(
    () =>
      DIRECTIONS
        .filter((d) => overallDirection[WEIGHT_FIELD_BY_DIRECTION[d.key]] !== null)
        .map((d) => ({ key: d.label, color: DIRECTION_REPORT_COLORS[d.key] })),
    [overallDirection]
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-[14px] text-gray-400 uppercase tracking-wider">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
        barGap={2}
        barSize={16}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#DDDDDD" vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11, fill: "#888888" }}
          axisLine={{ stroke: "#DDDDDD" }}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis
          domain={[0, 5]}
          tick={{ fontSize: 11, fill: "#888888" }}
          axisLine={false}
          tickLine={false}
          tickCount={6}
        />
        <Tooltip
          contentStyle={{ borderRadius: 0, border: "1px solid #DDDDDD", fontSize: 13 }}
          formatter={(value) => [
            value !== null ? Number(value).toFixed(2) : "—",
            undefined,
          ]}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {activeBars.map((bar) => (
          <Bar key={bar.key} dataKey={bar.key} fill={bar.color} radius={[0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
