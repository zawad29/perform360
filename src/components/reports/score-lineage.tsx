"use client";

interface ScoreLineageChipProps {
  raw: number;
  weighted?: number | null;
  calibrated?: number | null;
  className?: string;
}

// Tiny inline disclosure of how a displayed score was derived.
// Renders the effective number with a hover tooltip listing the lineage
// (raw → weighted → calibrated). Used in Top/Bottom performer lists and
// the Individual Reports table on cycle Reports.
export function ScoreLineageChip({
  raw,
  weighted,
  calibrated,
  className,
}: ScoreLineageChipProps) {
  const effective =
    calibrated != null ? calibrated : weighted != null ? weighted : raw;
  const usesCalibrated = calibrated != null;
  const usesWeighted = !usesCalibrated && weighted != null;

  const lineageParts = [`raw ${raw.toFixed(2)}`];
  if (weighted != null) lineageParts.push(`weighted ${weighted.toFixed(2)}`);
  if (calibrated != null) lineageParts.push(`calibrated ${calibrated.toFixed(2)}`);
  const tooltip = lineageParts.join(" → ");

  return (
    <span
      title={tooltip}
      className={`inline-flex items-baseline gap-1 ${className ?? ""}`}
    >
      <span className="text-[13px] font-medium tabular-nums text-gray-900">
        {effective.toFixed(1)}
      </span>
      {(usesCalibrated || usesWeighted) && (
        <span
          className="text-[9px] uppercase tracking-caps text-gray-400"
          aria-label={usesCalibrated ? "Calibrated score" : "Weighted score"}
        >
          {usesCalibrated ? "cal" : "wt"}
        </span>
      )}
    </span>
  );
}
