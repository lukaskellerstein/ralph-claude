import { useState } from "react";
import { Play } from "lucide-react";

interface LoopStartPanelProps {
  projectDir: string;
  isRunning: boolean;
  onStart: (config: {
    description?: string;
    descriptionFile?: string;
    fullPlanPath?: string;
    maxLoopCycles?: number;
    maxBudgetUsd?: number;
  }) => void;
}

export function LoopStartPanel({ projectDir, isRunning, onStart }: LoopStartPanelProps) {
  const [description, setDescription] = useState("");
  const [fullPlanPath, setFullPlanPath] = useState("");
  const [maxCycles, setMaxCycles] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const canStart = !isRunning && (description.trim().length > 0 || fullPlanPath.trim().length > 0);

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      description: description.trim() || undefined,
      fullPlanPath: fullPlanPath.trim() || undefined,
      maxLoopCycles: maxCycles ? parseInt(maxCycles, 10) : undefined,
      maxBudgetUsd: maxBudget ? parseFloat(maxBudget) : undefined,
    });
  };

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <h2 style={{
        fontSize: "1.1rem",
        fontWeight: 600,
        color: "var(--foreground)",
        marginBottom: 16,
      }}>
        Autonomous Loop
      </h2>

      <p style={{
        fontSize: "0.82rem",
        color: "var(--foreground-muted)",
        marginBottom: 20,
        lineHeight: 1.5,
      }}>
        Describe what you want to build. Ralph will conduct a clarification session,
        produce a plan, then autonomously implement each feature in cycles.
      </p>

      {/* Description textarea */}
      <div style={{ marginBottom: 16 }}>
        <label style={{
          display: "block",
          fontSize: "0.78rem",
          fontWeight: 500,
          color: "var(--foreground-muted)",
          marginBottom: 6,
        }}>
          Project Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you want to build..."
          disabled={isRunning}
          style={{
            width: "100%",
            minHeight: 120,
            padding: 10,
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface-elevated)",
            color: "var(--foreground)",
            fontSize: "0.82rem",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>

      {/* OR divider */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
        color: "var(--foreground-dim)",
        fontSize: "0.75rem",
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        OR
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      {/* Full plan path */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          display: "block",
          fontSize: "0.78rem",
          fontWeight: 500,
          color: "var(--foreground-muted)",
          marginBottom: 6,
        }}>
          Existing full_plan.md Path (skip clarification)
        </label>
        <input
          type="text"
          value={fullPlanPath}
          onChange={(e) => setFullPlanPath(e.target.value)}
          placeholder=".specify/full_plan.md"
          disabled={isRunning}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface-elevated)",
            color: "var(--foreground)",
            fontSize: "0.82rem",
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
        />
      </div>

      {/* Budget controls */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <label style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--foreground-muted)",
            marginBottom: 6,
          }}>
            Max Cycles
          </label>
          <input
            type="number"
            min="1"
            value={maxCycles}
            onChange={(e) => setMaxCycles(e.target.value)}
            placeholder="unlimited"
            disabled={isRunning}
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--surface-elevated)",
              color: "var(--foreground)",
              fontSize: "0.82rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--foreground-muted)",
            marginBottom: 6,
          }}>
            Max Budget (USD)
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            placeholder="unlimited"
            disabled={isRunning}
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--surface-elevated)",
              color: "var(--foreground)",
              fontSize: "0.82rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          padding: "10px 16px",
          borderRadius: "var(--radius)",
          fontSize: "0.88rem",
          fontWeight: 600,
          background: canStart ? "var(--primary)" : "var(--surface-elevated)",
          color: canStart ? "#fff" : "var(--foreground-disabled)",
          cursor: canStart ? "pointer" : "not-allowed",
          border: "none",
          transition: "background 0.15s",
        }}
      >
        <Play size={14} />
        Start Autonomous Loop
      </button>
    </div>
  );
}
