import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import type { AgentStep } from "../../../core/types.js";
import { AgentStepItem } from "./AgentStepItem.js";

const LINE_LEFT = 20; // center of the vertical line
const DOT_SIZE = 9;
const CONTENT_LEFT = 42; // padding-left for step content

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDelta(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${(ms / 60_000).toFixed(1)}m`;
}

interface AgentStepListProps {
  steps: AgentStep[];
  isRunning: boolean;
  runId?: string;
  phaseTraceId?: string;
  phaseLabel?: string;
}

function CopyBadge({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <span
      title={copied ? "Copied!" : `Click to copy`}
      onClick={handleClick}
      style={{
        fontSize: "0.68rem",
        padding: "1px 5px",
        borderRadius: "var(--radius)",
        background: copied
          ? "color-mix(in srgb, var(--status-success) 15%, var(--surface-elevated))"
          : "var(--surface-elevated)",
        border: `1px solid ${copied ? "var(--status-success)" : "var(--border)"}`,
        color: copied ? "var(--status-success)" : "var(--foreground-dim)",
        fontFamily: "var(--font-mono)",
        textTransform: "none",
        letterSpacing: "normal",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      {label}:{value}
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </span>
  );
}

interface GroupedStep {
  step: AgentStep;
  resultSteps: AgentStep[];
}

export function AgentStepList({ steps, isRunning, runId, phaseTraceId, phaseLabel }: AgentStepListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Group steps: pair tool_result/tool_error with their originating tool_call
  // using toolUseId from metadata. This handles parallel tool calls correctly
  // where results may arrive in any order after multiple calls.
  // Filter out redundant subagent/skill steps (shown in SubagentList instead).
  const grouped = useMemo<GroupedStep[]>(() => {
    const redundant = new Set([
      "subagent_spawn", "subagent_result",
    ]);
    const result: GroupedStep[] = [];
    const callsByToolUseId = new Map<string, GroupedStep>();

    for (const step of steps) {
      if (redundant.has(step.type)) continue;

      if (step.type === "tool_result" || step.type === "tool_error" || step.type === "skill_result") {
        const toolUseId = step.metadata?.toolUseId as string | undefined;
        const matchingCall = toolUseId ? callsByToolUseId.get(toolUseId) : null;
        if (matchingCall) {
          matchingCall.resultSteps.push(step);
          continue;
        }
      }

      const grouped: GroupedStep = { step, resultSteps: [] };
      result.push(grouped);

      if (step.type === "tool_call" || step.type === "skill_invoke") {
        const toolUseId = step.metadata?.toolUseId as string | undefined;
        if (toolUseId) {
          callsByToolUseId.set(toolUseId, grouped);
        }
      }
    }
    return result;
  }, [steps]);

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isRunning || !autoScrollRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [grouped.length, isRunning]);

  // Auto-scroll tracking
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.77rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--foreground-dim)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Agent Trace
        {phaseLabel && (
          <span
            style={{
              fontSize: "0.77rem",
              padding: "1px 6px",
              borderRadius: "var(--radius)",
              background: "var(--primary-muted)",
              color: "var(--foreground-muted)",
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            {phaseLabel}
          </span>
        )}
        {(runId || phaseTraceId) && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {phaseTraceId && <CopyBadge label="agent" value={phaseTraceId} />}
            {runId && <CopyBadge label="run" value={runId} />}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px 14px",
        }}
      >
        {/* Content wrapper — line lives here so it spans full content height */}
        <div style={{ position: "relative" }}>
          {/* Vertical line — spans the full height of content */}
          {grouped.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: LINE_LEFT - 1,
                top: 0,
                bottom: 0,
                width: 2,
                background: "var(--foreground-dim)",
                opacity: 0.4,
                borderRadius: 1,
              }}
            />
          )}

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {grouped.map(({ step, resultSteps }, idx) => {
              const prevStep = idx > 0 ? grouped[idx - 1].step : null;
              const deltaMs =
                prevStep && step.createdAt && prevStep.createdAt
                  ? new Date(step.createdAt).getTime() -
                    new Date(prevStep.createdAt).getTime()
                  : null;

              return (
                <div
                  key={step.id}
                  className="step-item"
                  style={{
                    paddingLeft: CONTENT_LEFT,
                    position: "relative",
                  }}
                >
                  {/* Node dot — centered on the line */}
                  <div
                    style={{
                      position: "absolute",
                      left: LINE_LEFT - DOT_SIZE / 2,
                      top: 4,
                      width: DOT_SIZE,
                      height: DOT_SIZE,
                      borderRadius: "50%",
                      border: "2px solid var(--foreground-dim)",
                      background: "var(--surface)",
                      zIndex: 1,
                    }}
                  />

                  {/* Content */}
                  <AgentStepItem
                    step={step}
                    resultSteps={resultSteps}
                    timestamp={step.createdAt ? formatTime(step.createdAt) : undefined}
                    delta={deltaMs != null && deltaMs > 0 ? formatDelta(deltaMs) : undefined}
                  />
                </div>
              );
            })}
          </div>

          {/* Running indicator */}
          {isRunning && (
            <div
              style={{
                paddingLeft: CONTENT_LEFT,
                paddingTop: 12,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: LINE_LEFT - DOT_SIZE / 2,
                  top: 16,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  animation: "status-pulse 1.5s ease-out infinite",
                  zIndex: 1,
                }}
              />
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--foreground-dim)",
                  fontStyle: "italic",
                }}
              >
                Agent is working...
              </span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {grouped.length === 0 && !isRunning && (
          <div
            style={{
              textAlign: "center",
              paddingTop: 60,
              color: "var(--foreground-dim)",
              fontSize: "0.85rem",
            }}
          >
            Agent trace will appear here when a run starts.
          </div>
        )}
      </div>
    </div>
  );
}
