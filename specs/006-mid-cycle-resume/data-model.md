# Data Model: Mid-Cycle Resume

**Feature**: 006-mid-cycle-resume
**Date**: 2026-04-17
**Purpose**: Catalogue the type additions and the state/audit fields that this feature reads or writes. No new persistence — the model is expressed entirely as TypeScript types and existing state/DB fields.

## Entities

### 1. `LoopStageType` (existing, unchanged)

Source: `src/core/types.ts`.

Ordered enum of stage identifiers:

```
gap_analysis → specify → plan → tasks → implement → verify → learnings
```

The total order is encoded by `STAGE_ORDER` in `src/core/state.ts:356-372`. This feature uses `STAGE_ORDER.indexOf(stage)` to compare positions in `shouldRun`. No changes to the enum or to `STAGE_ORDER`.

### 2. `GapAnalysisDecision` (existing union, **extended**)

Source: `src/core/types.ts`.

The decision object returned by the gap-analysis short-circuit (and by the gap-analysis LLM call proper). The cycle body branches on `decision.type`.

**Before (current code)**:

```ts
export type GapAnalysisDecision =
  | { type: "GAPS_COMPLETE" }
  | { type: "NEXT_FEATURE"; featureId: string; name: string; description: string }
  | { type: "REPLAN_FEATURE"; featureId: string; specDir: string }
  | { type: "RESUME_FEATURE"; specDir: string };
```

**After (this feature adds one variant)**:

```ts
export type GapAnalysisDecision =
  | { type: "GAPS_COMPLETE" }
  | { type: "NEXT_FEATURE"; featureId: string; name: string; description: string }
  | { type: "REPLAN_FEATURE"; featureId: string; specDir: string }
  | { type: "RESUME_FEATURE"; specDir: string }
  | { type: "RESUME_AT_STAGE"; specDir: string; resumeAtStage: LoopStageType };
```

#### Field semantics for the new variant

| Field | Type | Meaning |
|---|---|---|
| `type` | `"RESUME_AT_STAGE"` | Discriminant. |
| `specDir` | `string` | The existing spec directory path that `specify` produced in the aborted cycle. Must remain the same across the resume — the cycle body will not create a new directory. |
| `resumeAtStage` | `LoopStageType` | The *last completed* stage before the abort. Must be one of `"specify"` or `"plan"` — `"tasks"` is excluded by the emitter (see `research.md § R5 Q4`) because a completed `"tasks"` stage maps to the existing `RESUME_FEATURE` variant. |

#### Validity constraints

- `resumeAtStage` MUST be a stage that appears before `implement` in `STAGE_ORDER`. Values of `"implement"`, `"verify"`, `"learnings"`, `"gap_analysis"`, or anything outside `STAGE_ORDER` are not produced by the emitter.
- `specDir` MUST reference an existing directory on disk at the moment the decision is constructed. (The gap-analysis short-circuit reads `resumeSpecDir` from state; if the directory has been deleted between abort and resume, the orchestrator's existing artifact-drift path kicks in — see `research.md § R4`.)

### 3. `Cycle` identity (existing, invariant preserved)

A cycle is identified within a run by `cycleNumber = cyclesCompleted + 1`. This feature preserves the mapping: on user abort, `cyclesCompleted` is not advanced, so the next iteration's `cycleNumber` equals the aborted cycle's number. `phase_traces` rows stored in the audit DB under the original `cycleNumber` remain the authoritative record of what completed.

No field is added to the cycle structure. The change is purely in *when* `cyclesCompleted` is incremented (see `shouldRun` and the post-amble guard in the plan).

## State fields read/written

All fields live in `<projectDir>/.dex/state.json`. No schema change.

| Field | Read by | Written by | Notes |
|---|---|---|---|
| `cyclesCompleted: number` | Decision emitter (derives `cycleNumber`) | Cycle post-amble (now guarded by `!cycleAborted`) | Guard is the single most impactful line change. |
| `currentSpecDir: string \| null` | Decision emitter (as `resumeSpecDir`) | `specify` stage block (now written immediately on dir creation) | Early write closes the narrow pause window between specify and plan. |
| `lastCompletedStage: LoopStageType \| null` | Decision emitter (as `resumeLastStage`) | Existing stage-completion code path (unchanged) | The selector that chooses between `RESUME_FEATURE` and `RESUME_AT_STAGE`. |
| `status: "running" \| "paused" \| "completed" \| "failed"` | `detectStaleState` | `finally` block at `orchestrator.ts:1464-1469` | Already written correctly today; this feature does not touch it. |
| `artifacts.features[specDir]` | Cycle reconciliation | `specify` stage block | Existing. Early write of `currentSpecDir` is paired with the existing `artifacts.features` write so state is internally consistent across the whole pause window. |

## Audit-trail rows read/written

All tables live in `~/.dex/db/data.db`. No schema change.

| Table | Row lifecycle | This feature's interaction |
|---|---|---|
| `runs` | One row per orchestrator run | Unchanged. |
| `loop_cycles` | One row per cycle within a run | Unchanged. The resumed cycle re-enters the same row (same `cycleNumber`, same `runId`). |
| `phase_traces` | One row per phase within a cycle | Resumed cycle *adds* new rows for stages that will now run; pre-abort rows for completed stages remain. `getSpecPhaseStats` deduplicates on `(projectDir, phase_number, specDir)` using the latest row, so the UI reads consistent data. |
| `trace_steps` | One row per tool call / agent step | Unchanged. |
| `subagents` | One row per spawned subagent | Unchanged. |

## Derived helpers (in-memory only — not persisted)

### `shouldRun(stage: LoopStageType): boolean`

Scope: local to `runLoop` in `orchestrator.ts`, where the `decision` variable is in closure. Pure function over `decision` and `stage`. See `contracts/types-contract.md` for the signature and behaviour table.

## State transitions

### Cycle status machine (unchanged, annotated)

```
           start
             │
             ▼
       ┌──running──┐
       │           │
 Stop  │           │  unrecoverable
 click │           │  error
       ▼           ▼
    paused       failed
       │           │
       │           │
   Resume    retry or skip
       │           │
       └─► running ◄─┘

   running ─► completed   (cycle reaches `learnings`)
```

**Change introduced by this feature**: the `paused → running` transition on Resume now branches on `lastCompletedStage`:

- `lastCompletedStage ∈ {specify, plan}` → emit `RESUME_AT_STAGE` → `shouldRun` gates so stages ≤ `lastCompletedStage` are skipped
- `lastCompletedStage === "tasks"` → emit `RESUME_FEATURE` → existing behaviour, jump to implement
- any other value (or `null`) → emit the variant appropriate to that state (typically `NEXT_FEATURE` when `currentSpecDir` is also null — the fresh-cycle case)

### `cyclesCompleted` transitions

| Cycle outcome | Before this feature | After this feature |
|---|---|---|
| `completed` (reached `learnings` naturally) | `+1` | `+1` (unchanged) |
| `failed` (unrecoverable error) | `+1` | `+1` (unchanged — poison-cycle protection) |
| `stopped` (user aborted via Stop button) | `+1` ← **bug** | `+0` — preserves cycle identity for resume |

## Assumptions / invariants

- A cycle's `cycleNumber` is uniquely identified by the pair `(runId, cyclesCompleted + 1)` at the moment it starts. After resume, the same pair yields the same `cycleNumber` because `cyclesCompleted` was preserved.
- `STAGE_ORDER` does not change in this feature. If a future feature reorders stages, `shouldRun`'s ordinal comparison continues to work — it reads `STAGE_ORDER` at call time, not at module load.
- Feature manifest entries (`.dex/feature-manifest.json`) are not mutated by this feature. The existing completion marker at `orchestrator.ts:2671` runs only on `NEXT_FEATURE`, which is correct (a resumed feature stays in its `in-progress` state until its cycle completes naturally).
