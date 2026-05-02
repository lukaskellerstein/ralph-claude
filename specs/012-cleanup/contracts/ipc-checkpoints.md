# Contract: `dexAPI.checkpoints` after cleanup

**Status**: post-cleanup target shape
**Source files**: `src/renderer/electron.d.ts`, `src/main/preload-modules/checkpoints-api.ts`, `src/main/ipc/checkpoints.ts`, `src/renderer/services/checkpointService.ts`.

## After-state surface

```ts
interface CheckpointsApi {
  // Read-only inspection
  listTimeline(projectDir: string): Promise<TimelineSnapshot>;
  checkIsRepo(projectDir: string): Promise<boolean>;
  checkIdentity(projectDir: string): Promise<{
    name: string | null;
    email: string | null;
    suggestedName: string;
    suggestedEmail: string;
  }>;

  // Repo bootstrap
  initRepo(projectDir: string): Promise<{ ok: true } | { ok: false; error: string }>;
  setIdentity(
    projectDir: string,
    name: string,
    email: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;

  // Branch management (Go-Back, drop-from-selected-path)
  unselect(
    projectDir: string,
    branchName: string,
  ): Promise<
    | { ok: true; switchedTo: string | null; deleted: string }
    | { ok: false; error: string }
    | { ok: false; error: "locked_by_other_instance" }
  >;

  // Jump-to-checkpoint (left-click on commit)
  jumpTo(
    projectDir: string,
    targetSha: string,
    options?: { force?: "save" | "discard" },
  ): Promise<JumpToResult | { ok: false; error: "locked_by_other_instance" }>;

  // Sync state.json after manual git operations
  syncStateFromHead(projectDir: string): Promise<
    | { ok: true; updated: boolean; step?: string; cycle?: number }
    | { ok: false; error: string }
    | { ok: false; error: "locked_by_other_instance" }
  >;
}
```

## IPC channel inventory (after-state)

| Channel | Handler file | Purpose |
|---------|-------------|---------|
| `checkpoints:listTimeline` | `src/main/ipc/checkpoints.ts` | Render Timeline graph from git refs |
| `checkpoints:checkIsRepo` | `src/main/ipc/checkpoints.ts` | InitRepoPrompt gate |
| `checkpoints:checkIdentity` | `src/main/ipc/checkpoints.ts` | IdentityPrompt gate |
| `checkpoints:initRepo` | `src/main/ipc/checkpoints.ts` | One-click repo init + `.gitignore` seed |
| `checkpoints:setIdentity` | `src/main/ipc/checkpoints.ts` | One-click `git config user.*` |
| `checkpoints:unselect` | `src/main/ipc/checkpoints.ts` | Drop-from-selected-path |
| `checkpoints:jumpTo` | `src/main/ipc/checkpoints.ts` | Left-click jump-to-checkpoint |
| `checkpoints:syncStateFromHead` | `src/main/ipc/checkpoints.ts` | Recover state after manual git ops |

## Removed channels

| Channel | Reason for removal |
|---------|-------------------|
| `checkpoints:estimateVariantCost` | Variants feature retired (FR-007) |
| `checkpoints:readPendingVariantGroups` | Variants feature retired (FR-007) |
| `checkpoints:promote` | "Keep this" verb retired (FR-007). Auto-promote in Record Mode reaches `promoteToCheckpoint` directly via the engine — does not need IPC. |
| `checkpoints:unmark` | "Unmark kept" verb retired (FR-007) |
| `checkpoints:spawnVariants` | "Try N ways from here" retired (FR-007) |
| `checkpoints:cleanupVariantGroup` | Variant compare/resume retired (FR-007) |
| `checkpoints:compareAttempts` | Only renderer caller was `VariantCompareModal`, which is deleted (FR-007) |

## Removed renderer-service methods

| Method | Underlying channel |
|--------|-------------------|
| `estimateVariantCost(projectDir, step, variantCount)` | `checkpoints:estimateVariantCost` |
| `readPendingVariantGroups(projectDir)` | `checkpoints:readPendingVariantGroups` |
| `promote(projectDir, tag, sha)` | `checkpoints:promote` |
| `unmark(projectDir, sha)` | `checkpoints:unmark` |
| `spawnVariants(projectDir, request)` | `checkpoints:spawnVariants` |
| `cleanupVariantGroup(projectDir, groupId, kind, pickedLetter?)` | `checkpoints:cleanupVariantGroup` |
| `compareAttempts(projectDir, branchA, branchB, step)` | `checkpoints:compareAttempts` |

## Removed type imports

In `src/renderer/electron.d.ts:10-16` and `src/renderer/services/checkpointService.ts:7-10`, the type-only imports from `../core/checkpoints.js` shrink to:

```ts
import type {
  TimelineSnapshot,
  JumpToResult,
} from "../core/checkpoints.js";
```

The `VariantGroupFile`, `VariantSpawnRequest`, `VariantSpawnResult` imports are removed.

In `src/renderer/electron.d.ts:17-20`, the `ProfileEntry` and `DexJsonShape` imports from `../core/agent-profile.js` are **kept** — they support the unrelated `profiles` IPC shape (lines 147–148).

## Verification

| Check | Command |
|------:|---------|
| Type-check passes | `npx tsc --noEmit` |
| Removed methods absent from renderer service | `grep -nE "estimateVariantCost\|readPendingVariantGroups\|spawnVariants\|cleanupVariantGroup\|compareAttempts" src/renderer/services/` returns zero hits |
| Removed channels absent from IPC | `grep -nE "checkpoints:(promote\|unmark\|spawnVariants\|cleanupVariantGroup\|readPendingVariantGroups\|estimateVariantCost\|compareAttempts)" src/main/` returns zero hits |
| Documented method-set test mirrors after-state | `npm test src/renderer/services/__tests__/checkpointService.test.ts` — "exposes the documented method set" assertion lists exactly the 9 surviving methods |
