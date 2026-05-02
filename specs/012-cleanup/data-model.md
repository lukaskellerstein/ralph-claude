# Phase 1 Data Model: Cleanup — Retire Variant-Groups Verbs and Step Candidate Prompt

**Status**: complete
**Date**: 2026-04-29

## Scope

This is a deletion-only refactor. **No new entities are introduced.** The sections below catalogue:

1. The entities being **removed** (data shapes, on-disk artefacts, error codes, event payloads).
2. The entities **preserved unchanged** that the refactor must not break.

State transitions are not applicable — nothing about the orchestrator's stage machine or the `state.json` lifecycle changes.

## Entities removed

### `VariantGroupFile` (TypeScript type, on-disk artefact)

- **Source**: `src/core/checkpoints/variantGroups.ts` (file deleted).
- **Re-exported via**: `src/core/checkpoints/index.ts` (lines 53–59, 93–98), `src/renderer/services/checkpointService.ts` (line 9), `src/renderer/electron.d.ts` (lines 12–14).
- **On-disk shape**: JSON file at `<projectDir>/.dex/variant-groups/<groupId>.json` describing an in-flight collection of attempt branches/worktrees spawned by "Try N ways from here".
- **After cleanup**: type definition deleted from source. Pre-existing files in user projects become orphaned (gitignored, harmless). No first-launch migration runs (decision recorded in research.md §3 / spec edge cases).

### `VariantSpawnRequest` and `VariantSpawnResult` (TypeScript types)

- **Source**: `src/core/checkpoints/variants.ts` (file deleted).
- **Re-exported via**: `src/core/checkpoints/index.ts` (line 39), `src/renderer/services/checkpointService.ts` (lines 8–10), `src/renderer/electron.d.ts` (lines 12–14), `src/main/ipc/checkpoints.ts` (line 6 import).
- **After cleanup**: deleted everywhere. The matching IPC handlers (`checkpoints:spawnVariants`, `checkpoints:cleanupVariantGroup`) and renderer-service methods are deleted in lockstep.

### `attempt-<timestamp>-<letter>` git branches (on-disk artefact)

- **Source**: minted by the deleted `spawnVariants` path.
- **After cleanup**: no surviving UI path mints them. Pre-existing branches stay until `scripts/prune-example-branches.sh` runs (already prunes after 30 days). SC-007 in the spec asserts the branch count does not grow during the smoke run.

### `.dex/variant-groups/` and `.dex/worktrees/` directories (on-disk artefact)

- **Source**: written by the deleted variant-spawn path.
- **After cleanup**: no surviving code path writes them. Pre-existing files become orphans. Both paths remain in the `checkpoints:initRepo` `.gitignore` seed (`src/main/ipc/checkpoints.ts:277-282`) as forward-compat reservations (decision recorded in research.md §2).

### `CheckpointErrorCode` values (TypeScript literal union)

- **Source**: `src/renderer/services/checkpointService.ts:14-22`.
- **Removed values**: `"VARIANT_GROUP_MISSING"` (line ~20, regex branch at ~52-54). `"WORKTREE_LOCKED"` (line 17, regex branch at 43–45).
- **After cleanup**: both literals removed; regex branches in `mapToCheckpointError` removed; matching test rows in `checkpointService.test.ts` removed.

### Orchestrator event-union members (TypeScript discriminated union)

- **Source**: `src/core/events.ts:111-122`.
- **Removed members**: `{ type: "variant_group_resume_needed"; ... }` and `{ type: "variant_group_complete"; ... }`.
- **Preserved member**: `{ type: "step_candidate"; ... }` (used by surviving consumers — see Preserved entities).

### `dexAPI.checkpoints` method shape (renderer-side IPC contract)

- **Source**: `src/renderer/electron.d.ts` `dexAPI.checkpoints` block.
- **Removed methods**: `estimateVariantCost`, `readPendingVariantGroups`, `promote`, `unmark`, `spawnVariants`, `cleanupVariantGroup`, `compareAttempts`. Full after-state in [`contracts/ipc-checkpoints.md`](./contracts/ipc-checkpoints.md).
- **Preserved methods**: `checkIsRepo`, `checkIdentity`, `setIdentity`, `initRepo`, `unselect`, `jumpTo`, `syncStateFromHead`, `listTimeline`.

### `src/core/checkpoints/index.ts` namespace barrel

- **Removed re-exports**: `unmarkCheckpoint` (line 32), the entire `./variants.js` export block (lines 36–41), the entire `./variantGroups.js` export block (lines 53–59).
- **Removed namespace-object keys**: `unmark`, `spawnVariants`, `cleanupVariantWorktree`, `readVariantGroupFile`, `writeVariantGroupFile`, `deleteVariantGroupFile`, `readPendingVariantGroups`. Full after-state in [`contracts/orchestrator-events.md`](./contracts/orchestrator-events.md).

## Entities preserved unchanged

### `checkpoint/<name>` git tags

- **Source**: written by `promoteToCheckpoint` in `src/core/checkpoints/recordMode.ts`. Read by `jumpToCheckpoint` in `src/core/checkpoints/jumpTo.ts`.
- **Cleanup impact**: none. Existing tags created via the deleted "Keep this" verb are still valid — Record Mode produces the same tag shape. Verified by SC-003 (Record-Mode smoke run) and the preserved `promoteToCheckpoint` unit-test block.

### `step_candidate` event payload

- **Shape**: `{ type: "step_candidate"; runId: string; phaseTraceId: string; candidateSha: string; attemptBranch: string; lastCheckpointTag: string | null; ... }` (per `src/core/events.ts:91`).
- **Producers**: `src/core/stages/finalize.ts:89` (unchanged).
- **Consumers post-cleanup**: `src/renderer/components/checkpoints/hooks/useTimeline.ts:69` (refresh trigger for timeline markers); `src/renderer/App.tsx:332` (DEBUG-badge payload). The `CheckpointsEnvelope.tsx` consumer is removed.
- **Cleanup impact**: payload shape unchanged; only the consumer set shrinks. SC-004 verifies the surviving DEBUG-badge consumer still receives non-null `candidateSha` and `lastCheckpointTag`.

### `<projectDir>/.dex/state.json`

- **Shape**: `cyclesCompleted`, `currentSpecDir`, `lastCompletedStage`, `artifacts.features`, `ui.pauseAfterStage`, etc. (per `src/core/state.ts`).
- **Cleanup impact**: none. Step-mode pauses still toggle on `ui.pauseAfterStage = true`; only the resume UI affordance changes (Loop Dashboard Resume button instead of `CandidatePrompt` modal).

### `~/.dex/logs/<project>/<runId>/...`

- **Shape**: per-run orchestrator log tree (per `.claude/rules/06-testing.md` §4f.2).
- **Cleanup impact**: none. Removing IPC handlers does not remove the log-emit calls in the engine — those are unchanged.

### `<projectDir>/.dex/runs/<runId>.json`

- **Shape**: full `RunRecord` audit summary (per 007-sqlite-removal contracts).
- **Cleanup impact**: none.

## Data-flow before / after

```text
BEFORE — step-mode pause:
  finalize.ts:89  ──emits step_candidate──▶  useTimeline.ts:69  (refresh markers)
                                          ▶  App.tsx:332         (DEBUG payload)
                                          ▶  CheckpointsEnvelope (mounts CandidatePrompt modal) ◀── REMOVED

AFTER — step-mode pause:
  finalize.ts:89  ──emits step_candidate──▶  useTimeline.ts:69
                                          ▶  App.tsx:332
  Loop Dashboard <Resume> button is the sole resume affordance.

BEFORE — right-click on Timeline commit:
  TimelineGraph (onContextMenu) ──▶ TimelinePanel.handleKeep / handleUnkeep / handleTryNWays
                                  ──▶ CommitContextMenu mount ◀── REMOVED
                                  ──▶ TryNWaysModal / VariantCompareModal ◀── REMOVED

AFTER — right-click on Timeline commit:
  No handler. No menu. No effect. Left-click jump-to-checkpoint unchanged.
```

## Validation rules from requirements

| Rule | Source | Verification |
|------|--------|-------------|
| No surviving import of any removed symbol inside `src/`. | FR-006..-014, SC-005 | The verification grep regex in spec SC-005. |
| `npx tsc --noEmit` passes after each chunk. | FR-017, SC-006 | Run between chunks per the editing order in research.md §5. |
| `step_candidate` event still fires and reaches both surviving consumers. | FR-005, SC-004 | DEBUG-badge payload shows non-null `candidateSha` and `lastCheckpointTag` after a run. |
| Existing `checkpoint/*` tags remain operable. | FR-004, SC-003 | `git tag --list 'checkpoint/*'` enumeration + left-click jump-to-checkpoint smoke action. |
| No new `attempt-<ts>-<letter>` branches created post-cleanup. | FR-006, SC-007 | Branch-count diff against `dex-ecommerce` before / after the smoke run. |
