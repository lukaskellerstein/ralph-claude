import { CheckCircle, GitBranch } from "lucide-react";
import type { AgentStep } from "../../../../core/types.js";
import { StepTimestamp } from "../primitives/StepTimestamp.js";

interface SubagentLifecycleStepProps {
  step: AgentStep;
  timestamp?: string;
  delta?: string;
  onSubagentClick?: (subagentId: string) => void;
}

const SPAWN_COLOR = "hsl(263, 82%, 58%)";

/**
 * Renders both subagent_spawn and subagent_result steps.
 * Spawn shows the subagent type + description; result is a thinner success pill.
 * Both are clickable when onSubagentClick is provided — clicking opens the
 * subagent detail view.
 */
export function SubagentLifecycleStep({
  step,
  timestamp,
  delta,
  onSubagentClick,
}: SubagentLifecycleStepProps) {
  const meta = step.metadata ?? {};
  const subId = (meta.subagentId as string) || "";

  if (step.type === "subagent_spawn") {
    const rawType = (meta.subagentType as string) || "subagent";
    const subType = rawType === "unknown" && subId ? subId.slice(0, 8) : rawType;
    const desc = (meta.description as string) || null;

    return (
      <div
        onClick={subId && onSubagentClick ? () => onSubagentClick(subId) : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          borderRadius: "var(--radius-lg)",
          border: `2px solid color-mix(in srgb, ${SPAWN_COLOR} 60%, transparent)`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${SPAWN_COLOR} 22%, transparent) 0%, color-mix(in srgb, ${SPAWN_COLOR} 10%, transparent) 100%)`,
          boxShadow: `0 4px 24px color-mix(in srgb, ${SPAWN_COLOR} 18%, transparent), inset 0 1px 0 color-mix(in srgb, ${SPAWN_COLOR} 15%, transparent)`,
          cursor: onSubagentClick ? "pointer" : undefined,
          transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        }}
        onMouseEnter={(e) => {
          if (onSubagentClick) {
            e.currentTarget.style.borderColor = SPAWN_COLOR;
            e.currentTarget.style.boxShadow = `0 6px 32px color-mix(in srgb, ${SPAWN_COLOR} 28%, transparent), inset 0 1px 0 color-mix(in srgb, ${SPAWN_COLOR} 20%, transparent)`;
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (onSubagentClick) {
            e.currentTarget.style.borderColor = `color-mix(in srgb, ${SPAWN_COLOR} 60%, transparent)`;
            e.currentTarget.style.boxShadow = `0 4px 24px color-mix(in srgb, ${SPAWN_COLOR} 18%, transparent), inset 0 1px 0 color-mix(in srgb, ${SPAWN_COLOR} 15%, transparent)`;
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: `color-mix(in srgb, ${SPAWN_COLOR} 30%, transparent)`,
            border: `1px solid color-mix(in srgb, ${SPAWN_COLOR} 40%, transparent)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <GitBranch size={17} style={{ color: SPAWN_COLOR }} />
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: SPAWN_COLOR,
          }}
        >
          Subagent
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.77rem",
            fontWeight: 600,
            color: "var(--foreground)",
            background: `color-mix(in srgb, ${SPAWN_COLOR} 15%, transparent)`,
            padding: "2px 10px",
            borderRadius: "var(--radius)",
          }}
        >
          {subType}
        </span>
        {subId && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.68rem",
              color: "var(--foreground-dim)",
              padding: "1px 6px",
              borderRadius: "var(--radius)",
              background: "hsla(0, 0%, 100%, 0.06)",
            }}
          >
            {subId}
          </span>
        )}
        {desc && (
          <span
            style={{
              fontSize: "0.77rem",
              color: "var(--foreground-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={desc}
          >
            {desc}
          </span>
        )}
        <StepTimestamp timestamp={timestamp} delta={delta} />
      </div>
    );
  }

  // subagent_result
  return (
    <div
      onClick={subId && onSubagentClick ? () => onSubagentClick(subId) : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderRadius: "var(--radius-lg)",
        border: `1.5px solid color-mix(in srgb, var(--status-success) 40%, transparent)`,
        background: `linear-gradient(135deg, color-mix(in srgb, var(--status-success) 12%, transparent) 0%, color-mix(in srgb, var(--status-success) 5%, transparent) 100%)`,
        cursor: onSubagentClick ? "pointer" : undefined,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (onSubagentClick)
          e.currentTarget.style.borderColor = `color-mix(in srgb, var(--status-success) 70%, transparent)`;
      }}
      onMouseLeave={(e) => {
        if (onSubagentClick)
          e.currentTarget.style.borderColor = `color-mix(in srgb, var(--status-success) 40%, transparent)`;
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `color-mix(in srgb, var(--status-success) 20%, transparent)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <CheckCircle size={15} style={{ color: "var(--status-success)" }} />
      </div>
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--status-success)",
        }}
      >
        Subagent Completed
      </span>
      {subId && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.68rem",
            color: "var(--foreground-dim)",
            padding: "1px 6px",
            borderRadius: "var(--radius)",
            background: "hsla(0, 0%, 100%, 0.06)",
          }}
        >
          {subId}
        </span>
      )}
      <StepTimestamp timestamp={timestamp} delta={delta} />
    </div>
  );
}
