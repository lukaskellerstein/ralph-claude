import { formatDurationCompact } from "../../utils/formatters.js";

interface MetaBadgeProps {
  costUsd: number;
  durationMs: number;
}

/**
 * Compact "$0.42  3.5m" pill for showing run cost + duration alongside a step.
 * Renders nothing when both values are zero/negative.
 */
export function MetaBadge({ costUsd, durationMs }: MetaBadgeProps) {
  if (costUsd <= 0 && durationMs <= 0) return null;
  return (
    <span
      style={{
        display: "flex",
        gap: 8,
        fontSize: "0.68rem",
        fontFamily: "var(--font-mono)",
        color: "var(--foreground-dim)",
      }}
    >
      {costUsd > 0 && <span>${costUsd.toFixed(2)}</span>}
      {durationMs > 0 && <span>{formatDurationCompact(durationMs)}</span>}
    </span>
  );
}
