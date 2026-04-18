---

description: "Task list for Interactive Checkpoint — Branch, Version, and Retry Without Git"
---

# Tasks: Interactive Checkpoint — Branch, Version, and Retry Without Git

**Input**: Design documents from `/specs/008-interactive-checkpoint/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Feature ships new cross-cutting subsystems (worktree parallelism, resume-mid-variant, custom D3 renderer) whose correctness cannot be verified by inspection alone. Unit tests (pure Node), property tests (naming), snapshot tests (layout fn), and MCP end-to-end tests (UI flows) are required per Constitution III.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered as an independent increment. Foundational S0 + S1 work is in Phase 2 and blocks all user stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact absolute file paths in every task description

## Path Conventions

Dex project layout per `plan.md`:

- Core (pure Node): `src/core/`
- Electron main + IPC: `src/main/`
- Renderer (React): `src/renderer/`
- Dev scripts: `dex/scripts/`
- Specs: `specs/008-interactive-checkpoint/`

All paths below are repo-relative from `/home/lukas/Projects/Github/lukaskellerstein/dex/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new dependencies and create the module skeleton.

- [ ] T001 Add `d3-zoom`, `d3-selection`, `d3-shape` dependencies (and their `@types/*`) to `package.json` and regenerate `package-lock.json`
- [ ] T002 [P] Append `.dex/state.json`, `.dex/state.lock`, `.dex/variant-groups/`, `.dex/worktrees/` to repo-root `.gitignore` (and the equivalent lines will be written to project `.gitignore` by `initRepo` — see T045)
- [ ] T003 Create empty `src/core/checkpoints.ts` with the public-surface export stubs from `contracts/checkpoints-module.md` (no bodies yet, just typed signatures — unblocks parallel Phase 2 work)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Every change in this phase is a prerequisite for every user story. All S0 preparatory refactors, the full `src/core/checkpoints.ts` module, the state-lock read-only probe, the `OrchestratorEvent` type additions, and the IPC skeleton.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### S0 — Preparatory refactors

- [ ] T004 [P] Remove `branchName` from `DexState` in `src/core/types.ts`; update `detectStaleState` (`src/core/state.ts:287-298`) to use `getCurrentBranch(projectDir)`; update `reconcileState` (`src/core/state.ts:435-654`) to read current branch from git; drop `branchName` writes in `src/core/orchestrator.ts:1213-1232`; strip the field from state.json on first load (P1)
- [ ] T005 [P] Rename `DexState.checkpoint` → `DexState.lastCommit` in `src/core/types.ts`; grep for `.checkpoint.` under `src/core/` and `src/main/` and rename every call site (P2)
- [ ] T006 [P] Drop `git add .dex/state.json` from `commitCheckpoint` in `src/core/git.ts:53`; delete the "agent committed state.json" dead-code branch at `src/core/git.ts:45-51`; in `src/main/index.ts` app.ready handler, silently `git rm --cached .dex/state.json` once per project if the file is tracked (P3)
- [ ] T007 [P] Add `PauseReason` type (`"user_abort" | "step_mode" | "budget" | "failure"`) and `pauseReason?: PauseReason` field to `DexState` in `src/core/types.ts` and `src/core/state.ts`; update every `status: "paused"` write site in `src/core/orchestrator.ts` to include the matching reason (P4)
- [ ] T008 Extend `commitCheckpoint` in `src/core/git.ts` to produce the two-line structured message per `contracts/json-schemas.md` §3; export constant `CHECKPOINT_MESSAGE_PREFIX = "[checkpoint:"` and `CHECKPOINT_MESSAGE_REGEX` (P5)
- [ ] T009 Switch `commitCheckpoint` in `src/core/git.ts:53-58` to `git commit --allow-empty -m <message>`; delete the try/catch swallowing "nothing to commit" errors (P6) — depends on T008 (same function body)
- [ ] T010 [P] Update `src/renderer/hooks/useDebugPayload.ts` to add `CurrentAttemptBranch`, `LastCheckpointTag`, `CandidateSha` fields to the clipboard payload (stubs return `null` until T033) (P7)
- [ ] T011 One-time step: on `dex-ecommerce` at `/home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce`, run `git branch -D fixture/after-clarification fixture/after-tasks` (P8). Document in `.claude/rules/06-testing.md` that fixture branches are deprecated

### S1 — Core module `src/core/checkpoints.ts`

- [ ] T012 [P] Implement naming functions in `src/core/checkpoints.ts`: `checkpointTagFor`, `checkpointDoneTag`, `captureBranchName`, `attemptBranchName`, `labelFor`, and the `slug` helper per `contracts/checkpoints-module.md`
- [ ] T013 [P] Implement stage classification in `src/core/checkpoints.ts`: the `PARALLELIZABLE_STAGES` constant array and `isParallelizable(stage)` function
- [ ] T014 Implement `promoteToCheckpoint(projectDir, tag, candidateSha, rlog)` in `src/core/checkpoints.ts` per contract (rev-parse verify → `git tag -f` → log)
- [ ] T015 Implement `isWorkingTreeDirty(projectDir)` in `src/core/checkpoints.ts` (`git status --porcelain` parse)
- [ ] T016 Implement `startAttemptFrom(projectDir, checkpointTag, rlog, variant?)` in `src/core/checkpoints.ts` — `git checkout -B <attempt-branch> <tag>` then `git clean -fd -e .dex/state.lock` (never `-fdx` — per R5)
- [ ] T017 Implement `spawnVariants(projectDir, request, rlog)` and `cleanupVariantWorktree(projectDir, worktreePath)` in `src/core/checkpoints.ts` — parallel path uses `git worktree add -b`, sequential path uses `git branch`, both with rollback-on-partial-failure
- [ ] T018 Implement `listTimeline(projectDir)` in `src/core/checkpoints.ts` — enumerate `checkpoint/*` tags, `attempt-*` branches, `capture/*` branches; parse `CHECKPOINT_MESSAGE_REGEX` for pending candidates; sentinel-mark unresolvable refs
- [ ] T019 [P] Create `src/core/__tests__/checkpoints.test.ts` with `node --test` — naming round-trip property test over `(stage × cycle ∈ {0, 1, 7})`; `promoteToCheckpoint` happy path + idempotency + bad-SHA; `startAttemptFrom` tmpdir integration including `.env`-preservation and stray-untracked cleanup; `spawnVariants` parallel + sequential + partial-failure rollback; `isParallelizable` table; `listTimeline` against seeded tmpdir

### Core infrastructure extensions

- [ ] T020 Extend `OrchestratorEvent` discriminated union in `src/core/types.ts` with five new variants: `stage_candidate`, `checkpoint_promoted`, `paused` (now carries `reason: PauseReason`, `stage?`), `variant_group_resume_needed`, `variant_group_complete` per `contracts/events.md`
- [ ] T021 [P] Extend `PhaseRecord` in `src/core/runs.ts` (and its JSON schema comment) with optional `checkpointTag?: string` and `candidateSha?: string` fields per `contracts/json-schemas.md` §2; update `completePhase` signature to accept them; maintain back-compat read of older records
- [ ] T022 [P] Extend `acquireStateLock` in `src/core/state.ts` — add `isLockedByAnother(projectDir): boolean` read-only probe that inspects `.dex/state.lock` without acquiring (compares PID + timestamp, tolerates stale)
- [ ] T023 Add `RunConfig.stepMode?: boolean` and `DexUiPrefs { recordMode?: boolean; pauseAfterStage?: boolean }` + `ui?: DexUiPrefs` on `DexState` in `src/core/types.ts` + `src/core/state.ts`

### IPC skeleton

- [ ] T024 Create `src/main/ipc/checkpoints.ts` with the full IPC channel surface per `contracts/ipc-checkpoints.md` as empty handlers returning `{ok: false, error: "not_implemented"}` — each concrete handler lands in its user-story phase
- [ ] T025 [P] Expose `window.dexAPI.checkpoints.*` in `src/main/preload.ts` bridging all 17 channels from `contracts/ipc-checkpoints.md`
- [ ] T026 [P] Add `dexAPI.checkpoints` typings to `src/renderer/electron.d.ts` — type-complete signatures matching the contract
- [ ] T027 Register the checkpoints IPC module in `src/main/index.ts` on `app.ready` (before `createWindow`)

**Checkpoint**: Foundation ready — user story implementation can proceed. From here, every US phase wires concrete behaviour onto the skeleton.

---

## Phase 3: User Story 1 — Safety net: auto-capture + Go back + Try again (Priority: P1) 🎯 MVP

**Goal**: Users can rewind to any past checkpoint and re-run that stage (or later stages) as a new attempt, without losing the canonical run, without modals in the default flow.

**Independent Test**: After a completed run with default settings, every stage has a named checkpoint. Picking any past checkpoint + invoking Go back + Try again restores project files exactly, spawns a new `attempt-*` branch, and the original canonical checkpoints remain untouched.

### Tests for User Story 1

- [ ] T028 [P] [US1] Create `src/main/ipc/__tests__/checkpoints.ipc.test.ts` — lock contention test (`locked_by_other_instance`), `goBack` dirty-tree envelope test, `goBack` force=save branch creation test
- [ ] T029 [P] [US1] Extend `src/core/__tests__/runs.test.ts` (from feature 007) — assert `checkpointTag` + `candidateSha` round-trip through `completePhase` → `getRun`

### Orchestrator wiring (S3)

- [ ] T030 [US1] In `src/core/orchestrator.ts:1213-1232`, after `commitCheckpoint` returns: compute `candidateTag = checkpointTagFor(stage, cycleNumber)`, read `attemptBranch = getCurrentBranch(...)`, call `completePhase(..., { checkpointTag, candidateSha: sha })`, and `emit({ type: "stage_candidate", runId, cycleNumber, stage, checkpointTag, candidateSha, attemptBranch })`

### IPC handlers (US1-scoped)

- [ ] T031 [P] [US1] Implement `checkpoints:listTimeline` in `src/main/ipc/checkpoints.ts` — delegates to `listTimeline(projectDir)`, no lock
- [ ] T032 [P] [US1] Implement `checkpoints:isLockedByAnother` in `src/main/ipc/checkpoints.ts` — calls `isLockedByAnother(projectDir)`
- [ ] T033 [P] [US1] Implement `checkpoints:promote` in `src/main/ipc/checkpoints.ts` — acquire lock, call `promoteToCheckpoint`, release in finally
- [ ] T034 [P] [US1] Implement `checkpoints:goBack` in `src/main/ipc/checkpoints.ts` — dirty-tree check, handle force=save (create `attempt-<ts>-saved` + `git add -A` + commit) / force=discard, delegate to `startAttemptFrom`, return envelope per contract
- [ ] T035 [P] [US1] Implement `checkpoints:deleteAttempt` in `src/main/ipc/checkpoints.ts` — refuse on current branch (`cannot_delete_current`), else `git branch -D`
- [ ] T036 [P] [US1] Implement `checkpoints:checkIsRepo` + `checkpoints:checkIdentity` + `checkpoints:initRepo` + `checkpoints:setIdentity` in `src/main/ipc/checkpoints.ts` — `initRepo` also appends the four lines from `contracts/json-schemas.md` §4 to the project's `.gitignore`

### CLI scripts (S2)

- [ ] T037 [US1] Create `dex/scripts/promote.mjs` — ~15 lines, imports `promoteToCheckpoint` from `dist/core/checkpoints.js`, `process.exit(ok ? 0 : 1)`
- [ ] T038 [US1] Create `dex/scripts/promote-checkpoint.sh` — thin bash wrapper that resolves `HEAD` default and prefixes `checkpoint/` if missing, then exec's `promote.mjs`
- [ ] T039 [US1] Create `dex/scripts/go-back.mjs` — accepts `<projectDir> <checkpointTag>`, imports `startAttemptFrom`, prints new branch name
- [ ] T040 [US1] Rewrite `dex/scripts/reset-example-to.sh` to resolve `list` / `clean` / `checkpoint/<name>` targets per companion plan §S2; remove all legacy fixture-name translations

### Renderer — minimal UI for US1 (list-based navigation; graph arrives in US2)

- [ ] T041 [P] [US1] Create `src/renderer/components/checkpoints/hooks/useTimeline.ts` — calls `window.dexAPI.checkpoints.listTimeline(projectDir)`, invalidates on `stage_candidate` / `checkpoint_promoted` events, polls every 30 s, invalidates on window focus
- [ ] T042 [P] [US1] Create `src/renderer/components/checkpoints/hooks/useDirtyCheck.ts` — thin wrapper around the `dirty_working_tree` error envelope from `checkpoints:goBack`
- [ ] T043 [P] [US1] Create `src/renderer/components/checkpoints/GoBackConfirm.tsx` modal — Save / Discard / Cancel; receives `files[]` from dirty envelope; invokes `goBack(tag, { force: "save" | "discard" })` on confirm
- [ ] T044 [P] [US1] Create `src/renderer/components/checkpoints/IdentityPrompt.tsx` modal — pre-fills OS defaults from `checkIdentity` response; on submit calls `setIdentity`
- [ ] T045 [P] [US1] Create `src/renderer/components/checkpoints/InitRepoPrompt.tsx` modal — offers `git init` or Skip; on accept calls `initRepo`; on skip sets a timeline-disabled banner flag
- [ ] T046 [P] [US1] Create `src/renderer/components/checkpoints/PastAttemptsList.tsx` — collapsible searchable list of `checkpoints[]` + `attempts[]` from the snapshot; each row has a click handler → opens NodeDetailPanel (T047)
- [ ] T047 [P] [US1] Create `src/renderer/components/checkpoints/NodeDetailPanel.tsx` — minimal version: stage label (via `labelFor` rehydrated in the snapshot), Go back button, Try again button. The Try N ways / Keep this buttons render disabled until US3/US4 land
- [ ] T048 [US1] Update `src/renderer/App.tsx` — at project-open, call `checkIsRepo` → show `InitRepoPrompt` if false; call `checkIdentity` → show `IdentityPrompt` if name/email null
- [ ] T049 [US1] Update `src/renderer/components/LoopDashboard.tsx` — mount a collapsed "Timeline (N checkpoints)" header that expands into `PastAttemptsList` + `NodeDetailPanel` (minimal US1 version)
- [ ] T050 [US1] Update `src/renderer/hooks/useOrchestrator.ts` — subscribe to `stage_candidate` and `checkpoint_promoted` events; invalidate `useTimeline`
- [ ] T051 [US1] Update `src/renderer/hooks/useDebugPayload.ts` — populate `LastCheckpointTag` from `listTimeline(...).checkpoints[0]?.tag` or latest pending; populate `CandidateSha` from `state.lastCommit.sha`

### US1 verification

- [ ] T052 [US1] Run the quickstart US1 DoD matrix against `dex-ecommerce`: reset clean → run full cycle → assert ≥ 11 `checkpoint/*` tags exist + every phase record has `checkpointTag`/`candidateSha` + zero unplanned modals. Then pick `cycle-1-after-plan` via `PastAttemptsList`, click Try again, verify a new `attempt-*` branch exists and the canonical tag is unchanged

**Checkpoint**: US1 (MVP) should be fully functional and testable independently. Users can now rewind and retry via either the minimal UI or the CLI.

---

## Phase 4: User Story 2 — Timeline graph visualization (Priority: P2)

**Goal**: Replace US1's list-based navigation with a git-flow-style D3 graph — canonical lane on top, attempt lanes below, variant groups in adjacent lanes (variants rendered empty until US4).

**Independent Test**: Open a project with canonical checkpoints plus at least one alternative attempt. Timeline graph shows distinct lanes for canonical vs attempts with curved edges; clicking a node opens the existing `NodeDetailPanel`; hover shows tooltip with stage/cost/duration.

### Tests for User Story 2

- [ ] T053 [P] [US2] Create `src/renderer/components/checkpoints/__tests__/timelineLayout.test.ts` — snapshot tests over fixture `TimelineSnapshot`s: canonical-only; canonical + one attempt; canonical + multi-variant fan-out; unresolvable-ref sentinel

### Layout

- [ ] T054 [P] [US2] Create `src/renderer/components/checkpoints/timelineLayout.ts` — pure function `layoutTimeline(snapshot, { columnWidth, rowHeight }) → { nodes: LaidOutNode[]; edges: LaidOutEdge[]; width; height }`. Deterministic lane assignment: canonical = column 0, attempts take next free column, variant groups occupy adjacent columns. `y` increases with commit order along each lane

### Graph components

- [ ] T055 [P] [US2] Create `src/renderer/components/checkpoints/NodeCircle.tsx` — SVG circle element with selected/hover/current/unavailable visual states; click + hover handlers as plain React props; renders label above via `<text>`
- [ ] T056 [P] [US2] Create `src/renderer/components/checkpoints/EdgePath.tsx` — renders a `<path>` whose `d` attribute is computed by `d3-shape.linkVertical` given endpoint coordinates; classes by edge kind (`canonical`/`branch-off`/`merge-back`)
- [ ] T057 [US2] Create `src/renderer/components/checkpoints/TimelineGraph.tsx` — React SVG wrapper around `layoutTimeline` output; mounts `d3-zoom` on SVG ref with `scaleExtent([0.25, 4])`, `.on("zoom", setTransform)`; applies `transform.toString()` to inner `<g>`; renders edges (EdgePath) then nodes (NodeCircle)
- [ ] T058 [US2] Add auto-focus: after each snapshot update, if a newer newest-node exists, call `d3Zoom.translateTo` to scroll it into view
- [ ] T059 [US2] Add alternating-cycle shading — computed from `cycleNumber` in each `LaidOutNode` → CSS class `cycle-even` / `cycle-odd`; style background strokes in the global tokens file
- [ ] T060 [US2] Add hover tooltip (pure React state + absolute-positioned `<div>` above SVG) — shows `labelFor`, cost (from phase record), duration (from phase record)

### Container + integration

- [ ] T061 [US2] Create `src/renderer/components/checkpoints/TimelinePanel.tsx` — contains `TimelineGraph` + `NodeDetailPanel` (right side) + `PastAttemptsList` (collapsed below graph). Owns selected-node state; propagates to `NodeDetailPanel`
- [ ] T062 [US2] Replace the US1 minimal mount in `src/renderer/components/LoopDashboard.tsx` — collapsed-by-default header ("Timeline (N checkpoints)") now expands into `TimelinePanel` instead of raw `PastAttemptsList`
- [ ] T063 [US2] Render unresolvable-ref sentinel — `NodeCircle` accepts `unavailable: boolean` and renders non-interactive greyed style with `(unavailable — refresh)` tooltip

### US2 verification

- [ ] T064 [US2] Run the quickstart US2 DoD matrix against `dex-ecommerce` after a reset to a post-variant checkpoint (or set up via `promote-checkpoint.sh`): verify lane colours, curved edges, pan/zoom clamping, click → detail panel, hover tooltip, auto-scroll to newest node on `stage_candidate` event. Confirm zero modals in default flow still holds (spec SC-001 regression)

**Checkpoint**: US1 + US2 both independently functional. Timeline is now the primary navigation surface.

---

## Phase 5: User Story 3 — Step mode: pause after each stage (Priority: P3)

**Goal**: "Pause after each stage" toggle halts the orchestrator after every stage completion with a distinct pause reason. Step-mode pause opens the `CandidatePrompt` with Keep / Try again / Try N ways (Try N ways stays disabled until US4 lands).

**Independent Test**: Toggle on, start run, verify exactly one stage runs then orchestrator emits `paused { reason: "step_mode" }`, CandidatePrompt opens showing stage summary. Keep → advances one more stage + pauses. Try again → re-runs the same stage as a new attempt. Stop button produces `pauseReason: "user_abort"`, visually distinct from step-mode pause.

### Orchestrator (S4)

- [ ] T065 [US3] In `src/core/orchestrator.ts`, after `stage_candidate` emission, check `config.stepMode`; if true: `updateState({ status: "paused", pauseReason: "step_mode" })` + `emit({ type: "paused", runId, reason: "step_mode", stage })` + return cleanly (no abort signal)
- [ ] T066 [US3] Ensure existing user-abort / budget / failure paused-state writes emit `paused` with their matching `reason` (paired with T007's field introduction)

### IPC + renderer wiring

- [ ] T067 [P] [US3] Implement `checkpoints:setPauseAfterStage` in `src/main/ipc/checkpoints.ts` — updates `ui.pauseAfterStage` via `updateState`
- [ ] T068 [P] [US3] Create `src/renderer/components/checkpoints/StageSummary.tsx` — switch renderer per `LoopStageType`, pulling from the phase record + commit message + stage artefacts per spec §Per-stage summaries. Covers all 14 stage types
- [ ] T069 [P] [US3] Create `src/renderer/components/checkpoints/CandidatePrompt.tsx` — modal showing `StageSummary` + three action buttons (Keep this / Try again / Try N ways; the last stays disabled pre-US4). Keep this → `checkpoints:promote`. Try again → `checkpoints:goBack` to the stage's parent checkpoint + orchestrator re-runs
- [ ] T070 [US3] Update `src/renderer/hooks/useOrchestrator.ts` — on `paused` event where `reason === "step_mode"`, open `CandidatePrompt` with the stage context; on other reasons, show the existing paused-state UI but with the new reason label
- [ ] T071 [US3] Update `src/renderer/components/LoopDashboard.tsx` — add "Pause after each stage" toggle + "Step" start button that passes `stepMode: true` into the orchestrator start config

### US3 verification

- [ ] T072 [US3] Run the quickstart US3 DoD matrix against `dex-ecommerce`: toggle Pause-after-stage; start run; after first stage, assert `paused { reason: "step_mode" }` event, `CandidatePrompt` visible, `StageSummary` renders correctly for that stage; click Keep → canonical tag moves, next stage begins. Click Stop during a step-mode pause → state flips to `pauseReason: "user_abort"`, visually distinct badge

**Checkpoint**: US1 + US2 + US3 independently functional. Interactive stage-by-stage UX is live.

---

## Phase 6: User Story 4 — Try N ways: parallel variants (Priority: P4)

**Goal**: Fan out from any checkpoint into N (2–5) variants of the next stage. Parallelisable stages use `git worktree` and complete in ≈ 1 × single-variant wall time. Serial stages (implement/verify) run sequentially on the main working tree. Variant group state persists so crash-during-fan-out recovers cleanly on reopen.

**Independent Test**: From a post-tasks checkpoint, click Try 3 ways on `plan`. Cost estimate modal appears. Confirm → 3 worktrees spawn; wall-time ≤ 1.5 × single variant. VariantCompareModal opens with stage-aware diffs. Click Keep this on any variant → tag moves; other worktrees cleaned up; other branches retained. Separate scenario: quit mid-fan-out, reopen, "Continue variant group" modal fires and completes cleanly.

### Tests for User Story 4

- [ ] T073 [P] [US4] Extend `src/main/ipc/__tests__/checkpoints.ipc.test.ts` — `spawnVariants` happy path (parallel + sequential); `cleanupVariantGroup` keep removes non-picked worktrees; `compareAttempts` stage-aware path filter selection; `estimateVariantCost` empty-project returns nulls
- [ ] T074 [P] [US4] Create `src/main/ipc/__tests__/variantGroup.schema.test.ts` — write → re-read → deep equal; invalid `letter` rejected; `worktree null` + `parallel true` invariant rejected

### Orchestrator driver (S10)

- [ ] T075 [US4] Implement `runVariants(projectDir, fromCheckpoint, stage, variantCount, parentRunId)` in `src/core/orchestrator.ts` — allocates letters `["a","b","c","d","e"].slice(0, N)`; calls `spawnVariants`; writes `.dex/variant-groups/<groupId>.json`; parallel → `Promise.all(runSingleVariant per worktree)`; sequential → iterate branches, `git checkout <branch>` each, `runSingleVariant` in place; emits `variant_group_complete` when all settle
- [ ] T076 [US4] Implement `runSingleVariant(projectDir, cwd, branch, stage, groupId, parentRunId)` in `src/core/orchestrator.ts` — creates new runId + `runs/<runId>.json`, sets `parentRunId` + `variantGroupId` fields in the run record, runs exactly one stage in step-mode-equivalent, updates the corresponding variant's status in the group file (pending → running → completed/failed) via atomic write
- [ ] T077 [US4] On orchestrator startup after `acquireStateLock`, scan `.dex/variant-groups/*.json`; for each file with any pending/running variant, emit `variant_group_resume_needed` and block new-run initiation until resolved. On user confirm-resume: pending → spawn; running → restart from `fromCheckpoint` (recreate worktree if missing)

### IPC handlers (US4-scoped)

- [ ] T078 [P] [US4] Implement `checkpoints:spawnVariants` in `src/main/ipc/checkpoints.ts` — acquire lock, call `spawnVariants(...)`, write group file atomically via `writeVariantGroup` path, release
- [ ] T079 [P] [US4] Implement `checkpoints:writeVariantGroup` in `src/main/ipc/checkpoints.ts` — atomic write (`tmp` + `rename`) to `.dex/variant-groups/<groupId>.json`; creates the directory if absent
- [ ] T080 [P] [US4] Implement `checkpoints:readPendingVariantGroups` in `src/main/ipc/checkpoints.ts` — returns array of group files with any `pending`/`running` variants
- [ ] T081 [P] [US4] Implement `checkpoints:cleanupVariantGroup` in `src/main/ipc/checkpoints.ts` — cleans non-picked worktrees on keep, all worktrees on discard, updates `resolved`, deletes file; branches retained
- [ ] T082 [P] [US4] Implement `checkpoints:compareAttempts` in `src/main/ipc/checkpoints.ts` — stage-aware path filter table per `contracts/ipc-checkpoints.md`; path-matched stages use `git diff <A>..<B> -- <paths>`, others use `git diff --stat <A>..<B>`
- [ ] T083 [P] [US4] Implement `checkpoints:estimateVariantCost` in `src/main/ipc/checkpoints.ts` — reads `listRuns(projectDir, 20)`, flattens `phases`, filters by `stage + status==="completed"`, takes 5 most recent, computes median + p75, multiplies by variantCount

### Renderer

- [ ] T084 [P] [US4] Create `src/renderer/components/checkpoints/VariantCompareModal.tsx` — N panes side-by-side, each pane shows `StageSummary` + diff (from `compareAttempts`) + Keep this button (calls `checkpoints:promote` for that variant's `candidateSha`). Discard all button at the modal level → `cleanupVariantGroup(groupId, "discard")`
- [ ] T085 [US4] Add Try N ways flow in `NodeDetailPanel.tsx` — button enabled now (was disabled pre-US4); opens a small N-picker (2–5, default 3); then opens `CostEstimateModal` populated via `estimateVariantCost`; on confirm → `spawnVariants` + starts orchestrator `runVariants`
- [ ] T086 [US4] Update `src/renderer/hooks/useOrchestrator.ts` — subscribe to `variant_group_resume_needed` (opens "Continue variant group" modal; blocks Start) and `variant_group_complete` (opens `VariantCompareModal` for that groupId)
- [ ] T087 [US4] Extend `timelineLayout.ts` (from T054) + `TimelineGraph.tsx` (from T057) — render variant branches as adjacent lanes within the fan-out point; style with the green variant-lane tokens
- [ ] T088 [P] [US4] Add `reconcileState` authoritative mode in `src/core/state.ts` — rebuild `state.json` from refs + filesystem on project open (per R3); runs also after Go back / Try again / Try N ways, and after external ref change detected by the 30 s poll

### US4 verification

- [ ] T089 [US4] Run the quickstart US4 DoD matrix against `dex-ecommerce`: reset to `checkpoint/cycle-1-after-tasks`; Try 3 ways on `plan`; stopwatch wall time; assert ≤ 1.5 × single-plan run; inspect `git worktree list` → 3 worktrees; on completion verify VariantCompareModal; Keep variant B; assert canonical tag moved, 2 non-picked worktrees cleaned up, branches retained
- [ ] T090 [US4] Run the resume-mid-variant scenario: close app during variant A; reopen → "Continue variant group" modal fires; confirm → B and C complete; VariantCompareModal opens; flow matches non-interrupted case
- [ ] T091 [US4] Run the sequential-variant scenario: Try 3 ways on `implement`; assert no worktrees created; variants run serially; wall time ≈ N × single-implement duration (SC-006)
- [ ] T092 [US4] Run the crashed-variant scenario: inject a failure (e.g., `chmod -w` a worktree dir mid-run); variant A status becomes `failed`; B and C complete; VariantCompareModal flags A's pane as failed and allows Keep on B/C

**Checkpoint**: US1 + US2 + US3 + US4 independently functional. Headline "Try N ways" is live.

---

## Phase 7: User Story 5 — Record mode: canonical snapshots (Priority: P5)

**Goal**: Toggle Record → every stage's attempt auto-promotes to canonical. Visible REC badge in topbar. Mid-run toggle affects only stages completing after the toggle. `DEX_RECORD_MODE=1` env var forces on.

**Independent Test**: Toggle Record, run to completion, confirm REC badge visible throughout and every stage auto-promoted without user interaction. Mid-run toggle: verify only post-toggle stages get auto-promoted. Collaborator scenario: push `checkpoint/*` tags, fresh clone in another directory sees the same checkpoint tree.

### Orchestrator

- [ ] T093 [US5] In `src/core/orchestrator.ts` after `stage_candidate` emission: check `process.env.DEX_RECORD_MODE === "1"` OR `state.ui?.recordMode`; if true, call `promoteToCheckpoint(projectDir, candidateTag, sha, rlog)` and `emit({ type: "checkpoint_promoted", runId, checkpointTag, sha })`
- [ ] T094 [US5] In `src/core/orchestrator.ts` on `loopTermination` path: if record mode on, write `capture` branch (`git branch -f ${captureBranchName(runId)} HEAD`) and promote `checkpointDoneTag(runId)` to HEAD SHA; emit matching `checkpoint_promoted`

### IPC + renderer

- [ ] T095 [P] [US5] Implement `checkpoints:setRecordMode` in `src/main/ipc/checkpoints.ts` — updates `ui.recordMode` via `updateState`
- [ ] T096 [P] [US5] Create `src/renderer/components/checkpoints/hooks/useRecordMode.ts` — reads `state.ui?.recordMode`, provides `setRecordMode(on)` that calls the IPC + reflects locally
- [ ] T097 [P] [US5] Create `src/renderer/components/checkpoints/RecBadge.tsx` — small red-dot badge with "REC" label, animated pulse; renders only when `ui.recordMode === true` OR `DEX_RECORD_MODE=1`
- [ ] T098 [US5] Mount `RecBadge` in `src/renderer/components/Topbar.tsx` — positioned in the right cluster of the topbar
- [ ] T099 [US5] Add Record toggle to `src/renderer/components/LoopDashboard.tsx` — wired to `useRecordMode`

### Infrastructure

- [ ] T100 [US5] Create `.github/workflows/refresh-checkpoints.yml` — weekly cron (`0 6 * * 1`) + `workflow_dispatch`; checks out `lukaskellerstein/dex-ecommerce`; runs the Dex loop with `DEX_RECORD_MODE=1`; pushes `refs/tags/checkpoint/*` and `refs/heads/capture/*` with force

### US5 verification

- [ ] T101 [US5] Run the quickstart US5 DoD matrix against `dex-ecommerce`: toggle Record; start a run; confirm REC badge throughout; after completion assert every phase has a corresponding promoted tag + one `checkpoint/done-<slice>` tag + one `capture/<date>-<slice>` branch. Mid-run toggle test: toggle off after stage 3; assert stages 4+ are not auto-promoted; toggle back on; assert subsequent stages resume auto-promotion. Clone test: push tags, clone in a temp dir, open in Dex, assert same tree

**Checkpoint**: US1–US5 independently functional. Record mode operational for team/CI use.

---

## Phase 8: User Story 6 — Compare any two attempts (Priority: P6)

**Goal**: Select two nodes in the timeline and open a stage-aware diff. Reuses the `checkpoints:compareAttempts` IPC already built for US4.

**Independent Test**: Produce two attempts of the same stage. Select both in the timeline graph; click Compare → diff view opens filtered to artefacts relevant to that stage. Select two attempts of different stages → diff falls back to `git diff --stat`.

### Renderer

- [ ] T102 [P] [US6] Create `src/renderer/components/checkpoints/AttemptCompareModal.tsx` — two-pane modal; each pane shows `StageSummary`; shared bottom diff pane populated from `checkpoints:compareAttempts(projectDir, branchA, branchB, stage)`. Stage resolved from branch A's latest commit's tag
- [ ] T103 [US6] Add multi-select to `TimelineGraph.tsx` — hold Shift and click to select up to two nodes; when exactly two are selected, show a floating "Compare" action button; click → opens `AttemptCompareModal`

### US6 verification

- [ ] T104 [US6] Run the quickstart US6 DoD matrix: set up two attempts of `plan`; shift-click both in the timeline; click Compare; assert diff filtered to `specs/`. Then shift-click one `plan` attempt + one `implement` attempt; assert diff falls back to `git diff --stat`

**Checkpoint**: All user stories now independently functional. Feature is content-complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Retention, docs, performance verification, full-integration walks.

### Retention + infrastructure

- [ ] T105 [P] Extend `dex/scripts/prune-example-branches.sh` — sweep `attempt-*` branches older than 30 days. Protect `main`, `checkpoint/*` (tags immune), `capture/*`, `lukas/*`. Add `--dry-run` flag

### Documentation

- [ ] T106 [P] Rewrite `.claude/rules/06-testing.md` § 4c — new checkpoint-based reset workflow, `git log --all --grep='^\[checkpoint:'` documented as power-user workflow, fixture-branch reservation removed
- [ ] T107 [P] Add superseded-by banner to the top of `docs/my-specs/005-testing-improvements/README.md`
- [ ] T108 [P] Update `CLAUDE.md` — add `d3-zoom/d3-selection/d3-shape` to the Active Technologies list; amend the On-Disk Layout block to include `.dex/variant-groups/` and `.dex/worktrees/` under Per-project (gitignored)
- [ ] T109 [P] Add "Checkpoints" headline section to root `README.md` — four-verb summary, graph screenshot, one-paragraph elevator pitch, link to spec

### Cross-cutting verification

- [ ] T110 Full integration walk — "default happy path" per `quickstart.md` §Full-integration walk. Zero new modals; zero new prompts; ≥ 11 tags after cycle 1; verify SC-001 + SC-002
- [ ] T111 Full integration walk — "headline feature" per `quickstart.md` §Full-integration walk. Wall-time ≤ 1.5 × single-plan; compare view discoverable within five minutes cold — verifies SC-005 + SC-007
- [ ] T112 Abstraction-leak matrix — walk all 10 scenarios per `quickstart.md` §Abstraction-leak verification. Assert no raw git error string appears in primary UI — verifies SC-004
- [ ] T113 [P] Performance — seed a project with a 200-node timeline (canonical + attempts + variants) via `promote-checkpoint.sh` in a loop; verify pan/zoom/click all respond within 100 ms perceived latency — verifies SC-012
- [ ] T114 Power-user path — verify SC-010 by running `git log --all --grep='^\[checkpoint:'` and `git tag --list 'checkpoint/*'` outside the app, confirming complete checkpoint listing
- [ ] T115 Collaboration — verify SC-009: push tags from the originator, clone fresh elsewhere, open in Dex, assert same tree
- [ ] T116 Final DoD review — tick every checkbox in `quickstart.md` §DoD gates. Any failure stops and escalates per 06-testing.md § 4e

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies — can start immediately.
- **Phase 2 (Foundational)**: depends on Phase 1 completion. **BLOCKS** all user-story phases. Within Phase 2, S0 refactors (T004–T011) can run in parallel with the checkpoints.ts module (T012–T019) because they touch disjoint files — but the IPC skeleton (T024–T027) depends on `checkpoints.ts` existing (T003 stub suffices) and on the event additions (T020) + PhaseRecord additions (T021).
- **Phase 3 (US1)**: depends on Phase 2. MVP; delivers standalone value.
- **Phase 4 (US2)**: depends on Phase 3 (reuses `NodeDetailPanel`, `useTimeline`, `GoBackConfirm`). Graph supersedes the US1 list UI.
- **Phase 5 (US3)**: depends on Phase 3 (reuses `checkpoints:promote`, `checkpoints:goBack`, `NodeDetailPanel`). Independent of Phase 4 — step mode can ship with list-only UI if desired.
- **Phase 6 (US4)**: depends on Phase 4 (variant lanes render inside the graph). Internally heavy — worktree parallelism + resume-mid-variant are the bulk of the work.
- **Phase 7 (US5)**: depends on Phase 3 (promote IPC) + Phase 2 (orchestrator events). Independent of Phase 4 + 6 — Record mode can ship before variants if scheduling demands.
- **Phase 8 (US6)**: depends on Phase 4 (reuses `compareAttempts` IPC and `VariantCompareModal`-style pane layout). Thin slice.
- **Phase 9 (Polish)**: depends on whichever user stories are in scope for the cutover milestone.

### User Story dependencies

- **US1**: needs only Phase 1 + 2. No dependency on any other story.
- **US2**: depends on US1's `useTimeline` / `NodeDetailPanel` / `GoBackConfirm`.
- **US3**: depends on US1's `checkpoints:promote` / `checkpoints:goBack`. Does not depend on US2.
- **US4**: depends on US2's graph (for variant lanes) and US1's IPC surface. Heaviest story.
- **US5**: depends on US1's `checkpoints:promote`. Does not depend on US2–US4.
- **US6**: depends on US2's multi-select and US4's `compareAttempts` handler.

### Within each story

- Tests (where included) are written concurrently with or before implementation; they MUST fail before their target task is implemented.
- IPC handlers depend on their core-module counterparts landing first.
- Renderer hooks depend on their IPC handlers.
- Renderer components depend on their hooks.
- Each story ends with a verification task against `quickstart.md` — no story is considered done until its matrix passes.

### Parallel opportunities

- Phase 1: T002 is [P] with T001. T003 depends on T001.
- Phase 2 S0: T004 / T005 / T006 / T007 / T010 all [P] — disjoint file sets. T008 and T009 both touch `git.ts`'s `commitCheckpoint` so they are sequential.
- Phase 2 S1: T012 / T013 [P]; T014–T018 sequential within the single `checkpoints.ts` file (one large function per PR is idiomatic); T019 [P] with all of the above.
- Phase 2 infrastructure: T021 [P] with T022; T025 [P] with T026; T020, T023, T024, T027 sequential (shared files).
- US1 IPC handlers T031–T036 all [P] — different handler bodies, single IPC file but discrete functions. Renderer components T041–T047 all [P] — each is its own file.
- US2 components T053–T056 all [P]. T057 → T058 → T059 → T060 → T061 → T062 → T063 sequential (shared TimelineGraph/TimelinePanel state).
- US3 T067 / T068 / T069 all [P]. T065 / T066 sequential (same orchestrator function).
- US4 IPC handlers T078–T083 all [P]. T075 / T076 / T077 sequential (shared orchestrator). T084 [P] with the IPC group.
- US5 T095 / T096 / T097 all [P]. T093 / T094 sequential (same orchestrator location).
- Phase 9 docs T105–T109 all [P].

---

## Parallel Example — User Story 1 IPC sprint

```bash
# Launch the six US1 IPC handlers in parallel (one engineer per task if staffed,
# or a single engineer in parallel Edit tool calls):
Task: "Implement checkpoints:listTimeline in src/main/ipc/checkpoints.ts"
Task: "Implement checkpoints:isLockedByAnother in src/main/ipc/checkpoints.ts"
Task: "Implement checkpoints:promote in src/main/ipc/checkpoints.ts"
Task: "Implement checkpoints:goBack in src/main/ipc/checkpoints.ts"
Task: "Implement checkpoints:deleteAttempt in src/main/ipc/checkpoints.ts"
Task: "Implement checkpoints:checkIsRepo / checkIdentity / initRepo / setIdentity"
```

## Parallel Example — User Story 1 renderer sprint

```bash
# Each modal / hook is its own file — pure parallel fanout:
Task: "Create src/renderer/components/checkpoints/hooks/useTimeline.ts"
Task: "Create src/renderer/components/checkpoints/hooks/useDirtyCheck.ts"
Task: "Create src/renderer/components/checkpoints/GoBackConfirm.tsx"
Task: "Create src/renderer/components/checkpoints/IdentityPrompt.tsx"
Task: "Create src/renderer/components/checkpoints/InitRepoPrompt.tsx"
Task: "Create src/renderer/components/checkpoints/PastAttemptsList.tsx"
Task: "Create src/renderer/components/checkpoints/NodeDetailPanel.tsx"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete **Phase 1: Setup** (T001–T003).
2. Complete **Phase 2: Foundational** (T004–T027) — S0 refactors + full `checkpoints.ts` module + IPC skeleton. No user-visible change yet; everything compiles.
3. Complete **Phase 3: US1** (T028–T052) — auto-capture + Go back + Try again + CLI + minimal UI + first-run modals.
4. **STOP and VALIDATE** — quickstart §US1 DoD matrix. Power users have CLI; all users have list-based UI.
5. Decide whether to continue into US2 immediately or ship MVP.

### Incremental delivery

1. **Increment 1** — Phase 1 + 2 + 3. Deploy/demo. MVP.
2. **Increment 2** — Phase 4 (US2 graph). Deploy/demo. The feature now looks like a product.
3. **Increment 3** — Phase 5 (US3 step mode). Deploy/demo. Interactive one-stage-at-a-time.
4. **Increment 4** — Phase 6 (US4 variants). Deploy/demo. The headline capability.
5. **Increment 5** — Phase 7 (US5 record mode) + Phase 8 (US6 compare). Deploy/demo. Full surface.
6. **Increment 6** — Phase 9 polish + docs + SC verifications.

### Parallel team strategy

With three engineers post-Phase 2:

1. Team completes Phase 1 + 2 together.
2. Post-Foundational:
   - **Engineer A** owns Phase 3 (US1) → Phase 4 (US2) → Phase 8 (US6).
   - **Engineer B** owns Phase 5 (US3) — can start immediately after Phase 3's `checkpoints:promote` + `checkpoints:goBack` handlers land.
   - **Engineer C** owns Phase 6 (US4) — waits for Phase 4 (graph lanes), then the heaviest single-phase slice.
   - Engineer B or C picks up Phase 7 (US5) once they finish.
3. Engineer A runs Phase 9 polish after A/B/C stories converge.

### Safety rails

- **Never** commit via `git` without explicit user approval (project CLAUDE.md).
- **Never** run `git clean -fdx` — it wipes user-excluded files (R5). `startAttemptFrom` already enforces `-fd -e .dex/state.lock`.
- **Never** skip Constitution III — every code change is typechecked + tested before reporting done.
- **Lock first, then mutate** — every checkpoint-mutating IPC handler acquires `state.lock` with `finally`-release.

---

## Notes

- **Task count**: 116 tasks across 9 phases. Phase 2 is the largest single phase at 24 tasks — it pays the foundational cost for all six stories.
- **Granularity** — each task is a single change, usually on a single file (or cluster of tightly-coupled files). Tasks touching the same function are deliberately ordered sequentially to avoid edit conflicts.
- **Commits** — by project policy, do not commit after each task. Commit at the user's request only. Tasks should still be logically bounded for PR review.
- **Branching** — everything lands on `008-interactive-checkpoint`. Sub-PRs per slice are acceptable per the implementation-strategy table.
- **Escalation** — any DoD gate failure that cannot be root-caused in a reasonable search window stops and asks the user (per `.claude/rules/06-testing.md` § 4e).
- **[P]** tasks = different files, no dependency on any incomplete task.
- **[Story]** label maps task to spec user story for traceability. Phases 1, 2, 9 carry no story label.
