// ── Spec-Kit Types (parsed from tasks.md for UI display) ──

export interface Phase {
  number: number;
  name: string;
  purpose: string;
  tasks: Task[];
  status: "complete" | "partial" | "not_started";
}

export interface Task {
  id: string;
  userStory: string | null;
  priority: string | null;
  description: string;
  status: "done" | "not_done" | "code_exists" | "in_progress";
  lineNumber: number;
  phase: number;
}

// ── Agent Execution Types ──

export type StepType =
  | "debug"
  | "user_message"
  | "thinking"
  | "text"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "skill_invoke"
  | "skill_result"
  | "subagent_spawn"
  | "subagent_result"
  | "completed"
  | "error";

export interface AgentStep {
  id: string;
  sequenceIndex: number;
  type: StepType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  durationMs: number | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface SubagentInfo {
  id: string;
  subagentId: string;
  subagentType: string;
  description: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ── Loop Stage Types ──

export type LoopStageType =
  | "clarification"
  | "constitution"
  | "gap_analysis"
  | "specify"
  | "plan"
  | "tasks"
  | "implement"
  | "verify"
  | "learnings";

export interface LoopStage {
  type: LoopStageType;
  specDir?: string;
  phaseNumber?: number;
  startedAt: string;
  completedAt?: string;
  costUsd: number;
  durationMs: number;
  result?: string;
}

export type GapAnalysisDecision =
  | { type: "NEXT_FEATURE"; name: string; description: string }
  | { type: "RESUME_FEATURE"; specDir: string }
  | { type: "REPLAN_FEATURE"; specDir: string }
  | { type: "GAPS_COMPLETE" };

export interface LoopCycle {
  id: string;
  runId: string;
  cycleNumber: number;
  featureName: string | null;
  specDir: string | null;
  decision: GapAnalysisDecision;
  stages: LoopStage[];
  status: "running" | "completed" | "failed" | "skipped";
  costUsd: number;
  durationMs: number;
  startedAt: string;
  completedAt?: string;
}

export interface FailureRecord {
  specDir: string;
  implFailures: number;
  replanFailures: number;
}

export type TerminationReason =
  | "gaps_complete"
  | "budget_exceeded"
  | "max_cycles_reached"
  | "user_abort";

export interface LoopTermination {
  reason: TerminationReason;
  cyclesCompleted: number;
  totalCostUsd: number;
  totalDurationMs: number;
  featuresCompleted: string[];
  featuresSkipped: string[];
}

// ── Configuration ──

export interface RunConfig {
  projectDir: string;
  specDir: string;
  mode: "plan" | "build" | "loop";
  model: string;
  maxIterations: number;
  maxTurns: number;
  phases: number[] | "all";
  runAllSpecs?: boolean;

  // Loop-mode fields (only relevant when mode === "loop")
  description?: string;
  descriptionFile?: string;
  fullPlanPath?: string;
  maxLoopCycles?: number;
  maxBudgetUsd?: number;
}

// ── Events: Orchestrator → UI ──

export type OrchestratorEvent =
  | { type: "run_started"; config: RunConfig; runId: string; branchName: string }
  | { type: "spec_started"; specDir: string }
  | { type: "spec_completed"; specDir: string; phasesCompleted: number }
  | { type: "phase_started"; phase: Phase; iteration: number; phaseTraceId: string }
  | { type: "agent_step"; step: AgentStep }
  | { type: "subagent_started"; info: SubagentInfo }
  | { type: "subagent_completed"; subagentId: string }
  | { type: "tasks_updated"; phases: Phase[] }
  | {
      type: "phase_completed";
      phase: Phase;
      cost: number;
      durationMs: number;
    }
  | {
      type: "run_completed";
      totalCost: number;
      totalDuration: number;
      phasesCompleted: number;
      branchName: string;
      prUrl: string | null;
    }
  | { type: "error"; message: string; phaseNumber?: number }
  // Loop mode events
  | { type: "clarification_started"; runId: string }
  | { type: "clarification_question"; runId: string; question: string }
  | { type: "clarification_completed"; runId: string; fullPlanPath: string }
  | { type: "loop_cycle_started"; runId: string; cycleNumber: number }
  | {
      type: "loop_cycle_completed";
      runId: string;
      cycleNumber: number;
      decision: string;
      featureName: string | null;
      specDir: string | null;
      costUsd: number;
    }
  | {
      type: "stage_started";
      runId: string;
      cycleNumber: number;
      stage: LoopStageType;
      specDir?: string;
      phaseNumber?: number;
    }
  | {
      type: "stage_completed";
      runId: string;
      cycleNumber: number;
      stage: LoopStageType;
      costUsd: number;
      durationMs: number;
    }
  | { type: "loop_terminated"; runId: string; termination: LoopTermination };

export type EmitFn = (event: OrchestratorEvent) => void;
