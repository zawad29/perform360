"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Users, MessageCircle, Star, Target } from "lucide-react";
import {
  deriveSelfOtherGap,
  deriveRaterConsensus,
  deriveRelationshipPattern,
  deriveStrongestCompetency,
  deriveBiggestGrowthArea,
} from "@/lib/report-insights";
import type { InsightTileData } from "@/lib/report-insights";
import type { DirectionScores, DirectionQuestionCounts, QuestionDetail, CategoryScore } from "@/types/report";

interface KeyInsightsProps {
  scoresByDirection: DirectionScores;
  directionQuestionCounts?: DirectionQuestionCounts;
  questionDetails: QuestionDetail[];
  categoryScores: CategoryScore[];
}

const ICON_MAP: Record<InsightTileData["iconName"], React.ReactNode> = {
  minus: <Minus size={16} strokeWidth={2} />,
  "trending-up": <TrendingUp size={16} strokeWidth={2} />,
  "trending-down": <TrendingDown size={16} strokeWidth={2} />,
  "message-circle": <MessageCircle size={16} strokeWidth={2} />,
  users: <Users size={16} strokeWidth={2} />,
  star: <Star size={16} strokeWidth={2} />,
  target: <Target size={16} strokeWidth={2} />,
};

// Grid cols that adapts to tile count — never more than 3 per row
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-3",
};

export function KeyInsights({
  scoresByDirection,
  directionQuestionCounts,
  questionDetails,
  categoryScores,
}: KeyInsightsProps) {
  const tiles = useMemo(() => {
    const result: InsightTileData[] = [];

    const gap = deriveSelfOtherGap(scoresByDirection, directionQuestionCounts);
    if (gap) result.push(gap);

    const consensus = deriveRaterConsensus(questionDetails);
    if (consensus) result.push(consensus);

    const pattern = deriveRelationshipPattern(scoresByDirection, directionQuestionCounts);
    if (pattern) result.push(pattern);

    const strongest = deriveStrongestCompetency(categoryScores);
    if (strongest) result.push(strongest);

    const growth = deriveBiggestGrowthArea(categoryScores);
    if (growth) result.push(growth);

    return result;
  }, [scoresByDirection, directionQuestionCounts, questionDetails, categoryScores]);

  if (tiles.length === 0) return null;

  const gridClass = GRID_COLS[tiles.length] ?? "grid-cols-2 lg:grid-cols-3";

  return (
    <Card padding="md" className="mb-6">
      <CardHeader>
        <CardTitle>Key Insights</CardTitle>
      </CardHeader>
      <div className={`grid ${gridClass} gap-3`}>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="bg-white border border-gray-900 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 flex items-center justify-center shrink-0 text-gray-900">
                {ICON_MAP[tile.iconName]}
              </div>
              <span className="text-[12px] font-medium text-gray-500 uppercase tracking-caps">
                {tile.label}
              </span>
            </div>
            <p className="text-[20px] font-bold leading-tight text-gray-900">
              {tile.value}
            </p>
            <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
              {tile.description}
            </p>
            {tile.footnote && (
              <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                {tile.footnote}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
