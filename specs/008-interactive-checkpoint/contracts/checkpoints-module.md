# Contract: `src/core/checkpoints.ts`

**Owner**: This feature. Pure Node.js — no electron imports. Standalone-testable.

The core module for checkpoint naming, promotion, go-back, dirty-tree detection, and variant spawning. Consumed by (a) the orchestrator for auto-capture and record-mode auto-promote, (b) the main-process IPC handlers in `src/main/ipc/checkpoints.ts`, (c) the dev CLI scripts (`promote-checkpoint.sh`, `reset-example-to.sh`).

All exported functions are **pure** except where noted (they invoke git via `exec` from `src/core/git.ts`). No module-level state. No I/O other than git subprocess calls and small file reads/writes under `<projectDir>/.dex/`.

---

## Public surface

### Constants

```ts
export const CHECKPOINT_MESSAGE_PREFIX = "[checkpoint:";
```

Exported for any parser (UI candidate detection, CLI scripts) that needs to recognise Dex-created commits.

---

### Naming

```ts
export function checkpointTagFor(stage: LoopStageType, cycleNumber: number): string;
```

- **cycleNumber === 0** → `"checkpoint/after-<slug(stage)>"`.
- **cycleNumber ≥ 1** → `"checkpoint/cycle-<N>-after-<slug(stage)>"`.
- **Slug rule**: `_` → `-` (`clarification_product` → `clarification-product`).

```ts
export function checkpointDoneTag(runId: string): string;
```

- Returns `"checkpoint/done-<runId.slice(0, 6)>"`.

```ts
export function captureBranchName(runId: string, date?: Date): string;
```

- Returns `"capture/<YYYY-MM-DD>-<runId.slice(0, 6)>"`. Accepts optional `date` for deterministic testing.

```ts
export function attemptBranchName(date?: Date, variant?: string): string;
```

- Returns `"attempt-<YYYYMMDDThhmmss>"` or `"attempt-<ts>-<letter>"`.
- Timestamp format: ISO 8601 with `:` / `.` stripped, truncated to 15 chars.
- `variant` is the letter suffix (`"a"`, `"b"`, …).

```ts
export function labelFor(
  stage: LoopStageType,
  cycleNumber: number,
  featureSlug?: string
): string;
```

- Maps stage → pretty label via internal constant table.
- **cycleNumber === 0** → label only (`"plan written"`).
- **cycleNumber ≥ 1** → `"cycle <N> · <featureSlug?> · <pretty>"` (featureSlug omitted if absent).
- Property-tested for distinctness across `(stage × cycle ∈ {0, 1, 7})`.

---

### Stage classification

```ts
export function isParallelizable(stage: LoopStageType): boolean;
```

- Returns `true` only for: `gap_analysis`, `specify`, `plan`, `tasks`, `learnings`.
- Classification lives in a single module-level constant array `PARALLELIZABLE_STAGES`. New stages opt in/out by editing that array.

---

### Promotion

```ts
export function promoteToCheckpoint(
  projectDir: string,
  tag: string,
  candidateSha: string,
  rlog: RunLogger
): { ok: true } | { ok: false; error: string };
```

**Behaviour**:

1. Verify `candidateSha` resolves via `git rev-parse --verify <candidateSha>`.
2. `git tag -f <tag> <candidateSha>` — move or create the annotated tag.
3. Log `INFO promoteToCheckpoint: <tag> → <sha-short>`.

**Returns**:
- `{ ok: true }` on success.
- `{ ok: false, error }` on any git failure (bad SHA, permission issue, etc.). Canonical timeline unchanged.

**Idempotent**: re-promoting the same `(tag, sha)` succeeds and is a no-op effect.

---

### Go back (start a fresh attempt from a checkpoint)

```ts
export function startAttemptFrom(
  projectDir: string,
  checkpointTag: string,
  rlog: RunLogger,
  variant?: string
): { ok: true; branch: string } | { ok: false; error: string };
```

**Contract**:

1. Verify `refs/tags/<checkpointTag>` exists.
2. **Dirty-tree check is the CALLER's responsibility** — this function assumes the caller has already resolved FR-005 (Save/Discard/Cancel modal). IPC handlers enforce this.
3. `git checkout -B <attempt-branch> <checkpointTag>` — always `-B` so HEAD is never detached.
4. `git clean -fd -e .dex/state.lock` — **never `-fdx`**. Preserves gitignored files (`.env`, build output, editor state, `.dex/variant-groups/`, `.dex/worktrees/`). Removes stray untracked files created by the now-abandoned attempt.

**Returns**:
- `{ ok: true, branch }` — `branch` is the new attempt branch name.
- `{ ok: false, error }` — tag missing, git operation failed.

---

### Dirty-tree check

```ts
export function isWorkingTreeDirty(
  projectDir: string
): { dirty: boolean; files: string[] };
```

- Runs `git status --porcelain`. Respects `.gitignore`.
- `files[]` are affected paths (path portion of each porcelain line).

Used by `checkpoints:goBack` IPC to decide whether to return the `dirty_working_tree` error envelope.

---

### Variant spawning

```ts
export interface VariantSpawnRequest {
  fromCheckpoint: string;      // tag name
  variantLetters: string[];    // e.g. ["a", "b", "c"]
  stage: LoopStageType;
}

export interface VariantSpawnResult {
  groupId: string;             // UUID
  branches: string[];
  worktrees: string[] | null;  // non-null iff parallel
  parallel: boolean;
}

export function spawnVariants(
  projectDir: string,
  request: VariantSpawnRequest,
  rlog: RunLogger
): { ok: true; result: VariantSpawnResult } | { ok: false; error: string };
```

**Contract**:

- `parallel = isParallelizable(request.stage)`.
- **Parallel path (spec-only stages)**: for each letter, `git worktree add -b <attempt-branch> <projectDir>/.dex/worktrees/<branch> <fromCheckpoint>`. Records both the branch and the worktree path.
- **Sequential path (implement/verify/…)**: for each letter, `git branch <attempt-branch> <fromCheckpoint>`. No worktrees.
- **Rollback on partial failure**: any created worktree is `git worktree remove --force`-ed; any created branch is `git branch -D`-ed. Returns `{ok: false, error}`.

**Returns**:
- `{ok: true, result}` — fully populated result.
- `{ok: false, error}` — partial state cleaned up before return.

---

### Worktree cleanup

```ts
export function cleanupVariantWorktree(
  projectDir: string,
  worktreePath: string
): void;
```

- `git worktree remove --force <path>`. Swallows "already removed / never existed" errors.
- Used by `checkpoints:cleanupVariantGroup` after Keep this / Discard all.

---

### Listing

```ts
export interface CheckpointInfo {
  tag: string; label: string; sha: string;
  stage: LoopStageType; cycleNumber: number; featureSlug: string | null;
  commitMessage: string; timestamp: string;
}

export interface AttemptInfo {
  branch: string; sha: string; isCurrent: boolean;
  baseCheckpoint: string | null; stepsAhead: number; timestamp: string;
  variantGroup: string | null;
}

export interface PendingCandidate {
  checkpointTag: string; candidateSha: string;
  stage: LoopStageType; cycleNumber: number;
}

export interface TimelineSnapshot {
  checkpoints: CheckpointInfo[];
  attempts: AttemptInfo[];
  currentAttempt: AttemptInfo | null;
  pending: PendingCandidate[];
  captureBranches: string[];
}

export function listTimeline(projectDir: string): TimelineSnapshot;
```

**Behaviour**:

- `git tag --list 'checkpoint/*'` → `CheckpointInfo[]`. For each tag: resolve SHA, read commit message, parse stage/cycle from tag name, call `labelFor`.
- `git branch --list 'attempt-*'` → `AttemptInfo[]`. Resolve tip SHA; `currentAttempt` matches `git rev-parse --abbrev-ref HEAD` if it starts with `attempt-`. Parse variant group letter via filename regex.
- `git log --all --grep='^\[checkpoint:' --format=…` → candidates that aren't yet tagged → `PendingCandidate[]`.
- `git branch --list 'capture/*'` → `captureBranches`.
- **Entries whose underlying SHA cannot be resolved** (e.g., GC'd) → included but with sentinel values that the UI renders as `(unavailable — refresh)`.

**Pure read** — does not mutate state. Safe to call without the state-lock.

---

## Behaviour summary (for test writers)

| Function | git commands | Mutates | Safe without state-lock? |
|---|---|---|---|
| `checkpointTagFor` | — | no | yes |
| `checkpointDoneTag` | — | no | yes |
| `captureBranchName` | — | no | yes |
| `attemptBranchName` | — | no | yes |
| `labelFor` | — | no | yes |
| `isParallelizable` | — | no | yes |
| `promoteToCheckpoint` | `rev-parse`, `tag -f` | yes | **no** |
| `startAttemptFrom` | `rev-parse`, `checkout -B`, `clean -fd` | yes | **no** |
| `isWorkingTreeDirty` | `status --porcelain` | no | yes |
| `spawnVariants` (parallel) | `worktree add -b` × N | yes | **no** |
| `spawnVariants` (sequential) | `branch` × N | yes | **no** |
| `cleanupVariantWorktree` | `worktree remove --force` | yes | **no** |
| `listTimeline` | `tag --list`, `branch --list`, `log --grep`, `rev-parse` | no | yes |

---

## Test matrix (unit / property)

See `src/core/__tests__/checkpoints.test.ts`. Tests run with `node --test` against a tmpdir git repo.

| Case | Assertion |
|---|---|
| Naming round-trip | For every `(stage, cycle ∈ {0, 1, 7})`, `labelFor` and `checkpointTagFor` produce distinct strings. |
| `checkpointTagFor` slug rule | `clarification_product` / cycle 0 → `checkpoint/after-clarification-product`. |
| `isParallelizable` | true for each of the five spec stages; false for implement/implement_fix/verify + every pre-cycle stage. |
| `promoteToCheckpoint` happy path | Tag exists at given SHA after call. |
| `promoteToCheckpoint` idempotent | Calling twice with same args succeeds; tag still at the SHA. |
| `promoteToCheckpoint` bad SHA | Returns `{ok: false}`; no tag created. |
| `startAttemptFrom` happy path | HEAD resolves to checkpoint SHA; current branch starts with `attempt-`. |
| `startAttemptFrom` preserves `.env`-like files | Seed repo with `.env` (gitignored); post-call `.env` still present. |
| `startAttemptFrom` removes stray untracked | Seed repo with stray untracked file not in `.gitignore`; post-call gone. |
| `startAttemptFrom` missing tag | Returns `{ok: false}`. |
| `spawnVariants` parallel | 3 worktrees created at `.dex/worktrees/attempt-…-{a,b,c}`; 3 branches exist; `parallel === true`. |
| `spawnVariants` sequential | 3 branches only; `worktrees === null`; `parallel === false`. |
| `spawnVariants` partial-failure rollback | Simulate 2nd worktree-add failure → both partial artefacts removed; returns `{ok: false}`. |
| `listTimeline` against seeded tmpdir | Correct counts; sentinel for GC'd tag; `currentAttempt` matches HEAD. |

---

## Non-goals

- No filesystem read/write outside of git subprocess calls. File-based variant-group state is owned by the IPC handler, not this module.
- No event emission. Events are the orchestrator's responsibility.
- No Electron or renderer integration. This module can be imported by CLI scripts with no side effects.
