import type { OrchestratorEvent, Phase, RunConfig, LoopStageType, LoopTermination } from "../core/types.js";
import type {
  RunRow,
  PhaseTraceRow,
  TraceStepRow,
  SubagentRow,
  SpecStats,
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
  getRunState(): Promise<{
    runId: string;
    projectDir: string;
    specDir: string;
    mode: string;
    model: string;
    phaseTraceId: string;
    phaseNumber: number;
    phaseName: string;
    currentCycle?: number;
    currentStage?: string;
    isClarifying?: boolean;
    loopsCompleted?: number;
  } | null>;

  // Orchestrator events
  onOrchestratorEvent(cb: (event: OrchestratorEvent) => void): () => void;

  // History
  listRuns(limit?: number): Promise<RunRow[]>;
  getRun(runId: string): Promise<{ run: RunRow; phases: PhaseTraceRow[] } | null>;
  getPhaseSteps(phaseTraceId: string): Promise<TraceStepRow[]>;
  getPhaseSubagents(phaseTraceId: string): Promise<SubagentRow[]>;
  getLatestPhaseTrace(projectDir: string, specDir: string, phaseNumber: number): Promise<PhaseTraceRow | null>;
  getSpecPhaseStats(projectDir: string, specDir: string): Promise<PhaseTraceRow[]>;
  getSpecAggregateStats(projectDir: string, specDir: string): Promise<SpecStats>;

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
