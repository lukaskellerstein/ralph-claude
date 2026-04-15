import { CheckCircle, FileText, Loader2, Cog, Play } from "lucide-react";
import type { Phase, Task } from "../../../core/types.js";
import type { SpecSummary } from "../../hooks/useProject.js";
import { useState } from "react";

interface SpecCardProps {
  summary: SpecSummary;
  onClick: () => void;
  onStart: () => void;
  isActive?: boolean;
  isRunning?: boolean;
  activePhase?: Phase | null;
  activeTask?: Task | null;
}

function MiniProgress({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div
      style={{
        height: 4,
        borderRadius: 2,
        background: "var(--border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

export function SpecCard({ summary, onClick, onStart, isActive, isRunning, activePhase, activeTask }: SpecCardProps) {
  const [hovered, setHovered] = useState(false);
  const [playHovered, setPlayHovered] = useState(false);
  const isComplete = summary.doneTasks === summary.totalTasks && summary.totalTasks > 0;
  const showPlay = hovered && !isComplete && !isActive && !isRunning;
  const displayName = summary.name.split("/").pop() ?? summary.name;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12,
        padding: 16,
        background: hovered ? "var(--surface-hover)" : "var(--surface-elevated)",
        border: "1px solid",
        borderColor: isActive
          ? "var(--primary)"
          : hovered
            ? "var(--border-bright)"
            : "var(--border)",
        borderRadius: "var(--radius-lg)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        minWidth: 180,
        ...(isActive ? { width: "100%", flexBasis: "100%" } : {}),
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isActive ? (
          <Loader2
            size={16}
            color="var(--primary)"
            style={{ animation: "spin 1s linear infinite" }}
          />
        ) : isComplete ? (
          <CheckCircle size={16} color="var(--status-success)" />
        ) : (
          <FileText size={16} color="var(--foreground-dim)" />
        )}
        <span
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "var(--foreground)",
            flex: 1,
          }}
        >
          {displayName}
        </span>
        {showPlay && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
            onMouseEnter={() => setPlayHovered(true)}
            onMouseLeave={() => setPlayHovered(false)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: "var(--radius)",
              background: playHovered ? "var(--primary)" : "var(--primary-muted)",
              cursor: "pointer",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
            title="Run this spec only"
          >
            <Play size={12} color={playHovered ? "#fff" : "var(--primary)"} />
          </div>
        )}
        {isActive && (
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--primary)",
              background: "var(--primary-muted)",
              padding: "1px 6px",
              borderRadius: "var(--radius)",
            }}
          >
            Running
          </span>
        )}
      </div>

      {/* Active phase & task */}
      {isActive && activePhase && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: "0.8rem",
              color: "var(--primary)",
            }}
          >
            <span style={{ fontWeight: 600 }}>Phase {activePhase.number}</span>
            <span style={{ color: "var(--foreground-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activePhase.name}
            </span>
          </div>
          {activeTask && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                fontSize: "0.77rem",
                color: "var(--foreground-muted)",
                paddingLeft: 16,
              }}
            >
              <Cog
                size={10}
                color="var(--primary)"
                style={{ animation: "spin 2s linear infinite", flexShrink: 0, marginTop: 3 }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.73rem", flexShrink: 0 }}>
                {activeTask.id}
              </span>
              <span>
                {activeTask.description}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Phases */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.8rem",
              marginBottom: 4,
            }}
          >
            <span style={{ color: "var(--foreground-dim)" }}>Phases</span>
            <span
              style={{
                color: "var(--foreground-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                marginLeft: 12,
              }}
            >
              {summary.completedPhases}/{summary.totalPhases}
            </span>
          </div>
          <MiniProgress
            done={summary.completedPhases}
            total={summary.totalPhases}
            color="var(--status-info)"

          />
        </div>

        {/* Tasks */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.8rem",
              marginBottom: 4,
            }}
          >
            <span style={{ color: "var(--foreground-dim)" }}>Tasks</span>
            <span
              style={{
                color: "var(--foreground-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                marginLeft: 12,
              }}
            >
              {summary.doneTasks}/{summary.totalTasks}
            </span>
          </div>
          <MiniProgress
            done={summary.doneTasks}
            total={summary.totalTasks}
            color="var(--primary)"

          />
        </div>
      </div>
    </button>
  );
}
