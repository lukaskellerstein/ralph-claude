import type { OrchestratorEvent, Phase, RunConfig } from "../core/types.js";
import type {
  RunRow,
  PhaseTraceRow,
  TraceStepRow,
  SubagentRow,
} from "../core/database.js";

interface RalphAPI {
  // Project
  openProject(): Promise<string | null>;
  listSpecs(dir: string): Promise<string[]>;
  parseSpec(dir: string, spec: string): Promise<Phase[]>;

  // Orchestrator
  startRun(config: RunConfig): Promise<void>;
  stopRun(): Promise<void>;
  isRunning(): Promise<boolean>;

  // Orchestrator events
  onOrchestratorEvent(cb: (event: OrchestratorEvent) => void): () => void;

  // History
  listRuns(limit?: number): Promise<RunRow[]>;
  getRun(runId: string): Promise<{ run: RunRow; phases: PhaseTraceRow[] } | null>;
  getPhaseSteps(phaseTraceId: string): Promise<TraceStepRow[]>;
  getPhaseSubagents(phaseTraceId: string): Promise<SubagentRow[]>;
  getLatestPhaseTrace(projectDir: string, specDir: string, phaseNumber: number): Promise<PhaseTraceRow | null>;

  // Window controls
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(cb: (maximized: boolean) => void): () => void;
}

declare global {
  interface Window {
    ralphAPI: RalphAPI;
  }
}

export {};
