import { useState, useEffect, useCallback, useMemo } from "react";
import type { StepType, LoopTermination, PrerequisiteCheck } from "../../../core/types.js";
import type { UiLoopCycle, UiLoopStage, LatestAction } from "../../hooks/useOrchestrator.js";
import type { SpecSummary } from "../../hooks/useProject.js";
import { ProcessStepper } from "./ProcessStepper.js";
import { useTimeline } from "../checkpoints/hooks/useTimeline.js";
import { PrerequisitesPhase } from "./phases/PrerequisitesPhase.js";
import { ClarificationPhase } from "./phases/ClarificationPhase.js";
import { LoopPhase } from "./phases/LoopPhase.js";
import { CompletionPhase } from "./phases/CompletionPhase.js";
type MacroPhase = "prerequisites" | "clarification" | "loop" | "completion";
type PhaseStatus = "pending" | "active" | "done";

export interface LoopDashboardProps {
  cycles: UiLoopCycle[];
  preCycleStages: UiLoopStage[];
  prerequisitesChecks: PrerequisiteCheck[];
  isCheckingPrerequisites: boolean;
  currentCycle: number | null;
  currentStage: StepType | null;
  isClarifying: boolean;
  isRunning: boolean;
  totalCost: number;
  loopTermination: LoopTermination | null;
  specSummaries: SpecSummary[];
  onStageClick: (step: UiLoopStage) => void;
  onImplPhaseClick: (phaseTraceId: string) => void;
  onSelectSpec: (specName: string) => void;
  debugBadge?: React.ReactNode;
  projectDir: string | null;
  /** Latest "interesting" agent step in the running stage — used for the live indicator. */
  latestAction?: LatestAction | null;
}

const CLARIFICATION_STAGE_TYPES = [
  "clarification", "clarification_product", "clarification_technical",
  "clarification_synthesis", "constitution", "manifest_extraction",
];

function deriveActivePhase(
  isCheckingPrerequisites: boolean,
  isClarifying: boolean,
  preCycleStages: UiLoopStage[],
  cycles: UiLoopCycle[],
  loopTermination: LoopTermination | null,
  isRunning: boolean
): MacroPhase {
  // Only advance to "completion" for genuine termination — not user aborts or budget stops
  if (loopTermination && !isRunning && loopTermination.reason === "gaps_complete") return "completion";
  const prerequisitesStage = preCycleStages.find((s) => s.type === "prerequisites");
  if (isCheckingPrerequisites || (prerequisitesStage?.status === "running")) return "prerequisites";
  if (!prerequisitesStage && isRunning && preCycleStages.length === 0) return "prerequisites";
  const anyClarificationRunning = preCycleStages.some(
    (s) => CLARIFICATION_STAGE_TYPES.includes(s.type) && s.status === "running"
  );
  if (isClarifying || anyClarificationRunning) return "clarification";
  if (cycles.length > 0) return "loop";
  const clarificationStages = preCycleStages.filter(
    (s) => CLARIFICATION_STAGE_TYPES.includes(s.type)
  );
  const anyClarificationDone = clarificationStages.some((s) => s.status === "completed");
  // All 5 expected stages must be completed to advance past clarification:
  // clarification_product, clarification_technical, clarification_synthesis,
  // constitution, manifest_extraction
  const allClarificationDone = clarificationStages.length >= 5
    && clarificationStages.every((s) => s.status === "completed");
  if (allClarificationDone && !isClarifying) return "loop";
  // Some done but not all — clarification is still active (paused mid-way)
  if (anyClarificationDone) return "clarification";
  if (prerequisitesStage?.status === "completed") return "clarification";
  return "prerequisites";
}

function derivePhaseStatus(
  phase: MacroPhase,
  activePhase: MacroPhase,
): PhaseStatus {
  const order: MacroPhase[] = ["prerequisites", "clarification", "loop", "completion"];
  const activeIdx = order.indexOf(activePhase);
  const phaseIdx = order.indexOf(phase);
  if (phaseIdx < activeIdx) return "done";
  if (phaseIdx === activeIdx) return "active";
  return "pending";
}

// ── Main Dashboard ──

export function LoopDashboard({
  cycles,
  preCycleStages,
  prerequisitesChecks,
  isCheckingPrerequisites,
  currentCycle,
  currentStage,
  isClarifying,
  isRunning,
  totalCost,
  loopTermination,
  specSummaries,
  onStageClick,
  onImplPhaseClick,
  onSelectSpec,
  debugBadge,
  projectDir,
  latestAction,
}: LoopDashboardProps) {
  // 010 — timeline snapshot drives the Steps tab projection: which cycles +
  // stages are "done" by virtue of having step-commits on the active path,
  // independent of which run useOrchestrator currently has loaded.
  const { snapshot } = useTimeline(projectDir);

  // Path-derived cycles + pre-cycle stages. When selectedPath is non-empty,
  // these REPLACE the orchestrator-supplied cycles/preCycleStages so the
  // Steps tab follows wherever HEAD is — not whichever run useOrchestrator
  // last cached. When selectedPath is empty (fresh project, HEAD on main with
  // no step-commits), we fall back to the orchestrator's view.
  //
  // Stages are inferred-completed up to the latest stage on the path —
  // some orchestrator stages (e.g. gap_analysis on lightweight projects)
  // don't always create a step-commit even when they run, so we'd otherwise
  // see weird "pending" gaps in the middle of a known-completed cycle.
  const pathDerived = useMemo(() => {
    const onPath = new Set(snapshot.selectedPath);
    const pathCommits = snapshot.commits.filter((c) => onPath.has(c.sha));
    const preCycle: UiLoopStage[] = [];
    const cyclesMap = new Map<number, UiLoopCycle>();
    const synth = (step: StepType, ts: string, key: string): UiLoopStage => ({
      type: step,
      status: "completed",
      agentRunId: key,
      costUsd: 0,
      durationMs: 0,
      startedAt: ts,
      completedAt: ts,
    });
    for (const c of pathCommits) {
      const stage = synth(c.step, c.timestamp, c.sha);
      if (c.cycleNumber === 0) {
        preCycle.push(stage);
      } else {
        let cyc = cyclesMap.get(c.cycleNumber);
        if (!cyc) {
          cyc = {
            cycleNumber: c.cycleNumber,
            featureName: null,
            specDir: null,
            decision: null,
            status: "running", // upgraded to "completed" below if learnings present
            costUsd: 0,
            stages: [],
            implementPhases: [],
            startedAt: c.timestamp,
          };
          cyclesMap.set(c.cycleNumber, cyc);
        }
        cyc.stages.push(stage);
        if (c.step === "learnings") cyc.status = "completed";
      }
    }

    // Fill in earlier stages in canonical order — if cycle N has any of
    // {plan, tasks, implement, verify, learnings} on path, then gap_analysis
    // / specify ran by definition, even if no step-commit was authored.
    const CYCLE_STAGE_ORDER: StepType[] = [
      "gap_analysis",
      "specify",
      "plan",
      "tasks",
      "implement",
      "implement_fix",
      "verify",
      "learnings",
    ];
    for (const cyc of cyclesMap.values()) {
      const present = new Set(cyc.stages.map((s) => s.type));
      let lastIdx = -1;
      for (let i = CYCLE_STAGE_ORDER.length - 1; i >= 0; i--) {
        if (present.has(CYCLE_STAGE_ORDER[i])) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx === -1) continue;
      // Inject synthetic completed stages for any earlier stage not present.
      const startedAt = cyc.startedAt;
      for (let i = 0; i < lastIdx; i++) {
        const st = CYCLE_STAGE_ORDER[i];
        if (!present.has(st)) {
          cyc.stages.unshift(synth(st, startedAt, `synth:${cyc.cycleNumber}:${st}`));
          present.add(st);
        }
      }
      // Re-sort cycle stages into canonical order.
      cyc.stages.sort(
        (a, b) => CYCLE_STAGE_ORDER.indexOf(a.type) - CYCLE_STAGE_ORDER.indexOf(b.type),
      );
    }

    const derivedCycles = [...cyclesMap.values()].sort((a, b) => a.cycleNumber - b.cycleNumber);
    return { preCycle, cycles: derivedCycles };
  }, [snapshot.selectedPath, snapshot.commits]);

  // Use path-derived view whenever HEAD has step-commit history. The
  // orchestrator's currentStage / isRunning belong to the LAST run it
  // loaded, not whichever branch HEAD is on now — surfacing them while
  // navigating leaks "Tasks running..." into the row of a navigation that
  // isn't actually running anything.
  // Path-derived view is for timeline navigation when no run is active. During
  // a live run, the orchestrator IS the source of truth — its cycles include
  // the in-flight stage with status="running" (which path-derivation can't see
  // because uncommitted stages have no commit), and currentStage/currentCycle
  // point at where the agent is right now. Falling back to path-derived during
  // a live run drops the running-stage indicator from the StageList and forces
  // currentStage/currentCycle to null.
  const usePathDerived = snapshot.selectedPath.length > 0 && !isRunning;
  const effectiveCycles = usePathDerived ? pathDerived.cycles : cycles;
  const effectivePreCycleStages = usePathDerived ? pathDerived.preCycle : preCycleStages;
  const effectiveCurrentStage = usePathDerived ? null : currentStage;
  const effectiveCurrentCycle = usePathDerived ? null : currentCycle;
  const effectiveIsRunning = isRunning;
  const effectiveIsClarifying = usePathDerived ? false : isClarifying;
  const effectiveIsCheckingPrerequisites = usePathDerived ? false : isCheckingPrerequisites;

  const pathStagesByCycle = useMemo(() => {
    const m = new Map<number, Set<StepType>>();
    for (const c of effectiveCycles) {
      m.set(c.cycleNumber, new Set(c.stages.map((s) => s.type)));
    }
    return m;
  }, [effectiveCycles]);

  const activePhase = deriveActivePhase(
    effectiveIsCheckingPrerequisites,
    effectiveIsClarifying,
    effectivePreCycleStages,
    effectiveCycles,
    loopTermination,
    effectiveIsRunning,
  );
  const [selectedPhase, setSelectedPhase] = useState<MacroPhase>(activePhase);

  useEffect(() => {
    setSelectedPhase(activePhase);
  }, [activePhase]);

  const prerequisitesStatus = derivePhaseStatus("prerequisites", activePhase);
  const clarificationStatus = derivePhaseStatus("clarification", activePhase);
  const loopStatus = derivePhaseStatus("loop", activePhase);
  const completionStatus = derivePhaseStatus("completion", activePhase);
  const finalCompletionStatus: PhaseStatus = loopTermination?.reason === "gaps_complete" ? "done" : completionStatus;

  const handleSelect = useCallback((phase: MacroPhase) => {
    setSelectedPhase(phase);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ProcessStepper
        activePhase={activePhase}
        selectedPhase={selectedPhase}
        prerequisitesStatus={prerequisitesStatus}
        clarificationStatus={clarificationStatus}
        loopStatus={loopStatus}
        completionStatus={finalCompletionStatus}
        isRunning={effectiveIsRunning}
        onSelect={handleSelect}
      />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedPhase === "prerequisites" && (
          <PrerequisitesPhase
            checks={prerequisitesChecks}
            isActive={activePhase === "prerequisites"}
            step={effectivePreCycleStages.find((s) => s.type === "prerequisites")}
          />
        )}

        {selectedPhase === "clarification" && (
          <ClarificationPhase
            preCycleStages={effectivePreCycleStages}
            isClarifying={effectiveIsClarifying}
            isRunning={effectiveIsRunning}
            onStageClick={onStageClick}
          />
        )}

        {selectedPhase === "loop" && (
          <LoopPhase
            cycles={effectiveCycles}
            currentCycle={effectiveCurrentCycle}
            currentStage={effectiveCurrentStage}
            isRunning={effectiveIsRunning}
            totalCost={totalCost}
            specSummaries={specSummaries}
            onStageClick={onStageClick}
            onImplPhaseClick={onImplPhaseClick}
            onSelectSpec={onSelectSpec}
            debugBadge={debugBadge}
            pathStagesByCycle={pathStagesByCycle}
            latestAction={latestAction}
          />
        )}

        {selectedPhase === "completion" && loopTermination && (
          <CompletionPhase termination={loopTermination} />
        )}

        {selectedPhase === "completion" && !loopTermination && (
          <div style={{ textAlign: "center", paddingTop: 60, color: "var(--foreground-dim)", fontSize: "0.82rem" }}>
            Loop has not completed yet
          </div>
        )}
      </div>

    </div>
  );
}
