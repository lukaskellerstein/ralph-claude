# Research: Mid-Cycle Resume

**Feature**: 006-mid-cycle-resume
**Date**: 2026-04-17
**Purpose**: Record the design decisions that resolve the open questions flagged in the source brief (`docs/my-specs/006-mid-cycle-resume/README.md`) and close out any `NEEDS CLARIFICATION` from `plan.md`'s Technical Context.

## R1 — Why a new decision variant rather than extending `RESUME_FEATURE`

### Decision

Add a new closed-union member `RESUME_AT_STAGE` to `GapAnalysisDecision` rather than adding an optional `resumeAtStage?: LoopStageType` field to the existing `RESUME_FEATURE` variant.

### Rationale

- **Explicit callsites.** `RESUME_FEATURE` today means exactly "the spec/plan/tasks triad is done, jump straight to implement". That invariant is relied on in seven decision-dispatch sites across `orchestrator.ts` (2282, 2283, 2298, 2357, 2364, 2393, 2671 — verified against the current file). Overloading it with an optional field forces every callsite to inspect the field; a new variant lets the compiler prove exhaustiveness.
- **No implicit default trap.** An optional field on `RESUME_FEATURE` has an implicit default of "treat as implement-only" when absent. Future code that forgets to set the field would silently skip plan+tasks. A distinct variant removes this footgun.
- **Union-narrowing in `shouldRun`.** The `shouldRun(stage)` helper introduced in the plan is a closed switch on `decision.type`. TypeScript's exhaustiveness checker catches a missed variant at compile time. Adding a variant is a cheaper guarantee than validating a nested field.

### Alternatives considered

- **Option A — boolean `intraCycle?: true` field on `RESUME_FEATURE`.** Rejected: all the implicit-default concerns above, plus the field doesn't carry the actual stage ordinal, so every reader would still have to re-derive `resumeAtStage` from `state.lastCompletedStage`.
- **Option B — split `RESUME_FEATURE` entirely into `RESUME_AT_IMPLEMENT`, `RESUME_AT_PLAN`, `RESUME_AT_TASKS`.** Rejected: explodes the union from 4 to 6 variants for a purely parametric difference. The `resumeAtStage` ordinal is data, not a type distinction — one `RESUME_AT_STAGE { specDir, resumeAtStage }` captures it cleanly.
- **Option C — overload `REPLAN_FEATURE`.** Rejected: `REPLAN_FEATURE` already means "redo plan+tasks+implement" for an existing feature. Different semantics — mid-cycle resume is *not* a replan; the earlier stages completed, they should not re-run.

## R2 — Why guard `cyclesCompleted++` only for user aborts, not for unrecoverable failures

### Decision

```ts
const cycleAborted = abortController?.signal.aborted ?? false;
if (!cycleAborted) {
  cyclesCompleted++;
}
```

`cyclesCompleted` still advances on `cycleFailed` (unrecoverable error). Only user-initiated aborts (the `Stop` click, which sets `abortController.signal.aborted`) preserve the counter.

### Rationale

- **Poison-cycle protection.** If an unrecoverable error doesn't advance the counter, the next loop iteration recomputes `cycleNumber = cyclesCompleted + 1` → same cycle number → same gap-analysis decision → same failure → infinite retry. The existing behaviour (advance on failure) is load-bearing; this fix must preserve it.
- **User aborts are intentional and re-runnable.** The whole point of the feature is that a user abort is a pause, not a failure. Preserving the counter lets the next resume continue the same cycle identity.
- **Detector.** `abortController?.signal.aborted` is already the source of truth the `finally` block at `orchestrator.ts:1464-1469` uses to write `status: "paused"`. Reusing it keeps the abort taxonomy consistent — if a future change alters how aborts are detected, both sites update together.

### Alternatives considered

- **Option A — advance the counter for everything; use a separate "aborted-cycle pointer" in state.** Rejected: adds a new persisted field, moves the source-of-truth for "am I resuming the same cycle?" from `cyclesCompleted` to a parallel pointer. `cycleNumber` semantics become ambiguous. Simpler to keep the counter authoritative.
- **Option B — never advance on failure either, and add a retry-limit guard elsewhere.** Rejected: expands scope. Today's loop has no retry limit; introducing one here is a separate feature.

## R3 — Why `shouldRun(stage)` centralises the decision→stages mapping

### Decision

Replace the scattered `if (decision.type === "NEXT_FEATURE")` and `if (decision.type === "RESUME_FEATURE")` gates around each of the cycle body's stage blocks with a single helper:

```ts
const shouldRun = (stage: LoopStageType): boolean => {
  switch (decision.type) {
    case "NEXT_FEATURE":
      return stage !== "gap_analysis";
    case "REPLAN_FEATURE":
      return stage === "plan" || stage === "tasks" || stage === "implement"
          || stage === "verify" || stage === "learnings";
    case "RESUME_FEATURE":
      return stage === "implement" || stage === "verify" || stage === "learnings";
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

### Rationale

- **Truth table in one place.** 5 decision variants × 7 stages = 35 cells. Today the mapping is inferred by reading seven scattered guards; after the helper it's one 18-line function.
- **Closed union → compile-time exhaustiveness.** The `switch` has no `default`. Adding a future variant (or removing one) fails the type-checker at the helper, not at whichever callsite happened to forget to update.
- **Matches the existing stage-block shape.** Every stage block already reads as "if (decision type matches) { emit stage_started; run; emit stage_completed }". Swapping the guard to `if (shouldRun("specify"))` is a one-token change per block.
- **No runtime overhead.** Five stage checks per cycle, pure data comparisons — inlined by the JIT.

### Alternatives considered

- **Option A — inline the new `RESUME_AT_STAGE` check at each stage block alongside the existing `decision.type === "…"` checks.** Rejected: doubles the scatter; the duplication the README identified as the symptom gets worse, not better.
- **Option B — a lookup table keyed by `decision.type`, valued by `Set<LoopStageType>`.** Rejected: `RESUME_AT_STAGE` is parametric (the stage set depends on `decision.resumeAtStage`), which a static table can't express without re-deriving at runtime. The function form is cleaner.

## R4 — How does `reconcileState` tolerate the new semantics

### Decision

No changes to `state.ts`. The existing reconciliation logic already covers the drift shapes this feature introduces.

### Rationale

- **Pointer keys survive.** `phase_traces` rows are keyed by UUID (`phaseTraceId`), not by `(runId, cycleNumber, stageOrdinal)`. Re-entering a cycle with the same `cycleNumber` creates new `phase_traces` rows for the not-yet-run stages; the existing rows from the aborted cycle remain discoverable by run_id + phase_number. `getSpecPhaseStats` already deduplicates "latest per (project, phase_number, specDir)" — confirmed at `src/core/state.ts:435-654`.
- **`detectStaleState` respects `paused`.** At `state.ts:280-298`, the function returns `"fresh"` whenever `status === "paused"` regardless of branch name — so a mid-cycle resume doesn't trip the stale detector even if the branch name and `cyclesCompleted` seem inconsistent with the current cycle count in the UI.
- **`STAGE_ORDER` is already specify/plan/tasks-ordered.** Verified at `state.ts:356-372`. `shouldRun` uses it directly — no new constant required.
- **Artifact-hash drift path is unchanged.** If the user modified `spec.md` between abort and resume, `reconcileState`'s hash check flips `status` on that artifact and the existing fallback to "re-run from the earliest affected stage" kicks in. That's exactly the behaviour we want for a dirty pause.

### Alternatives considered

- **Option A — write a migration path that clamps pre-upgrade `cyclesCompleted` values to match `phase_traces`.** Rejected: one slightly-suboptimal resume after upgrade is acceptable; building a migration for a rare edge case adds maintenance weight with no user-visible benefit.

## R5 — Resolution of the README's open questions

### Q1 — Pause during `gap_analysis` itself

**Resolved**: no special handling. `gap_analysis` is a single short LLM call (< $0.05 typically); re-running it on resume is cheap. `lastCompletedStage` stays at `tasks` of the prior cycle (or `manifest_extraction` for the first cycle), and the gap-analysis short-circuit simply re-evaluates. No behavioural change from today.

### Q2 — Should `RESUME_AT_STAGE` also cover `implement_fix`, `verify`, `learnings`?

**Resolved**: no. These stages run after `implement` completes. `implement`'s own per-task checksum resume handles mid-implement pauses. `verify` and `learnings` are idempotent reads of the finished work — re-running them on resume is acceptable and simpler than adding resume points. `shouldRun("verify")` and `shouldRun("learnings")` will return `true` for `RESUME_AT_STAGE` whenever `resumeAtStage` is earlier in `STAGE_ORDER`, which matches intent — the resumed cycle eventually runs them.

### Q3 — Migration of existing paused state

**Resolved**: no explicit migration. Pre-existing `state.json` files written by the current code may have an inflated `cyclesCompleted` from past aborts. On first resume after this feature lands, `reconcileState` detects any artifact drift and falls back to the earliest affected stage (see R4). One slightly-suboptimal resume is acceptable; the counter settles on the next completed cycle.

### Q4 — Does `RESUME_FEATURE` path still work for the `after-tasks` fixture?

**Resolved**: yes. The new decision emitter logic:

```ts
const intraCycleStages: LoopStageType[] = ["specify", "plan", "tasks"];
if (resumeSpecDir && cycleNumber === cyclesCompleted + 1) {
  if (resumeLastStage && intraCycleStages.includes(resumeLastStage)
      && resumeLastStage !== "tasks") {
    decision = { type: "RESUME_AT_STAGE", specDir: resumeSpecDir,
                 resumeAtStage: resumeLastStage };
  } else {
    decision = { type: "RESUME_FEATURE", specDir: resumeSpecDir };
  }
}
```

When `lastCompletedStage === "tasks"` the emitter falls through to `RESUME_FEATURE` — the existing path. The `fixture/after-tasks` behaviour is preserved byte-for-byte.

Note the small correction vs. the README sketch: the condition should exclude `"tasks"` from the intra-cycle triad (tasks *completing* is the cycle-boundary case, which is already `RESUME_FEATURE`). Tasks as `resumeAtStage` would mean "tasks hasn't completed yet, resume at tasks" — that's the pause-between-plan-and-tasks case, where `resumeLastStage === "plan"`, which does correctly map to `RESUME_AT_STAGE`.

## R6 — Dispatch sites that need RESUME_AT_STAGE awareness

### Decision

Audited all seven `decision.type === "..."` sites in `orchestrator.ts`. Four need updates beyond the `shouldRun` refactor; three are unaffected.

| Line | Current code | Action for `RESUME_AT_STAGE` |
|---|---|---|
| 2282 | `featureName = decision.type === "NEXT_FEATURE" ? decision.name : undefined` | No change — `RESUME_AT_STAGE` doesn't carry `name`; `undefined` is correct (the feature already exists in the manifest). |
| 2283 | `specDir = decision.type === "RESUME_FEATURE" \|\| decision.type === "REPLAN_FEATURE" ? decision.specDir : ...` | **Update**: also read `decision.specDir` for `RESUME_AT_STAGE`. |
| 2298 | `if (decision.type === "GAPS_COMPLETE") break;` | No change. |
| 2357 | `if (decision.type === "RESUME_FEATURE") { emitSkippedStage("specify"); emitSkippedStage("plan"); emitSkippedStage("tasks"); }` | **Update**: emit only the stages before `resumeAtStage` when decision is `RESUME_AT_STAGE`; keep emitting all three for `RESUME_FEATURE`. Implement as the loop shown in the plan brief. |
| 2364 | Specify block guard: `if (decision.type === "NEXT_FEATURE")` | **Update**: replace with `if (shouldRun("specify"))`. |
| 2393 | Plan block guard: `if (decision.type === "NEXT_FEATURE" \|\| decision.type === "REPLAN_FEATURE")` | **Update**: replace with `if (shouldRun("plan"))`. Same pattern for tasks, implement, verify, learnings blocks (tasks and later already use `NEXT_FEATURE` variants; audit each and swap). |
| 2671 | `if (decision.type === "NEXT_FEATURE") manifest.mark(featureId, "completed")` | No change — marking a feature completed only makes sense after a full cycle from scratch. `RESUME_AT_STAGE` resumes an in-progress feature; its completion is handled by the same code path once the cycle reaches `learnings`. |

## R7 — State persistence invariant for pause-between-specify-and-plan

### Decision

Write `currentSpecDir: specDir` into `state.json` **immediately** after `specify` creates the new directory, not later when the plan stage begins. Combined with the existing null-clobber guard at `orchestrator.ts:1215-1222`, this closes the gap where an abort fires in the microseconds between "specify returned" and "plan started".

### Rationale

- **Atomic persistence of the most recent artifact.** `specify`'s output is the most recoverable artifact the orchestrator produces. Delaying its persistence to the start of the next stage means a pause in the narrow window between stages would have no `currentSpecDir` to resume from.
- **The README previously attempted this and reverted.** The revert in testing session 005 was because the old `RESUME_FEATURE` path would skip plan+tasks incorrectly when `currentSpecDir` was set mid-cycle. With this feature's changes (the emitter now picks `RESUME_AT_STAGE` when appropriate), setting `currentSpecDir` early is correct.
- **Matches the "state is a mirror of the latest completed work" invariant.** Once `specify` has written files to disk, the authoritative pointer to those files should live in state. Anything less creates a window where on-disk state leads in-memory state.

### Alternatives considered

- **Option A — write `currentSpecDir` lazily only when the next stage starts.** Rejected: explicitly known to lose work in the narrow pause window.
- **Option B — persist after every single SDK event inside specify.** Rejected: over-engineered. Stage-boundary persistence is sufficient given the feature's grain-of-resume = stage boundary.

## Summary of Phase 0 resolutions

All five README open questions and the four plan-level unknowns are resolved. No `NEEDS CLARIFICATION` remain for the Technical Context. Proceed to Phase 1.
