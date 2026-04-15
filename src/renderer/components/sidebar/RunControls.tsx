import { Play, Square } from "lucide-react";

interface RunControlsProps {
  canStart: boolean;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function RunControls({
  canStart,
  isRunning,
  onStart,
  onStop,
}: RunControlsProps) {
  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: "var(--radius)",
    fontWeight: 500,
    fontSize: "0.92rem",
    width: "100%",
    transition: "background 0.15s, opacity 0.15s",
  };

  if (!isRunning) {
    return (
      <button
        onClick={onStart}
        disabled={!canStart}
        style={{
          ...btnBase,
          background: canStart ? "var(--primary)" : "var(--surface-elevated)",
          color: canStart ? "#fff" : "var(--foreground-disabled)",
          opacity: canStart ? 1 : 0.5,
          cursor: canStart ? "pointer" : "not-allowed",
        }}
      >
        <Play size={14} />
        Start Run
      </button>
    );
  }

  return (
    <button
      onClick={onStop}
      style={{
        ...btnBase,
        background: "rgba(239, 68, 68, 0.15)",
        color: "var(--status-error)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
      }}
    >
      <Square size={14} />
      Stop Run
    </button>
  );
}
