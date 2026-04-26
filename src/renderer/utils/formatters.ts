/**
 * Compact duration: "42s" / "3.5m" / "2.1h".
 * Used in cycle timeline, stage list, loop dashboard.
 */
export function formatDurationCompact(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/**
 * Short duration with integer seconds: "42s" / "3m 15s".
 * Used in agent step list and elsewhere where ms-precision is unnecessary.
 */
export function formatDurationShort(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

/**
 * Detailed duration with null fallback and ms precision:
 * "--" / "850ms" / "42s" / "3m 15s" / "2h 5m".
 * Used in StatsBar.
 */
export function formatDurationDetailed(ms: number | null, fallback = "--"): string {
  if (ms == null) return fallback;
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

/**
 * USD cost with 3-decimal precision and null fallback.
 */
export function formatCost(usd: number | null, fallback = "--"): string {
  if (usd == null) return fallback;
  return `$${usd.toFixed(3)}`;
}

/**
 * Token count with k/M abbreviation and null fallback.
 */
export function formatTokens(n: number | null, fallback = "--"): string {
  if (n == null) return fallback;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
