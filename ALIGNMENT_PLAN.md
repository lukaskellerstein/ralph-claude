# Plan: Filesystem-First State Management with Git Checkpoints

## Context

Project state is split between SQLite DB, in-memory variables, and filesystem artifacts. On pause/resume they diverge: DB says one thing, `tasks.md` says another, in-memory state is lost. Manual edits to project files (deleting specs, editing tasks) make it worse — there's no drift detection.

**Goal**: Single source of truth via `.dex/state.json` committed to the branch, with artifact integrity checking and git checkpoints. DB demoted to append-only audit log.

---

## Architecture

### Three pillars

1. **`.dex/state.json`** (committed to git) — orchestrator position, failure counts, config snapshot, artifact manifest with content hashes
2. **Git commits as checkpoints** — one commit per stage, state file records previous checkpoint SHA for drift detection
3. **Integrity reconciliation on resume** — verify artifacts still exist and match, detect manual edits, decide what to re-run

### State file lives in the branch

- Committed after each stage → branch-scoped automatically
- Merge to main → `branchName` check detects stale state → deleted on next fresh start
- Process crash → committed version is last checkpoint, working-tree version may be one step ahead → both are valid resume points

---

## New file: `src/core/state.ts`

### `DexState` interface

```typescript
interface DexState {
  version: 1;
  runId: string;
  status: "running" | "paused" | "completed" | "failed";
  branchName: string;
  baseBranch: string;
  mode: "loop" | "build" | "plan";

  // Position cursor
  phase: "prerequisites" | "clarification" | "loop";
  currentCycleNumber: number;
  lastCompletedStage: LoopStageType | null;
  currentSpecDir: string | null;
  currentPhaseNumber: number | null;

  // Clarification
  clarificationCompleted: boolean;
  fullPlanPath: string | null;

  // Accumulators
  cumulativeCostUsd: number;
  cyclesCompleted: number;
  featuresCompleted: string[];
  featuresSkipped: string[];

  // Failure tracking (replaces in-memory Map + DB failure_tracker)
  failureCounts: Record<string, { implFailures: number; replanFailures: number }>;

  // Config snapshot for resume
  config: {
    model: string;
    maxLoopCycles?: number;
    maxBudgetUsd?: number;
    maxTurns: number;
    maxIterations: number;
    autoClarification?: boolean;
  };

  // Artifact integrity manifest
  artifacts: {
    goalFile: ArtifactEntry | null;
    clarifiedGoal: ArtifactEntry | null;
    productDomain: ArtifactEntry | null;
    technicalDomain: ArtifactEntry | null;
    constitution: ArtifactEntry | null;
    features: Record<string, FeatureArtifacts>;
  };

  // Git checkpoint
  checkpoint: {
    sha: string;       // HEAD SHA after last committed checkpoint
    timestamp: string;
  };

  // Timestamps
  startedAt: string;
  pausedAt: string | null;
}

interface ArtifactEntry {
  path: string;          // Relative to project root
  sha256: string;        // Content hash at checkpoint time
  completedAt: string;
}

interface FeatureArtifacts {
  specDir: string;
  status: "specifying" | "planning" | "implementing" | "verifying" | "completed" | "skipped";
  spec: ArtifactEntry | null;
  plan: ArtifactEntry | null;
  tasks: TasksArtifact | null;
  lastImplementedPhase: number;
}

interface TasksArtifact extends ArtifactEntry {
  taskChecksums: Record<string, boolean>; // task ID → was-checked
}
```

### Functions

```typescript
// Atomic write: write .tmp then rename
saveState(projectDir: string, state: DexState): void

// Read + parse + version check, null on missing/corrupt
loadState(projectDir: string): DexState | null

// Delete state file (on clean completion)
clearState(projectDir: string): void

// Read-merge-write for partial updates
updateState(projectDir: string, patch: Partial<DexState>): void

// SHA-256 of file contents
hashFile(filePath: string): string

// Check if state file is from current branch or stale
detectStaleState(projectDir: string): "fresh" | "stale" | "completed" | "none"

// Build initial state from RunConfig
createInitialState(config: RunConfig, runId: string, branchName: string, baseBranch: string): DexState

// The key function: verify artifacts match state, return reconciliation plan
reconcileState(projectDir: string, state: DexState): ReconciliationResult
```

---

## Integrity reconciliation (`reconcileState`)

Runs on resume before entering the loop. Three checks:

### 1. Git checkpoint comparison

```
currentHead = git rev-parse HEAD
expectedSha = state.checkpoint.sha
If currentHead !== expectedSha:
  count commits between them → drift.extraCommits
```

### 2. Artifact existence + hash check

For each artifact in the manifest:
- File missing → `drift.missing.push(path)`
- File exists but hash differs → `drift.modified.push(path)`

For `tasks.md` specifically: compare task checkbox states against `taskChecksums`:
- Task unchecked that was checked → `drift.taskRegressions[specDir].push(taskId)`
- Task checked that was unchecked → `drift.taskProgressions[specDir].push(taskId)` (accept as manual progress)

### 3. Reconciliation decision matrix

| Drift | Action |
|---|---|
| No drift | Resume from `lastCompletedStage + 1` |
| `GOAL_clarified.md` deleted | Reset to clarification |
| `GOAL_clarified.md` modified | Ask user: re-run gap analysis? |
| `spec.md` deleted for feature X | Reset feature X to "specifying" |
| `plan.md` deleted for feature X | Reset feature X to "planning" |
| Tasks unchecked in `tasks.md` | Resume implement from earliest unchecked phase |
| Tasks newly checked | Accept progression, update state |
| Extra commits after checkpoint | Warn, update checkpoint, proceed |
| `constitution.md` deleted | Re-run constitution before next cycle |

**Principle: Never start over. Find the furthest-back stage that needs re-running.**

### `ReconciliationResult`

```typescript
interface ReconciliationResult {
  canResume: boolean;
  resumeFrom: { phase: string; cycleNumber: number; stage: LoopStageType; specDir?: string };
  warnings: string[];    // Shown to user, don't block
  blockers: string[];    // Require user decision via user_input_request
  statePatches: Partial<DexState>;
}
```

When `blockers.length > 0`, emit `user_input_request` asking the user to choose: "Re-run from X" or "Accept current state."

---

## Git checkpoint protocol

After each stage completes:

1. Update `state.json` with new `lastCompletedStage`, updated artifact hashes
2. `git add -A && git commit -m "dex: <stage> completed [cycle:<N>] [feature:<name>]"`
3. `state.json.checkpoint.sha = git rev-parse HEAD`
4. Write updated `state.json` to disk (NOT committed yet — sits in working tree)

On next stage, step 2 picks up the updated checkpoint SHA.

**On crash**: committed state.json has the previous checkpoint SHA. Working-tree may have the latest. Both are valid resume points — reconciliation handles the 1-commit gap.

**Commit message format** (machine-parseable):

```
dex: <stage_type> completed [cycle:<N>] [feature:<name>] [cost:$<X.XX>]
```

---

## Changes to existing files

### `src/core/types.ts`
- Remove `resumeRunId?: string` from `RunConfig` (line 173)
- Add `resume?: boolean` to `RunConfig`
- Export `DexState`, `ArtifactEntry`, `FeatureArtifacts`, `TasksArtifact`, `ReconciliationResult`

### `src/core/orchestrator.ts`
- Import state functions from `state.ts`
- **`run()` (~line 1291)**: After `createRun()`, call `saveState()` with initial state. In `finally` block: write `status="paused"` if stopped, `clearState()` if completed
- **`runLoop()` (~line 1735-1759)**: Replace the `if (config.resumeRunId)` block with:
  - `loadState()` from state file
  - `reconcileState()` to check integrity
  - Restore position, failure counts, accumulators from state — not from DB
- **Remove `loadFailureRecords()`** (lines 1711-1718) — failure counts come from state file
- **After each stage**: call `saveState()` + git commit checkpoint
- **`stopRun()`**: Store `projectDir` in module-level var so finally block can write paused state

### `src/core/git.ts`
- Add `commitCheckpoint(projectDir, stage, cycleNumber, featureName, cost): string` — stages all, commits with structured message, returns new HEAD SHA
- Add `getHeadSha(projectDir): string`
- Add `countCommitsBetween(projectDir, fromSha, toSha): number`

### `src/main/ipc/orchestrator.ts`
- Add `orchestrator:getProjectState` handler that reads state file for a given projectDir
- Update `orchestrator:getRunState`: when not running, fall back to state file

### `src/main/preload.ts` + `src/renderer/electron.d.ts`
- Add `getProjectState(dir: string)` to exposed API

### `src/renderer/hooks/useOrchestrator.ts`
- Mount effect (line 132+): For paused state detection, call `getProjectState()` — no need to reverse-engineer from DB phase traces
- Simplify `loadRunHistory()` — state file explicitly says status and position

### `src/renderer/App.tsx`
- `handleStartLoop()` (line 198): Replace `resumeRunId?: string` with `resume?: boolean`
- `handleStart()` (line 242): Pass `resume: true` instead of `resumeRunId`

### `src/core/database.ts`
- **All writes stay** — DB is the audit trail
- `getActiveRunState()` can be deprecated (no longer used for resume)
- `failure_tracker` table writes stay for history but are not read for resume

---

## Merge-to-main handling

State file includes `branchName`. On any loop start:

```typescript
detectStaleState(projectDir):
  "none"      → no state file → fresh start
  "completed" → status is completed → delete state, fresh start
  "stale"     → branchName !== current branch → delete state, fresh start
  "fresh"     → same branch, paused/running → offer resume
```

On clean loop completion: set `status: "completed"`, commit. State file persists as inert record.

---

## Implementation order

1. Create `src/core/state.ts` — types, read/write/clear, hash, reconciliation
2. Add `commitCheckpoint()` to `src/core/git.ts`
3. Wire state file writes into `orchestrator.ts` at all stage transitions (additive — both DB and state file)
4. Replace resume-from-DB with resume-from-state-file in `runLoop()`
5. Update `RunConfig` type: `resume: boolean` replaces `resumeRunId`
6. Update IPC handlers + preload + electron.d.ts
7. Update renderer hooks + App.tsx
8. Ensure `.dex/state.json` is NOT gitignored (it should be committed to the branch)

---

## Verification

1. `npx tsc --noEmit` passes
2. Start loop → verify `.dex/state.json` created and updates at each stage
3. Pause mid-run → verify state file has `status: "paused"` with correct position + artifact hashes
4. Resume → verify picks up from correct stage, no duplicate execution
5. Kill Electron process → restart → verify UI shows paused state from state file
6. Manually delete a spec folder → resume → verify reconciliation detects it and re-runs from specify
7. Manually uncheck tasks in `tasks.md` → resume → verify it re-runs implement from the right phase
8. Let loop complete → verify state file set to "completed" and cleaned up on next start
9. Check `.dex/state.json` appears in git commits on the branch
