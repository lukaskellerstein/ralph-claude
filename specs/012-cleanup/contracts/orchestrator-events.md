# Contract: Orchestrator event union + `src/core/checkpoints` barrel after cleanup

**Status**: post-cleanup target shape
**Source files**: `src/core/events.ts`, `src/core/checkpoints/index.ts`, `src/core/run-lifecycle.ts`.

## Orchestrator event union — preserved members (relevant subset)

Events not affected by this cleanup are omitted for brevity. The subset below shows what stays after the change for the checkpoint-related event surface:

```ts
type OrchestratorEvent =
  // ...all other event types unchanged...
  | { type: "step_candidate";
      runId: string;
      cycleNumber: number;
      step: StepType;
      checkpointTag: string;
      candidateSha: string;
      attemptBranch: string }                 // kept — useTimeline.ts:69 + App.tsx:332
  | { type: "checkpoint_promoted";
      runId: string;
      checkpointTag: string;
      sha: string }                            // kept — Record-mode auto-promote
  | { type: "paused";
      runId: string;
      reason: "user_abort" | "step_mode" | "budget" | "failure";
      step?: StepType };                      // kept — drives Loop Dashboard Resume button
```

## Orchestrator event union — removed members

```ts
| { type: "variant_group_resume_needed"; projectDir: string; groupId: string; step: StepType; pendingCount: number; runningCount: number }   // REMOVED
| { type: "variant_group_complete";       groupId: string }                                                                                  // REMOVED
```

`src/core/run-lifecycle.ts` `emitPendingVariantGroups` (lines 261–278) and its two call sites (lines 140, 153) are deleted in the same edit — they were the only emitters.

## `src/core/checkpoints/index.ts` barrel — after-state

### Preserved named re-exports

```ts
export {
  /* recordMode.js */
  promoteToCheckpoint,
  autoPromoteIfRecordMode,
  /* timeline.js */
  buildTimelineSnapshot,
  type TimelineSnapshot,
  type TimelineCommit,
  type TimelineRef,
  /* commit.js */
  commitCheckpoint,
  ensureCleanWorktree,
  /* jumpTo.js */
  jumpToCheckpoint,
  unselect,
  type JumpToResult,
  /* tags.js */
  /* …whatever stays unchanged in tags.js… */
} from "./recordMode.js"; // (etc — actual module-by-module split unchanged)
```

### Preserved namespace-object keys

The default-export namespace (used internally by some renderer-service paths) shrinks to:

```ts
const checkpoints = {
  promote: promoteToCheckpoint,         // preserved — used directly by recordMode auto-promote
  autoPromoteIfRecordMode,              // preserved
  buildTimelineSnapshot,                // preserved
  commitCheckpoint,                     // preserved
  ensureCleanWorktree,                  // preserved
  jumpToCheckpoint,                     // preserved
  unselect,                             // preserved
};
```

### Removed named re-exports

| Symbol | Source module | Removal reason |
|--------|--------------|----------------|
| `unmarkCheckpoint` | `./jumpTo.js` (line 32) | Verb retired (FR-008); function deleted from `jumpTo.ts:66-89`. |
| `spawnVariants` | `./variants.js` (line 37) | Variants module deleted (FR-006). |
| `cleanupVariantWorktree` | `./variants.js` (line 38) | Variants module deleted (FR-006). |
| `type VariantSpawnRequest` | `./variants.js` (line 39) | Variants module deleted (FR-006). |
| `type VariantSpawnResult` | `./variants.js` (line 40) | Variants module deleted (FR-006). |
| `writeVariantGroupFile` | `./variantGroups.js` (line 54) | VariantGroups module deleted (FR-006). |
| `readVariantGroupFile` | `./variantGroups.js` (line 55) | VariantGroups module deleted (FR-006). |
| `deleteVariantGroupFile` | `./variantGroups.js` (line 56) | VariantGroups module deleted (FR-006). |
| `readPendingVariantGroups` | `./variantGroups.js` (line 57) | VariantGroups module deleted (FR-006). |
| `type VariantGroupFile` | `./variantGroups.js` (line 58) | VariantGroups module deleted (FR-006). |

### Removed namespace-object keys

```ts
unmark: unmarkCheckpoint,        // line 134
spawnVariants,                   // line 137
cleanupVariantWorktree,          // line 138
readVariantGroupFile,            // line 144
writeVariantGroupFile,           // line 145
deleteVariantGroupFile,          // line 146
readPendingVariantGroups,        // line 147
```

## `step_candidate` consumer set — after cleanup

| Consumer | File | Behaviour |
|---------|------|-----------|
| Timeline marker refresh | `src/renderer/components/checkpoints/hooks/useTimeline.ts:69` | Triggers a `refresh()` so the new step-commit dot appears on the Timeline graph. |
| DEBUG-badge payload | `src/renderer/App.tsx:332` | Updates the in-memory snapshot the DEBUG badge copies to clipboard (carries `candidateSha`, `attemptBranch`, `lastCheckpointTag`). |

`CheckpointsEnvelope.tsx` no longer consumes the event. Its handler block, the `lastStageRef`, the `candidate`/`variantCompare`/`variantResume` state, and the `readPendingVariantGroups` poll on project-open are all removed.

## Verification

| Check | Command / criterion |
|------:|--------------------|
| Removed event members compile away | `npx tsc --noEmit` after editing `events.ts` reports no errors anywhere in `src/` (which would surface unhandled-discriminant warnings in event consumers). |
| Removed barrel exports compile away | Same `tsc --noEmit` run. Editing `index.ts` first means the bad-import errors point straight to the file that still references the dead symbol. |
| `step_candidate` reaches both surviving consumers | Smoke run + DEBUG-badge inspection (SC-004). |
| `emitPendingVariantGroups` is gone | `grep -n "emitPendingVariantGroups" src/` returns zero hits. |
