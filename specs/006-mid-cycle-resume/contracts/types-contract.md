# Contract: Types & Internal Functions — Mid-Cycle Resume

**Feature**: 006-mid-cycle-resume
**Date**: 2026-04-17
**Purpose**: Pin the shape of the two internal contracts this feature introduces: the `RESUME_AT_STAGE` decision variant and the `shouldRun(stage)` helper. Both are internal to `src/core/` — the feature exposes no new IPC surface, no new renderer API, and no new on-disk schema. A contract here is an invariant that the implementation must preserve for the feature's tests to pass.

## C1 — `GapAnalysisDecision` extension

### Declaration

```ts
// src/core/types.ts — AFTER change
export type GapAnalysisDecision =
  | { type: "GAPS_COMPLETE" }
  | { type: "NEXT_FEATURE"; featureId: string; name: string; description: string }
  | { type: "REPLAN_FEATURE"; featureId: string; specDir: string }
  | { type: "RESUME_FEATURE"; specDir: string }
  | { type: "RESUME_AT_STAGE"; specDir: string; resumeAtStage: LoopStageType };
```

### Emitter contract (in `runLoop`, at the gap-analysis short-circuit, ~`orchestrator.ts:2194-2202`)

```ts
const intraCycleStages: LoopStageType[] = ["specify", "plan"];  // NOT "tasks"
const resumeSpecDir: string | null = state.currentSpecDir;
const resumeLastStage: LoopStageType | null = state.lastCompletedStage;

if (resumeSpecDir && cycleNumber === cyclesCompleted + 1) {
  if (resumeLastStage && intraCycleStages.includes(resumeLastStage)) {
    decision = {
      type: "RESUME_AT_STAGE",
      specDir: resumeSpecDir,
      resumeAtStage: resumeLastStage,
    };
  } else {
    // includes lastCompletedStage === "tasks" (cycle-boundary case),
    // and any later stage (implement/verify/learnings — treated as cycle boundary too)
    decision = { type: "RESUME_FEATURE", specDir: resumeSpecDir };
  }
  // then emit synthetic gap_analysis stage_started/completed events — same as today
}
```

### Invariants the emitter must preserve

| # | Invariant | Why |
|---|---|---|
| C1.1 | `resumeAtStage` is never `"tasks"` | `"tasks"` completed == cycle-boundary → already covered by `RESUME_FEATURE`. |
| C1.2 | `resumeAtStage` is never `"gap_analysis"`, `"implement"`, `"verify"`, or `"learnings"` | By the emitter's condition (`intraCycleStages`), only `"specify"` or `"plan"` can be `resumeAtStage`. |
| C1.3 | `specDir` on `RESUME_AT_STAGE` references an existing directory | Guaranteed by the emitter reading `state.currentSpecDir`, which is only set by specify on successful creation. Drift beyond that point is handled by `reconcileState`. |
| C1.4 | The decision is emitted at most once per cycle iteration | Already true for all other variants. |

### Negative contracts

- The emitter MUST NOT produce `RESUME_AT_STAGE` when `resumeSpecDir` is null.
- The emitter MUST NOT produce `RESUME_AT_STAGE` when `cycleNumber !== cyclesCompleted + 1` (i.e., not the first cycle of this run — the resume-detection gate).

## C2 — `shouldRun(stage)` helper

### Signature

```ts
// local to `runLoop`, closed over `decision`
type ShouldRun = (stage: LoopStageType) => boolean;
```

### Behaviour table (exhaustive — 5 decision types × 7 stages = 35 cells)

Legend: ✓ = stage runs, ✗ = stage is skipped, ✗* = skipped by `emitSkippedStage` (synthetic completion event fired for UI coherence), — = impossible (gap_analysis doesn't appear inside the cycle body; `GAPS_COMPLETE` terminates before any stage runs).

| decision.type          | gap_analysis | specify | plan | tasks | implement | verify | learnings |
|------------------------|:-----------:|:-------:|:----:|:-----:|:---------:|:------:|:---------:|
| `NEXT_FEATURE`         | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `REPLAN_FEATURE`       | — | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `RESUME_FEATURE`       | — | ✗* | ✗* | ✗* | ✓ | ✓ | ✓ |
| `RESUME_AT_STAGE` (resumeAtStage=`specify`) | — | ✗* | ✓ | ✓ | ✓ | ✓ | ✓ |
| `RESUME_AT_STAGE` (resumeAtStage=`plan`)    | — | ✗* | ✗* | ✓ | ✓ | ✓ | ✓ |
| `GAPS_COMPLETE`        | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Implementation (reference — to be placed in `runLoop`)

```ts
const shouldRun: ShouldRun = (stage) => {
  switch (decision.type) {
    case "NEXT_FEATURE":
      return stage !== "gap_analysis";
    case "REPLAN_FEATURE":
      return stage === "plan" || stage === "tasks"
          || stage === "implement" || stage === "verify"
          || stage === "learnings";
    case "RESUME_FEATURE":
      return stage === "implement" || stage === "verify"
          || stage === "learnings";
    case "RESUME_AT_STAGE": {
      const resumeOrdinal = STAGE_ORDER.indexOf(decision.resumeAtStage);
      const stageOrdinal = STAGE_ORDER.indexOf(stage);
      return stageOrdinal > resumeOrdinal;
    }
    case "GAPS_COMPLETE":
      return false;
  }
};
```

### Invariants

| # | Invariant | Why |
|---|---|---|
| C2.1 | `shouldRun` is a pure function over `(decision, stage)` — no side effects, no I/O, no clock read | Lets callers inline the call without concern for ordering. |
| C2.2 | `shouldRun` never returns `true` for `gap_analysis` | Gap-analysis runs upstream of the stage-block sequence — no stage block is gated by `shouldRun("gap_analysis")`. |
| C2.3 | `shouldRun` agrees with the behaviour table above for every (decision, stage) pair | The implementation can be audited against the table by inspection; no unit-test harness exists in the project (see plan §Technical Context/Testing). A future contributor adding a decision variant must extend both the table and the switch together. |
| C2.4 | `shouldRun` is exhaustive over `GapAnalysisDecision` — no `default` branch | TypeScript's exhaustiveness check catches a future missed variant at compile time, not at runtime. |

## C3 — Skipped-stage emission contract (update to existing dispatch at `orchestrator.ts:~2357`)

### Behaviour

Before running any stage block, synthesize `stage_started → stage_completed` events for the stages that are going to be skipped, so the UI cycle timeline shows them as ✓ completed rather than missing.

```ts
// Replaces the current `if (decision.type === "RESUME_FEATURE") { ... }` block
if (decision.type === "RESUME_FEATURE") {
  emitSkippedStage("specify", cycleNumber);
  emitSkippedStage("plan", cycleNumber);
  emitSkippedStage("tasks", cycleNumber);
} else if (decision.type === "RESUME_AT_STAGE") {
  const resumeOrdinal = STAGE_ORDER.indexOf(decision.resumeAtStage);
  for (const s of ["specify", "plan", "tasks"] as const) {
    if (STAGE_ORDER.indexOf(s) <= resumeOrdinal) {
      emitSkippedStage(s, cycleNumber);
    }
  }
}
```

### Invariants

| # | Invariant | Why |
|---|---|---|
| C3.1 | For every (decision, stage) pair where `shouldRun(stage) === false` AND the stage appears before `implement` AND `decision.type ∈ {RESUME_FEATURE, RESUME_AT_STAGE}`, `emitSkippedStage(stage, cycleNumber)` is called exactly once | Keeps UI timeline coherent — every stage of a resumed cycle is represented exactly once. |
| C3.2 | `emitSkippedStage` is NOT called for `decision.type ∈ {NEXT_FEATURE, REPLAN_FEATURE, GAPS_COMPLETE}` | Those variants don't skip pre-implement stages in a way that needs UI catch-up (`NEXT_FEATURE` runs them all; `REPLAN_FEATURE` skips only `specify` which is already the fresh-cycle pattern; `GAPS_COMPLETE` terminates the run). |
| C3.3 | The call order is `specify → plan → tasks` | `emitSkippedStage` carries a timestamp the UI uses to place the stage on the timeline; preserving stage order keeps the timeline monotonic. |

## C4 — `cyclesCompleted` advance contract (update at `orchestrator.ts:~2727`)

### Behaviour

```ts
// Before (current code):
cyclesCompleted++;

// After (this feature):
const cycleAborted = abortController?.signal.aborted ?? false;
if (!cycleAborted) {
  cyclesCompleted++;
}
```

### Invariants

| # | Invariant | Why |
|---|---|---|
| C4.1 | `cyclesCompleted` advances when cycle outcome is `completed` | Happy path unchanged. |
| C4.2 | `cyclesCompleted` advances when cycle outcome is `failed` | Poison-cycle protection. See `research.md §R2`. |
| C4.3 | `cyclesCompleted` does NOT advance when the cycle ended via user abort | Preserves cycle identity for resume. The single behaviour change of this feature. |
| C4.4 | The abort detector MUST be `abortController?.signal.aborted` | Reuses the same detector the `finally` block at `orchestrator.ts:1464-1469` uses to write `status: "paused"`. Keeps the taxonomy consistent. |

## C5 — `currentSpecDir` early-write contract (update at `orchestrator.ts:~2381-2392`)

### Behaviour

In the specify stage block, immediately after `specify` returns the new spec directory path, persist `currentSpecDir` to `state.json` — do not wait for the plan stage to begin.

```ts
// AFTER specify creates the new dir, BEFORE we move on to plan
if (activeProjectDir) {
  await updateState(activeProjectDir, {
    currentSpecDir: specDir,
    artifacts: {
      features: {
        [specDir]: {
          specDir,
          status: "specifying",
          spec: null,
          plan: null,
          tasks: null,
          lastImplementedPhase: 0,
        },
      },
    },
  } as never).catch(() => {});
}
```

### Invariants

| # | Invariant | Why |
|---|---|---|
| C5.1 | `currentSpecDir` is written within the same synchronous continuation as `specify` returning the directory path | Closes the narrow abort window between specify completion and plan start. |
| C5.2 | The write does NOT clobber `currentSpecDir` to null when `specDir` is undefined | The existing null-clobber guard at `orchestrator.ts:1215-1222` remains in place and is the line of defence for this invariant. |
| C5.3 | `artifacts.features[specDir]` is written in the same update call | Internal state consistency — the directory pointer and its artifact entry must be committed atomically so a mid-pause reconciliation sees both or neither. |

## Summary

No external contract changes. Five internal contracts total — one new union variant, one new helper, three updates to existing dispatch/post-amble code. The contracts are additive (RESUME_AT_STAGE is a new variant) or refinements (shouldRun replaces scattered guards; cyclesCompleted gains a guard; currentSpecDir write moves earlier).
