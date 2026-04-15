import { CheckCircle, AlertCircle, XCircle, Clock } from "lucide-react";
import type { LoopTermination } from "../../../core/types.js";

interface LoopSummaryProps {
  termination: LoopTermination;
}

const REASON_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  gaps_complete: {
    label: "All features completed",
    icon: <CheckCircle size={16} />,
    color: "var(--status-success)",
  },
  budget_exceeded: {
    label: "Budget limit reached",
    icon: <AlertCircle size={16} />,
    color: "var(--status-warning, #f59e0b)",
  },
  max_cycles_reached: {
    label: "Max cycles reached",
    icon: <Clock size={16} />,
    color: "var(--status-warning, #f59e0b)",
  },
  user_abort: {
    label: "Stopped by user",
    icon: <XCircle size={16} />,
    color: "var(--status-error)",
  },
};

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
  return `${(ms / 3_600_000).toFixed(1)} hr`;
}

export function LoopSummary({ termination }: LoopSummaryProps) {
  const reason = REASON_CONFIG[termination.reason] ?? REASON_CONFIG.user_abort;

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: "40px auto" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 20,
        color: reason.color,
      }}>
        {reason.icon}
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
          Loop Complete
        </h2>
      </div>

      <p style={{
        fontSize: "0.88rem",
        color: "var(--foreground-muted)",
        marginBottom: 24,
      }}>
        {reason.label}
      </p>

      {/* Stats grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 24,
      }}>
        <StatCard label="Cycles" value={String(termination.cyclesCompleted)} />
        <StatCard label="Cost" value={termination.totalCostUsd > 0 ? `$${termination.totalCostUsd.toFixed(2)}` : "n/a"} />
        <StatCard label="Duration" value={formatDuration(termination.totalDurationMs)} />
        <StatCard label="Features" value={`${termination.featuresCompleted.length} done, ${termination.featuresSkipped.length} skipped`} />
      </div>

      {/* Feature lists */}
      {termination.featuresCompleted.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--status-success)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Completed
          </h3>
          {termination.featuresCompleted.map((f) => (
            <div key={f} style={{
              fontSize: "0.82rem",
              color: "var(--foreground-muted)",
              padding: "3px 0",
            }}>
              {f}
            </div>
          ))}
        </div>
      )}

      {termination.featuresSkipped.length > 0 && (
        <div>
          <h3 style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--status-error)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Skipped
          </h3>
          {termination.featuresSkipped.map((f) => (
            <div key={f} style={{
              fontSize: "0.82rem",
              color: "var(--foreground-muted)",
              padding: "3px 0",
            }}>
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: "var(--radius)",
      background: "var(--surface-elevated)",
      border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: "0.68rem",
        color: "var(--foreground-dim)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "0.92rem",
        fontWeight: 600,
        color: "var(--foreground)",
        fontFamily: "var(--font-mono)",
      }}>
        {value}
      </div>
    </div>
  );
}
