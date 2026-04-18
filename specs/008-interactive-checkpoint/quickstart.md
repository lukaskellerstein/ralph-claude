# Quickstart: Manual verification walkthrough

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

This document is the Definition of Done checklist for the feature. Each slice ships independently; each table row below is one observable verification gate. End-to-end walks use the `dex-ecommerce` example project and the `electron-chrome` MCP (CDP port 9333) per `.claude/rules/06-testing.md` § 4c.

Before starting, confirm feature 007 is on `main` (`git log --oneline | grep 'Retire SQLite'` returns the merge commit).

---

## DoD gates per slice

### S0 — Preparatory refactors (P1–P8)

Type-level and state-shape foundations. No user-visible UI.

- [ ] `npx tsc --noEmit` passes after each of P1–P8 applied incrementally.
- [ ] Existing resume flow works: pause a run, relaunch the app, verify it resumes from `lastCompletedStage + 1`. `DexState` has no `branchName` on disk.
- [ ] `git status` in the example project after a run shows `.dex/state.json` as untracked (P3). If the repo previously tracked it, the initial post-upgrade launch silently `git rm --cached`'s it.
- [ ] Every `status: "paused"` transition also writes `pauseReason` (inspect `.dex/state.json`).
- [ ] `git log --all --grep='^\[checkpoint:'` returns at least one entry per completed stage, with the `[checkpoint:<stage>:<cycle>]` marker on its second line.
- [ ] A `verify` stage that touches no files produces a commit with a distinct SHA from the preceding `implement` commit (confirms `--allow-empty`).
- [ ] DEBUG badge payload includes `CurrentAttemptBranch` from the start of the session. `LastCheckpointTag` may be `null` pre-S1.
- [ ] `git branch` on `dex-ecommerce` does not list any `fixture/after-clarification` or `fixture/after-tasks` (P8 ran once and deleted them).

### S1 — Core module `src/core/checkpoints.ts`

- [ ] `node --test src/core/__tests__/checkpoints.test.ts` passes.
- [ ] Property test: `(stage × cycle ∈ {0, 1, 7})` produces distinct `labelFor` and `checkpointTagFor` outputs in all pairings.
- [ ] `promoteToCheckpoint` idempotent: calling twice with same args leaves a single tag pointing at the given SHA, returns `{ok: true}` both times.
- [ ] `startAttemptFrom` against a tmpdir: a seeded `.env` (gitignored) survives Go back; a stray untracked file not in `.gitignore` is removed.
- [ ] `spawnVariants` parallel: 3 worktrees exist at `.dex/worktrees/attempt-…-{a,b,c}` with the expected branches.
- [ ] `spawnVariants` simulated partial failure: after-return, no worktrees or branches remain.
- [ ] `isParallelizable`: returns true for each of `gap_analysis`, `specify`, `plan`, `tasks`, `learnings`; false for every other stage.

### S2 — CLI `promote-checkpoint.sh` + `reset-example-to.sh`

- [ ] `dex/scripts/promote-checkpoint.sh <dex-ecommerce> cycle-1-after-plan <sha>` → tag exists at that SHA. Exit code 0.
- [ ] `dex/scripts/promote-checkpoint.sh <dex-ecommerce> bogus-tag-name <sha>` → exit code 1, no tag mutation.
- [ ] `dex/scripts/reset-example-to.sh list` → sorted `checkpoint/*` list printed; exit 0.
- [ ] `dex/scripts/reset-example-to.sh cycle-1-after-plan` → new `attempt-*` branch created; HEAD resolves to the tag's SHA.
- [ ] `dex/scripts/reset-example-to.sh clean` → `main`, no uncommitted files (`GOAL.md` + `.git/` only per 06-testing.md § 4c).
- [ ] `dex/scripts/prune-example-branches.sh --dry-run` reports any `attempt-*` branch older than 30 days; real run removes them.

### S3 — Orchestrator emits `stage_candidate`

- [ ] Run a full loop on `dex-ecommerce` (reset to `clean` first). Tail `~/.dex/logs/<project>/<runId>/run.log` — see `stage_candidate` entries, one per completed stage.
- [ ] After completion, inspect `<projectDir>/.dex/runs/<runId>.json` — every phase record has `checkpointTag` + `candidateSha` populated.
- [ ] DEBUG badge now populates `LastCheckpointTag` with the most recent tag.

### S4 — Step mode

- [ ] Start a run with `stepMode: true` (via the "Pause after each stage" toggle when S8 lands; before that, via an orchestrator start-args flag for S4 testing).
- [ ] Orchestrator runs exactly one stage, then emits `paused { reason: "step_mode" }` and halts.
- [ ] Resume — runs the next stage, pauses again.
- [ ] Toggle off mid-run — next stage runs to completion, no pause.
- [ ] Stop button during a step-mode pause → `pauseReason` transitions to `"user_abort"` (visible in DEBUG badge). Distinct from the prior `"step_mode"` state.

### S5 + S6 — IPC + lock extension

- [ ] Two Dex windows open on the same project. First starts a loop.
- [ ] In the second window, clicking Go back returns `locked_by_other_instance`; UI shows a read-only banner on the timeline.
- [ ] Once the first finishes, second window's Go back succeeds.
- [ ] `mcp__electron-chrome__evaluate_script` calling `await window.dexAPI.checkpoints.isLockedByAnother(...)` returns `false` on the sole-instance case, `true` on the contended case.

### S7 — First-run UX modals

- [ ] Temporarily rename `.git/` → `.git.bak/` in the example project; open the project. `InitRepoPrompt` appears. Accept → `git init` + initial commit; timeline enables.
- [ ] `git config --unset user.email`; reopen project. `IdentityPrompt` appears with `${username}@${hostname}` pre-filled. Accept → writes local config only (`git config --local --get user.email` reflects; `--global` does not).
- [ ] Modify a tracked file in the current attempt; click Go back. `GoBackConfirm` appears listing the dirty files. Cancel → no change. Discard → proceeds. Save → `attempt-…-saved` branch created with the changes committed, then proceeds.

### S8 — D3/SVG timeline

- [ ] Open the project after a completed run. Click the Timeline header — panel expands.
- [ ] Canonical checkpoints render on a top lane; any attempts on distinct lanes beside it; edges are curved.
- [ ] Alternating cycle shades visible at cycle boundaries.
- [ ] Hover a node → tooltip with stage name / cost / duration.
- [ ] Click a node → `NodeDetailPanel` opens with stage summary + action buttons.
- [ ] Pan by dragging; zoom by scrolling. Scale clamped to `[0.25, 4]`.
- [ ] Trigger a fresh `stage_candidate` (start a new run) — graph auto-scrolls to keep the new node visible.
- [ ] Toggle REC — `RecBadge` appears in the topbar; subsequent `stage_candidate` events auto-promote (observable: tag count in `listTimeline` grows in step with stage_candidate events).
- [ ] `timelineLayout.test.ts` snapshot tests pass for fixture snapshots, including a 3-variant fan-out.

### S9 — Candidate prompt + step flow UI

- [ ] Toggle Pause after each stage. Start a run.
- [ ] After the first stage, `CandidatePrompt` opens with Keep / Try again / Try N ways.
- [ ] **Keep this** → tag moves (visible in `listTimeline` as a proper checkpoint, not pending); graph updates; next stage begins.
- [ ] **Try again** → current attempt archived; new attempt-* branch cut; same stage re-runs; new `stage_candidate` fires.
- [ ] Per-stage `StageSummary.tsx` renders the right content for each of the 14 stage types (walk the full loop at least once to cover them).

### S10 — Variants (the big one)

Reset to `checkpoint/cycle-1-after-tasks` before starting (spec-only stage checkpoint — gives a clean fork point for plan variants).

- [ ] Click Try 3 ways on the current checkpoint. Cost estimate modal shows median / p75 from last 5 successful `plan` runs × 3. Confirm.
- [ ] 3 worktrees appear at `.dex/worktrees/attempt-<ts>-{a,b,c}` (inspect via `git worktree list`).
- [ ] Wall-clock time for 3 variants ≤ 1.5 × single-plan duration (stopwatch; meet SC-005).
- [ ] When all 3 complete, `VariantCompareModal` opens with 3 panes. Each shows a plan summary + a `git diff` scoped to `specs/`.
- [ ] Click Keep this on variant B. Tag `checkpoint/cycle-1-after-plan` now points at B's SHA. A and C branches remain; worktrees for A and C are removed; B's worktree is removed.
- [ ] `.dex/variant-groups/<groupId>.json` is deleted.
- [ ] **Sequential variants**: run the same flow from a checkpoint that feeds into `implement`. Confirm no worktrees are created; variants run serially on the main working tree; wall time ≈ N × variant duration (SC-006).
- [ ] **Resume-mid-variant**: during a 3-way plan fan-out, while variant A is still running, close the app. Reopen the project. "Continue variant group" modal appears. Confirm. B and C resume; pending variants start; running-but-dead variant A restarts from `fromCheckpoint`. All variants complete. `VariantCompareModal` opens. Keep any variant. Flow matches the no-interruption case.
- [ ] **One variant crashes**: inject a failure (e.g., corrupt the worktree mid-run). That variant ends up `status: "failed"` in the group file; the comparison modal shows the failure clearly; the user can still Keep a successful variant.

### S11 — Manual compare

- [ ] With two attempts of the same stage present, click Compare. Stage-aware diff opens (same rules as §S10 compare).
- [ ] With two attempts of different stages, Compare falls back to `git diff --stat`.

### S12 — Docs + GitHub Action

- [ ] `.claude/rules/06-testing.md` § 4c now references `reset-example-to.sh` with checkpoint targets; `git log --all --grep='^\[checkpoint:'` documented as power-user workflow.
- [ ] `docs/my-specs/005-testing-improvements/README.md` has a superseded-by banner at the top.
- [ ] Root `README.md` has a "Checkpoints" headline section.
- [ ] `.github/workflows/refresh-checkpoints.yml` passes `actionlint` / GitHub's workflow linter.
- [ ] Manually dispatching the workflow against `dex-ecommerce` completes, pushes `checkpoint/*` tags and a `capture/*` branch.

---

## Full-integration walk: default happy path (SC-001, SC-002)

From a fresh state, confirm the feature does **not** affect the one-button user.

1. `dex/scripts/reset-example-to.sh clean` on `dex-ecommerce`.
2. Launch the app (or ensure `dev-setup.sh` is running).
3. `mcp__electron-chrome__take_snapshot` — welcome screen visible.
4. Fill welcome inputs (`welcome-path` + `welcome-name`) and click the welcome-submit button (label: "Open Existing").
5. On the Autonomous Loop page, toggle **Automatic Clarification** on. Leave Record and Pause-after-stage off.
6. Click **Start Autonomous Loop**. Start a stopwatch.
7. Observe the full run through the trace view and live logs.
8. Verify along the way:
   - [ ] Zero new modals. Zero new prompts. No REC badge. Timeline panel stays collapsed (header visible with `(N checkpoints)` counter).
   - [ ] `~/.dex/logs/<project>/<runId>/run.log` contains `stage_candidate` entries, one per completed stage.
   - [ ] `git tag --list 'checkpoint/*' | wc -l` in the project dir ≥ 11 after cycle 1 completes.
   - [ ] `<projectDir>/.dex/runs/<runId>.json` has `checkpointTag` + `candidateSha` populated on every phase.
   - [ ] `<projectDir>/.dex/variant-groups/` is either absent or empty.
9. After termination (or manual stop), re-check: the default behaviour is indistinguishable from the pre-feature behaviour except for the extra tags.

---

## Full-integration walk: headline feature (SC-005, SC-007)

Measures whether "Try 3 ways on plan" is both fast and discoverable.

1. `dex/scripts/reset-example-to.sh cycle-1-after-tasks`.
2. Open the project.
3. Click the Timeline panel header to expand it.
4. Click the `cycle-1-after-tasks` node. `NodeDetailPanel` opens.
5. Click Try N ways → modal asks for N (2–5). Accept default 3. Cost modal shows median/p75; click Confirm.
6. Start a stopwatch.
7. Observe 3 worktrees spawning (`git worktree list` in a terminal confirms).
8. 3 orchestrator instances run concurrently (CPU and log activity confirm parallel execution).
9. When all 3 complete, `VariantCompareModal` opens automatically. Stop the stopwatch.
10. Verify:
    - [ ] Wall time ≤ 1.5 × typical single-plan duration.
    - [ ] Every pane shows a stage summary + a diff filtered to `specs/`.
    - [ ] Clicking Keep this on any pane moves the canonical tag; other worktrees disappear; group file deleted.
11. **Discoverability** — a user who has never seen the feature should reach the comparison view within five minutes from a cold app open (timed walkthrough).

---

## Abstraction-leak verification (SC-004)

Exercise each of the ten R10 scenarios and assert no raw git error string appears in primary UI. Log file `~/.dex/dev-logs/electron.log` may contain them; that is expected.

| # | Scenario | Trigger | Expected UI |
|---|---|---|---|
| 1 | Dirty tree before Go back | Modify tracked file; Go back | `GoBackConfirm` modal with files listed |
| 2 | Missing identity | Unset `git config user.email`; open project | `IdentityPrompt` |
| 3 | Not a repo | Move `.git/`; open project | `InitRepoPrompt` |
| 4 | Missing checkpoint data | Delete a checkpoint tag via `git tag -d`; refresh timeline | Entry shown as `(unavailable — refresh)` |
| 5 | Detached HEAD | Invariant assertion — no action path in the app reaches detached state | `git rev-parse --abbrev-ref HEAD` always a branch |
| 6 | External git ops | From terminal `git branch -D` the current attempt | Prompt "Start new attempt from last known checkpoint?" after focus/poll |
| 7 | Promotion fails | Simulate (e.g., read-only `.git/` dir) | Friendly toast; `electron.log` has full error |
| 8 | Concurrent instances | Two windows | Second's mutating actions return `locked_by_other_instance`; banner visible |
| 9 | Cloned project | Clone a project with tags elsewhere; open in Dex | Timeline renders the inherited tree |
| 10 | `.env` preserved across Go back | Seed `.env` (gitignored); Go back | `.env` still present after operation |

---

## Test command reference

```bash
# Typecheck gate
npx tsc --noEmit

# Pure-Node unit tests
node --test src/core/__tests__/checkpoints.test.ts
node --test src/renderer/components/checkpoints/__tests__/timelineLayout.test.ts
node --test src/core/__tests__/git.test.ts

# End-to-end (app + dex-ecommerce)
./dex/scripts/reset-example-to.sh clean
# then drive the app via electron-chrome MCP per scenarios above
```

---

## Escalation

If any DoD row fails and the root cause is not a simple code error — e.g., the sequential-variant wall-time fails by much more than expected, or `git worktree` behaves oddly on a given platform — stop and ask the user. The verification matrix in `docs/my-specs/008-interactive-checkpoint/plan.md` has detailed fallback guidance per slice.
