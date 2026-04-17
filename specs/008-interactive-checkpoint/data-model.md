# Phase 1 Data Model: Interactive Checkpoint

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Defines the authoritative shape of every entity this feature introduces or modifies: in-memory types, on-disk JSON, git-ref taxonomy, and state transitions.

---

## 1. DexState — schema changes

`DexState` lives at `<projectDir>/.dex/state.json`. Shape changes driven by S0 (P1–P4) and later slices.

### Removed

- `branchName: string` — (P1). Runtime state, not history. Derive from `git rev-parse --abbrev-ref HEAD` via `getCurrentBranch(projectDir)`.

### Renamed

- `checkpoint: { sha: string; timestamp: string }` → `lastCommit: { sha: string; timestamp: string }` (P2).
  Tracks the return of the most recent `commitCheckpoint` call. "Checkpoint" is now the user-facing, tag-backed domain term; `lastCommit` is unambiguous for this field.

### Added

```ts
export type PauseReason = "user_abort" | "step_mode" | "budget" | "failure";

export interface DexUiPrefs {
  recordMode?: boolean;        // auto-promote every stage attempt to canonical
  pauseAfterStage?: boolean;   // step mode
}

export interface DexState {
  // … existing unchanged fields (mode, status, currentStage, cyclesCompleted,
  // currentSpecDir, lastCompletedStage, artifacts, pendingClarification, runId, …)

  lastCommit: { sha: string; timestamp: string };   // renamed from `checkpoint`
  pauseReason?: PauseReason;                        // present iff status === "paused"
  ui?: DexUiPrefs;                                  // session-scoped UI prefs
}
```

### Invariants

- `status === "paused"` ⇒ `pauseReason` is set.
- `ui.recordMode === true` ⇒ `RecBadge` visible in topbar; every completed stage auto-promotes.
- `lastCommit.sha` is always a resolvable commit SHA in the project's git repo at the moment of write.
- `.dex/state.json` is **gitignored** (P3). Never committed; rebuilt by `reconcileState` on project open.

### Reconciliation (authoritative mode)

New responsibility for `reconcileState` (`src/core/state.ts:435-654`):

- On project open, if `.dex/state.json` is absent or stale, rebuild it from:
  - `git rev-parse --abbrev-ref HEAD` → current branch (no longer stored).
  - Latest `checkpoint/*` tag reachable from HEAD → inference of `currentStage` / `cyclesCompleted`.
  - `.dex/feature-manifest.json` → features and their cycles.
  - `.dex/runs/*.json` (most recent) → `runId`, `status` (if still "running" or "paused").
- After Go back / Try again / Try N ways — reconcile to the destination attempt.
- After an external ref change detected by the 30 s poll + focus — reconcile.

---

## 2. Git refs (history layer — authoritative, shared)

### Tags

| Pattern | Semantics |
|---|---|
| `checkpoint/after-<stage-slug>` | Pre-cycle stages (cycle 0): prerequisites, clarification_*, constitution, manifest_extraction. |
| `checkpoint/cycle-<N>-after-<stage-slug>` | Cycle stages (N ≥ 1): gap_analysis, specify, plan, tasks, implement, implement_fix, verify, learnings. |
| `checkpoint/done-<runId-slice>` | Written at run termination when Record mode is on. `runId-slice` is `runId.slice(0, 6)` — disambiguates multiple record-mode runs on the same day. |

- All three are **annotated tags** — carry tagger metadata and don't move once placed (except via `tag -f` on Keep this / record-mode auto-promote).
- **Slug rule**: `<stage-slug>` replaces `_` with `-` (e.g., `clarification_product` → `clarification-product`).

### Branches

| Pattern | Semantics | Lifetime |
|---|---|---|
| `attempt-<YYYYMMDDThhmmss>` | Scratch branch for a Go back / Try again. Created by `git checkout -B`. | 30-day auto-prune. |
| `attempt-<YYYYMMDDThhmmss>-<letter>` | Variant branch within a Try-N-ways group. `<letter>` ∈ {`a`, `b`, `c`, `d`, `e`}. | 30-day auto-prune. |
| `capture/<YYYY-MM-DD>-<runId-slice>` | Canonical anchor. Written at record-mode run termination via `git branch -f ... HEAD`. | Never auto-pruned. |

- **Always wrapped in `git checkout -B`** — detached HEAD never exposed (FR-007, R10#5).
- **Protected from prune**: `main`, `checkpoint/*` (tags immune anyway), `capture/*`, `lukas/*`.

### Commit messages

Every commit created by `commitCheckpoint` has this two-line structured format:

```
dex: <stage> completed [cycle:<N>] [feature:<slug>] [cost:$X.XX]
[checkpoint:<stage>:<cycle>]
```

- Line 1 is human-readable.
- Line 2 starts with `[checkpoint:` — constant `CHECKPOINT_MESSAGE_PREFIX` exported from `src/core/git.ts`.
- Parse-friendly: `git log --all --grep='^\[checkpoint:'` is the documented power-user query.
- `--allow-empty` — every stage gets its own distinct SHA, even `verify` that touches no files (R8).

---

## 3. In-memory types — core module

From `src/core/checkpoints.ts`. These surface to IPC and the renderer.

### CheckpointInfo — one entry per `checkpoint/*` tag

```ts
export interface CheckpointInfo {
  tag: string;             // e.g. "checkpoint/cycle-1-after-plan"
  label: string;           // e.g. "cycle 1 · cart · after plan" — from labelFor()
  sha: string;             // commit the tag points at
  stage: LoopStageType;    // parsed from tag
  cycleNumber: number;     // 0 for pre-cycle stages
  featureSlug: string | null;   // null for cycle 0
  commitMessage: string;   // full two-line message
  timestamp: string;       // ISO 8601
}
```

### AttemptInfo — one entry per `attempt-*` branch

```ts
export interface AttemptInfo {
  branch: string;              // e.g. "attempt-20260417T182301-b"
  sha: string;                 // current branch tip
  isCurrent: boolean;          // HEAD matches this branch
  baseCheckpoint: string | null;   // nearest ancestor checkpoint tag, or null if unknown
  stepsAhead: number;          // commits ahead of baseCheckpoint
  timestamp: string;           // created-at (from branch name)
  variantGroup: string | null; // groupId if part of a fan-out
}
```

### PendingCandidate — a commit awaiting promotion

A stage just completed but hasn't been promoted yet (step mode, or pre-promotion snapshot).

```ts
export interface PendingCandidate {
  checkpointTag: string;   // the tag that *would* be written on Keep this
  candidateSha: string;    // SHA of the candidate commit
  stage: LoopStageType;
  cycleNumber: number;
}
```

### TimelineSnapshot — one `listTimeline` return value

```ts
export interface TimelineSnapshot {
  checkpoints: CheckpointInfo[];
  attempts: AttemptInfo[];
  currentAttempt: AttemptInfo | null;
  pending: PendingCandidate[];
  captureBranches: string[];      // zero or more `capture/<date>-<runId>`
}
```

### VariantSpawnRequest / VariantSpawnResult

```ts
export interface VariantSpawnRequest {
  fromCheckpoint: string;      // tag name
  variantLetters: string[];    // e.g. ["a", "b", "c"]
  stage: LoopStageType;        // determines parallel vs sequential (see isParallelizable)
}

export interface VariantSpawnResult {
  groupId: string;                 // UUID
  branches: string[];              // created attempt branches
  worktrees: string[] | null;      // non-null for parallel; null for sequential
  parallel: boolean;
}
```

---

## 4. Variant group state file (on disk)

Path: `<projectDir>/.dex/variant-groups/<groupId>.json` (gitignored). One file per in-flight Try-N-ways group. Deleted on Keep this / Discard all via `checkpoints:cleanupVariantGroup`.

### Schema

```ts
export type VariantStatus = "pending" | "running" | "completed" | "failed";

export interface VariantGroupFile {
  groupId: string;                  // UUID (matches filename stem)
  fromCheckpoint: string;           // tag name of the fork point
  stage: LoopStageType;             // the stage being fanned out
  parallel: boolean;                // true iff isParallelizable(stage)
  createdAt: string;                // ISO 8601
  variants: Array<{
    letter: string;                 // "a" | "b" | …
    branch: string;                 // attempt-<ts>-<letter>
    worktree: string | null;        // ".dex/worktrees/attempt-<ts>-<letter>" or null
    status: VariantStatus;
    runId: string | null;           // filled in when variant starts running
    candidateSha: string | null;    // filled in on variant completion
    errorMessage: string | null;    // filled in if status === "failed"
  }>;
  resolved: {
    kind: "keep" | "discard" | null;   // null while group is still open
    pickedLetter: string | null;       // present iff kind === "keep"
    resolvedAt: string | null;
  };
}
```

### Lifecycle state machine

```
spawned  ──(all variants pending)──▶  running  ──(all variants completed|failed)──▶  awaiting-decision
   │                                      │                                                  │
   ▼                                      ▼                                                  ▼
 one variant process crashes          one variant finishes,               Keep this / Discard all
 while others run → remaining         others still running                         │
 continue; crashed marked             → stay in "running" until                    ▼
 "failed"                             all variants settle                   file deleted
```

### Atomic writes

All writes use `writeFileSync(tmp); renameSync(tmp, target)` — consistent with feature 007's pattern. Enables safe concurrent reads for resume detection.

### Resume rules

On orchestrator startup (after `acquireStateLock`):

1. Scan `.dex/variant-groups/*.json`.
2. For each file where any variant has `status === "pending"` or `status === "running"`:
   - Emit `variant_group_resume_needed` event → UI opens "Continue variant group" modal.
   - User confirms → orchestrator resumes:
     - `status === "pending"` variants → spawn via `runSingleVariant`.
     - `status === "running"` variants → process died mid-run; restart from `fromCheckpoint`. Worktree may or may not exist; recreate if missing.
3. On Keep this: promote picked variant's `candidateSha`, clean up other worktrees, set `resolved`, emit `variant_group_complete`, delete file.
4. On Discard all: clean up all worktrees, set `resolved`, emit `variant_group_complete`, delete file.

**Resume has priority over new-run initiation** — Start button blocked until user resolves all pending groups.

---

## 5. RunRecord / PhaseRecord — additions to feature-007 audit JSON

Feature 007 established `<projectDir>/.dex/runs/<runId>.json` with `RunRecord` + embedded `PhaseRecord[]`. This feature adds two fields per phase record:

```ts
export interface PhaseRecord {
  // … existing 007 fields (phaseTraceId, stage, cycleNumber, status,
  // costUsd, durationMs, startedAt, completedAt, subagents, …)

  checkpointTag?: string;       // e.g. "checkpoint/cycle-1-after-plan"
  candidateSha?: string;        // commit SHA of this phase's candidate
}
```

- **Written by** `completePhase(projectDir, runId, phaseTraceId, { … checkpointTag, candidateSha })` in `runs.ts` (existing call site in `orchestrator.ts:1213-1232`, now extended).
- **Absent on pre-008 runs** — readers tolerate `undefined`.
- **Not the authoritative record of a checkpoint** — the git tag is. These fields are a convenience for the cost estimator (R11) and for the DEBUG badge.

---

## 6. OrchestratorEvent additions

From `src/core/types.ts`. These flow through the existing event stream and are consumed by renderer hooks.

```ts
export type OrchestratorEvent =
  // … existing variants
  | { type: "stage_candidate"; runId: string; cycleNumber: number; stage: LoopStageType;
      checkpointTag: string; candidateSha: string; attemptBranch: string }

  | { type: "checkpoint_promoted"; runId: string; checkpointTag: string; sha: string }

  | { type: "paused"; runId: string; reason: PauseReason; stage?: LoopStageType }

  | { type: "variant_group_resume_needed"; projectDir: string; groupId: string; stage: LoopStageType;
      pendingCount: number; runningCount: number }

  | { type: "variant_group_complete"; groupId: string }
  ;
```

### Emission sites

- `stage_candidate` — fires after every `commitCheckpoint` (S3). Contains everything the UI needs to render a pending node: tag, SHA, attempt branch, cycle, stage.
- `checkpoint_promoted` — fires only after `promoteToCheckpoint` succeeds (either via Record mode auto-promote or explicit Keep this IPC).
- `paused` — now always includes `reason` (typed; was implicit before S4).
- `variant_group_resume_needed` — fires at orchestrator startup when pending variant groups are detected (§4 Resume rules).
- `variant_group_complete` — fires when all variants in a group reach a terminal status.

---

## 7. Stage classification

Single source of truth in `src/core/checkpoints.ts`:

```ts
const PARALLELIZABLE_STAGES: LoopStageType[] = [
  "gap_analysis", "specify", "plan", "tasks", "learnings"
];

export function isParallelizable(stage: LoopStageType): boolean {
  return PARALLELIZABLE_STAGES.includes(stage);
}
```

Serial (not in the list): `prerequisites`, `clarification_product`, `clarification_technical`, `clarification_synthesis`, `constitution`, `manifest_extraction`, `implement`, `implement_fix`, `verify`.

**Rationale** and the full policy are in research.md R2. Stage membership evolves by editing this list only.

---

## 8. User-facing label formatting

Single function in `src/core/checkpoints.ts`:

```ts
export function labelFor(
  stage: LoopStageType,
  cycleNumber: number,
  featureSlug?: string
): string;
```

### Output table

| Stage | cycleNumber = 0 | cycleNumber = 1, featureSlug = "cart" |
|---|---|---|
| `prerequisites` | `"prerequisites done"` | n/a (cycle 0 only) |
| `clarification_product` | `"product questions answered"` | n/a |
| `clarification_technical` | `"technical questions answered"` | n/a |
| `clarification_synthesis` | `"requirements synthesized"` | n/a |
| `constitution` | `"constitution drafted"` | n/a |
| `manifest_extraction` | `"features identified"` | n/a |
| `gap_analysis` | `"gap analysis done"` | `"cycle 1 · cart · gap analysis done"` |
| `specify` | `"spec written"` | `"cycle 1 · cart · spec written"` |
| `plan` | `"plan written"` | `"cycle 1 · cart · plan written"` |
| `tasks` | `"tasks generated"` | `"cycle 1 · cart · tasks generated"` |
| `implement` | `"implementation done"` | `"cycle 1 · cart · implementation done"` |
| `implement_fix` | `"fixes applied"` | `"cycle 1 · cart · fixes applied"` |
| `verify` | `"verification done"` | `"cycle 1 · cart · verification done"` |
| `learnings` | `"learnings captured"` | `"cycle 1 · cart · learnings captured"` |

Property test covers `(stage × cycles ∈ {0, 1, 7})` — all outputs distinct for cycle ≥ 1; cycle 0 distinctness guaranteed by the `pretty` table.

---

## 9. Entity-relationship summary

```text
DexState
 ├── lastCommit: { sha, timestamp }          [cache only, never committed]
 ├── pauseReason?: PauseReason
 ├── ui?: { recordMode?, pauseAfterStage? }
 └── (no branchName — derived)

git refs (shared authoritative history)
 ├── tag  checkpoint/after-<stage>                         (cycle 0)
 ├── tag  checkpoint/cycle-<N>-after-<stage>               (cycle ≥ 1)
 ├── tag  checkpoint/done-<runId-slice>                    (record-mode termination)
 ├── branch attempt-<ts>                                   (Go back / Try again)
 ├── branch attempt-<ts>-<letter>                          (variant)
 └── branch capture/<date>-<runId-slice>                   (record-mode anchor)

<projectDir>/.dex/variant-groups/<groupId>.json            [gitignored, resume state]
 ├── groupId, fromCheckpoint, stage, parallel
 ├── variants[] (letter, branch, worktree, status, runId, candidateSha, errorMessage)
 └── resolved { kind, pickedLetter, resolvedAt }

<projectDir>/.dex/runs/<runId>.json                        [from 007, now extended]
 └── phases[] { …existing, checkpointTag?, candidateSha? }

OrchestratorEvent (renderer stream)
 ├── stage_candidate
 ├── checkpoint_promoted
 ├── paused (now carries reason)
 ├── variant_group_resume_needed
 └── variant_group_complete
```

---

## 10. Migration / compatibility posture

**Dev-phase, no migration** (spec Assumptions):

- `DexState.branchName` — stripped on first load (no warning, no preservation).
- `DexState.checkpoint` — mechanically renamed to `lastCommit` in-place (single PR, single find-and-replace).
- Legacy `fixture/*` branches on `dex-ecommerce` — deleted once in P8. Not re-created, not translated.
- Pre-008 `<projectDir>/.dex/runs/<runId>.json` — readers tolerate missing `checkpointTag` / `candidateSha`. No up-migration job.
- Pre-008 `state.json` that was committed — silently `git rm --cached` on first post-upgrade launch (per P3).
