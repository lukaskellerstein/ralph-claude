# Contract: Orchestrator event stream additions

**Channel**: `orchestrator:event` (existing; `webContents.send` from main, subscribed via `useOrchestrator` in the renderer).

This feature adds five event variants to the `OrchestratorEvent` discriminated union in `src/core/types.ts`. Existing variants are untouched; the `paused` variant is extended with a `reason` field (always present post-S4; older call sites default-fill to `"failure"` for uncaught errors, `"user_abort"` for the Stop button — see data-model §6).

---

## New event variants

### `stage_candidate`

Fired after every successful `commitCheckpoint` in the orchestrator (S3).

```ts
{
  type: "stage_candidate";
  runId: string;
  cycleNumber: number;
  stage: LoopStageType;
  checkpointTag: string;          // would-be tag on Keep this
  candidateSha: string;            // SHA of the candidate commit
  attemptBranch: string;           // current attempt branch (from getCurrentBranch)
}
```

**Consumers**:
- `useTimeline` — invalidates cache so the next `listTimeline` includes the pending candidate.
- `CandidatePrompt` (when step mode is on) — opens with Keep / Try again / Try N ways buttons pre-filled for this stage.
- DEBUG badge — updates `LastCheckpointTag` + `CandidateSha` fields.

### `checkpoint_promoted`

Fired when `promoteToCheckpoint` succeeds (either via Record-mode auto-promote in the orchestrator or the `checkpoints:promote` IPC).

```ts
{
  type: "checkpoint_promoted";
  runId: string;
  checkpointTag: string;
  sha: string;
}
```

**Consumers**:
- `useTimeline` — invalidates cache; the tag is now a checkpoint, not pending.
- Renderer toast — "Promoted <label>".

### `paused` (extended)

```ts
{
  type: "paused";
  runId: string;
  reason: PauseReason;       // "user_abort" | "step_mode" | "budget" | "failure"
  stage?: LoopStageType;     // present for step_mode (the just-completed stage)
}
```

- **Back-compat**: pre-S4 call sites always emitted `paused` implicitly (via state update only). Post-S4, every emission includes `reason`. The renderer tolerates absence (treats as `"failure"`) for any event replay from older logs.
- **Consumers**: LoopDashboard badge colour + label; CandidatePrompt opens iff `reason === "step_mode"`.

### `variant_group_resume_needed`

Fired at orchestrator startup when `.dex/variant-groups/*.json` contains any file whose variants include `pending` or `running` statuses.

```ts
{
  type: "variant_group_resume_needed";
  projectDir: string;
  groupId: string;
  stage: LoopStageType;
  pendingCount: number;     // variants with status "pending"
  runningCount: number;     // variants with status "running" (process likely died)
}
```

**Consumers**: `App.tsx` shows the Continue Variant Group modal; blocks Start button until every outstanding group is resolved.

### `variant_group_complete`

Fired when every variant in a group has reached a terminal status (`completed` or `failed`), whether via normal completion or after a resume.

```ts
{
  type: "variant_group_complete";
  groupId: string;
}
```

**Consumers**: `VariantCompareModal` opens for this group; compare + Keep / Discard UX drives the final `checkpoints:cleanupVariantGroup` call.

---

## Emission sites (reference)

| Event | Emission site |
|---|---|
| `stage_candidate` | `src/core/orchestrator.ts` after `commitCheckpoint` + `completePhase` (S3). |
| `checkpoint_promoted` | `src/core/orchestrator.ts` in Record-mode branch; also IPC handler `checkpoints:promote` via the event bus. |
| `paused { reason }` | Every existing paused-state call site: Stop button → `user_abort`; budget path → `budget`; uncaught error → `failure`; `stepMode` branch → `step_mode` (S4). |
| `variant_group_resume_needed` | Orchestrator startup, after `acquireStateLock`. One event per pending group. |
| `variant_group_complete` | `runVariants` driver once all variants terminate (S10). |

---

## Ordering guarantees

- `stage_candidate` is emitted **before** any state update that changes `currentStage` — consumers can rely on seeing the candidate for stage X before the orchestrator has moved on to stage X+1.
- `checkpoint_promoted` is emitted **after** the tag write succeeds — seeing the event implies the tag exists (or existed momentarily; an external deletion between emission and read is an abstraction-leak edge case handled by R10#4).
- `variant_group_resume_needed` is emitted **before** any new run can start — the Start button is disabled until the user resolves all outstanding groups (FR-026, R6).
- `variant_group_complete` is guaranteed to fire exactly once per group (either via normal completion path or via resume-then-completion).

---

## Test matrix (event-level)

Run as part of the orchestrator / IPC tests (not pure-Node).

| Case | Assertion |
|---|---|
| Plain run, 3 stages | Exactly 3 `stage_candidate` events; 0 `checkpoint_promoted` (default mode). |
| Record-mode run, 3 stages | 3 `stage_candidate` + 3 `checkpoint_promoted` events in pairs. |
| Step-mode pause | 1 `stage_candidate` then 1 `paused { reason: "step_mode" }`. Further stages do not fire until user Keep / Try again. |
| User abort during stage | `paused { reason: "user_abort" }`. No `stage_candidate` for the aborted stage. |
| Variants spawn | After `spawnVariants`, no `variant_group_resume_needed` (group just created, no prior crash). On successful end-to-end: 1 `variant_group_complete`. |
| Variants spawn, quit, reopen | Reopen fires 1 `variant_group_resume_needed`; after resume completes, 1 `variant_group_complete`. |
