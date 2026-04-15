# Tasks: Autonomous Ralph Loop

**Input**: Design documents from `/specs/001-autonomous-ralph-loop/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No test tasks generated — not explicitly requested in the feature specification. Verification is handled via `npx tsc --noEmit` and MCP chrome-devtools per the testing strategy.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Foundation Types & Refactor)

**Purpose**: Extend type system and refactor orchestrator to support loop mode without breaking existing plan/build modes

- [ ] T001 Add loop mode to RunConfig type union (`mode: "plan" | "build" | "loop"`) and add loop-specific optional fields (`description`, `descriptionFile`, `fullPlanPath`, `maxLoopCycles`, `maxBudgetUsd`) in src/core/types.ts
- [ ] T002 Add LoopStageType, LoopStage, GapAnalysisDecision (4-variant discriminated union), LoopCycle, FailureRecord, TerminationReason, and LoopTermination types in src/core/types.ts
- [ ] T003 Add new OrchestratorEvent variants for loop mode: `clarification_started`, `clarification_question`, `clarification_completed`, `loop_cycle_started`, `loop_cycle_completed`, `stage_started`, `stage_completed`, `loop_terminated` in src/core/types.ts
- [ ] T004 Extract existing spec-loop + phase-loop code from `run()` into a new `runBuild()` function in src/core/orchestrator.ts — pure refactor, `run()` dispatches to `runBuild()` for `"plan"` and `"build"` modes, zero behavior change

**Checkpoint**: Types compile (`npx tsc --noEmit`), existing plan/build modes work unchanged

---

## Phase 2: Foundational (Core Loop Infrastructure)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create src/core/prompts.ts with `buildClarificationPrompt(description: string): string` — comprehensive interactive clarification prompt with completeness checklist, AskUserQuestion instructions, and full_plan.md output format
- [ ] T006 [P] Add `buildGapAnalysisPrompt(config: RunConfig, fullPlanPath: string, existingSpecs: string[]): string` in src/core/prompts.ts — gap analysis prompt with existing spec list, scope constraints, and four-decision output format
- [ ] T007 [P] Add `buildConstitutionPrompt(config: RunConfig, fullPlanPath: string): string` in src/core/prompts.ts — wraps `/speckit.constitution` invocation with full_plan.md context
- [ ] T008 [P] Add `buildSpecifyPrompt(config: RunConfig, featureName: string, featureDescription: string): string` in src/core/prompts.ts — wraps `/speckit-specify` with feature context from full_plan.md
- [ ] T009 [P] Add `buildLoopPlanPrompt(config: RunConfig, specPath: string): string` in src/core/prompts.ts — wraps `/speckit-plan` with acceptance-driven test derivation instructions
- [ ] T010 [P] Add `buildLoopTasksPrompt(config: RunConfig, specPath: string): string` in src/core/prompts.ts — wraps `/speckit-tasks` invocation
- [ ] T011 [P] Add `buildVerifyPrompt(config: RunConfig, specDir: string, fullPlanPath: string): string` in src/core/prompts.ts — build + tests + browser-based e2e verification prompt with testing strategy from full_plan.md
- [ ] T012 [P] Add `buildLearningsPrompt(config: RunConfig, specDir: string): string` in src/core/prompts.ts — update `.claude/rules/learnings.md` with operational insights
- [ ] T013 [P] Add `buildImplementPrompt(config: RunConfig, phase: Phase, fullPlanPath: string): string` in src/core/prompts.ts — Ralph-style guardrails: orient phase (0a-0e), numbered signs (999+), subagent parallelism caps, per-task backpressure, full_plan.md read-only guard
- [ ] T014 Add `parseGapAnalysisResult(output: string): GapAnalysisDecision` in src/core/parser.ts — regex extraction of NEXT_FEATURE/RESUME_FEATURE/REPLAN_FEATURE/GAPS_COMPLETE with name/description/specDir parsing
- [ ] T015 Add `discoverNewSpecDir(projectDir: string, knownSpecs: string[]): string | null` in src/core/parser.ts — find spec directory created after a `/speckit-specify` call by diffing against known list
- [ ] T016 Add `runStage()` function in src/core/orchestrator.ts — lightweight `query()` wrapper for single-shot loop stages: hook setup (step capture, event emission, abort checking), cost tracking, no RunTaskState, returns `{ result: string; cost: number; durationMs: number; inputTokens: number; outputTokens: number }`
- [ ] T017 Add SQLite schema for loop_cycles table (id, run_id, cycle_number, feature_name, spec_dir, decision, status, cost_usd, duration_ms, created_at, completed_at) and failure_tracker table (id, run_id, spec_dir, impl_failures, replan_failures, updated_at) in src/core/database.ts
- [ ] T018 Add loop-mode columns to existing runs table (description, full_plan_path, max_loop_cycles, max_budget_usd, loops_completed) and loop_cycle_id column to phase_traces table in src/core/database.ts
- [ ] T019 Add database CRUD functions for loop_cycles (insertLoopCycle, updateLoopCycle, getLoopCycles) and failure_tracker (getFailureRecord, upsertFailureRecord, resetFailures) in src/core/database.ts
- [ ] T020 Update `createBranch()` in src/core/git.ts to handle `mode === "loop"` with branch naming `ralph/loop/{date}-{shortId}`
- [ ] T021 Update `createPullRequest()` in src/core/git.ts to include loop-specific metrics in PR body (cycles completed, features completed/skipped, total cost, termination reason)

**Checkpoint**: All prompt builders compile, `parseGapAnalysisResult()` handles all four decision variants, `runStage()` compiles, database schema includes loop tables, `npx tsc --noEmit` passes

---

## Phase 3: User Story 1 — Start Autonomous Loop from Description (Priority: P1) MVP

**Goal**: User provides a high-level description, system conducts interactive clarification (Phase A), produces `.specify/full_plan.md`, and transitions to autonomous loop

**Independent Test**: Start loop mode with a sample project description, complete the Q&A session, verify `full_plan.md` is written with all completeness checklist items covered

- [ ] T022 [US1] Implement `runClarification()` in src/core/orchestrator.ts — single `query()` call using `buildClarificationPrompt()`, emits `clarification_started`/`clarification_completed` events, captures full_plan.md path from agent output, handles early termination (user wants to stop before completeness criteria met)
- [ ] T023 [US1] Implement `runLoop()` entry point in src/core/orchestrator.ts — validates RunConfig for loop mode (requires description/descriptionFile/fullPlanPath), calls `runClarification()` if no fullPlanPath provided, then transitions to Phase B
- [ ] T024 [US1] Wire `runLoop()` into `run()` in src/core/orchestrator.ts — add mode dispatch: `"loop"` → `runLoop()`, `"plan"` | `"build"` → `runBuild()`
- [ ] T025 [US1] Update `getRunState()` in src/core/orchestrator.ts to include loop state (currentCycle, currentStage, isClarifying, loopsCompleted) for HMR recovery
- [ ] T026 [US1] Update `startRun` IPC handler in src/main/ipc/orchestrator.ts to accept and validate loop-mode fields from RunConfig
- [ ] T027 [US1] Update preload types in src/main/preload.ts to include loop-mode RunConfig fields in the `startRun()` type signature

**Checkpoint**: Can start loop mode via IPC with a description, clarification runs as a single query, full_plan.md is produced, no regressions in plan/build modes

---

## Phase 4: User Story 2 — Autonomous Feature Cycle (Priority: P1)

**Goal**: After clarification, the system autonomously cycles through gap analysis → specify → plan → tasks → implement → verify → learnings, each as a fresh `query()` call

**Independent Test**: Provide a pre-written `full_plan.md` with 2-3 small features, run the loop (skip Phase A via `fullPlanPath`), verify specs are created, code is implemented, tests pass, and loop terminates with `GAPS_COMPLETE`

- [ ] T028 [US2] Implement constitution check in `runLoop()` in src/core/orchestrator.ts — before first cycle, check if `.specify/memory/constitution.md` exists; if not, run `/speckit.constitution` via `runStage()` with `buildConstitutionPrompt()`
- [ ] T029 [US2] Implement gap analysis stage in `runLoop()` in src/core/orchestrator.ts — call `runStage()` with `buildGapAnalysisPrompt()`, pass existing spec list from `listSpecDirs()`, parse result with `parseGapAnalysisResult()`
- [ ] T030 [US2] Implement specify stage in `runLoop()` in src/core/orchestrator.ts — for `NEXT_FEATURE` decision, call `runStage()` with `buildSpecifyPrompt()`, then discover new spec dir with `discoverNewSpecDir()`
- [ ] T031 [US2] Implement plan + tasks stages in `runLoop()` in src/core/orchestrator.ts — call `runStage()` with `buildLoopPlanPrompt()` then `buildLoopTasksPrompt()` for NEXT_FEATURE and REPLAN_FEATURE decisions
- [ ] T032 [US2] Implement implement stage in `runLoop()` in src/core/orchestrator.ts — read tasks.md from spec dir, parse phases, call existing `runPhase()` for each phase with `buildImplementPrompt()` (reuses existing task tracking infrastructure)
- [ ] T033 [US2] Implement verify stage in `runLoop()` in src/core/orchestrator.ts — call `runStage()` with `buildVerifyPrompt()` after implementation completes
- [ ] T034 [US2] Implement learnings stage in `runLoop()` in src/core/orchestrator.ts — call `runStage()` with `buildLearningsPrompt()` to update `.claude/rules/learnings.md`
- [ ] T035 [US2] Implement cycle orchestration loop in `runLoop()` in src/core/orchestrator.ts — wire all stages into a while loop: emit cycle events, dispatch based on gap analysis decision (NEXT_FEATURE → full cycle, RESUME_FEATURE → skip to implement, REPLAN_FEATURE → skip to plan), track cumulative cost, check termination conditions after each cycle
- [ ] T036 [US2] Persist loop cycle data in src/core/orchestrator.ts — insert/update loop_cycles rows for each cycle, link phase_traces to loop_cycle_id

**Checkpoint**: Can run full autonomous loop with `fullPlanPath` pointing to a pre-written full_plan.md, cycles execute end-to-end, terminates on GAPS_COMPLETE

---

## Phase 5: User Story 3 — Degenerate Case Recovery (Priority: P2)

**Goal**: When a feature fails implementation 3 times, system auto-triggers re-planning; if re-planning also fails 3 times, feature is skipped and logged

**Independent Test**: Provide a `full_plan.md` with a deliberately impossible feature alongside valid ones, run the loop, verify impossible feature is skipped after failure threshold while valid features complete

- [ ] T037 [US3] Implement in-memory failure tracker (`Map<string, FailureRecord>`) in src/core/orchestrator.ts — initialize on loop start, increment `implFailures` on implement/verify failure, increment `replanFailures` on plan/tasks failure, reset on success
- [ ] T038 [US3] Add failure threshold checks to gap analysis dispatch in `runLoop()` in src/core/orchestrator.ts — before executing a cycle: if `implFailures >= 3` for a spec, force `REPLAN_FEATURE`; if `replanFailures >= 3`, skip feature, emit skip event, log to `learnings.md`, continue to next cycle
- [ ] T039 [US3] Persist failure tracker to SQLite in src/core/orchestrator.ts — on each failure/reset, call `upsertFailureRecord()`; on loop start, load existing records from `failure_tracker` table for crash recovery
- [ ] T040 [US3] Add error handling to stage execution in `runLoop()` in src/core/orchestrator.ts — wrap each stage in try/catch, on failure: log error, increment failure counter, emit `stage_completed` with error info, continue to next cycle (don't crash the loop)

**Checkpoint**: Loop survives stage failures, auto-triggers replan after 3 impl failures, skips feature after 3 replan failures, loop continues with remaining features

---

## Phase 6: User Story 4 — Loop Termination Controls (Priority: P2)

**Goal**: Configurable termination: max cycles, max budget USD, user abort — loop stops gracefully after current stage

**Independent Test**: Set low cycle limit (e.g., 2), verify loop terminates after 2 cycles with a summary; set low budget, verify termination on budget exceeded

- [ ] T041 [US4] Implement termination condition checks in `runLoop()` in src/core/orchestrator.ts — after each stage completes: check `maxLoopCycles` vs cycles completed, check `maxBudgetUsd` vs cumulative cost, check abort signal; if any triggered, break loop
- [ ] T042 [US4] Implement graceful loop termination in src/core/orchestrator.ts — on termination: determine reason (gaps_complete, budget_exceeded, max_cycles_reached, user_abort), collect summary (cycles completed, features completed/skipped, total cost/duration), emit `loop_terminated` event with LoopTermination payload
- [ ] T043 [US4] Wire abort signal into loop stages in src/core/orchestrator.ts — check `abortController.signal.aborted` between stages (not mid-stage), emit `loop_terminated` with reason `user_abort` when detected
- [ ] T044 [US4] Generate PR on loop termination in src/core/orchestrator.ts — call `createPullRequest()` with loop-specific metrics (termination reason, cycles, features completed/skipped)

**Checkpoint**: Loop terminates correctly on all four conditions, emits termination event with accurate summary, PR is generated with loop metrics

---

## Phase 7: User Story 5 — Constitution Generation (Priority: P3)

**Goal**: Before the first loop cycle, run `/speckit.constitution` to create `.specify/constitution.md` from `full_plan.md`

**Independent Test**: Run loop with no existing `constitution.md`, verify it's created before first feature cycle; run again with existing `constitution.md`, verify it's skipped

- [ ] T045 [US5] Verify constitution check in `runLoop()` handles both cases in src/core/orchestrator.ts — existence check via `fs.existsSync()`, skip with log when already present, create via `buildConstitutionPrompt()` + `runStage()` when missing (this was implemented in T028 — verify it works correctly and handles edge cases like malformed constitution)

**Checkpoint**: Constitution is created once before first cycle, skipped on subsequent runs, no errors if `.specify/memory/` directory doesn't exist yet

---

## Phase 8: User Story 6 — Loop Mode UI (Priority: P3)

**Goal**: UI provides mode selector, description input, clarification panel, cycle/stage progress, and budget controls

**Independent Test**: Start loop mode in UI, verify all panels render, clarification chat works, stage indicators update during loop

- [ ] T046 [US6] Add mode selector (Build / Loop) to overview panel in src/renderer/App.tsx — toggle between existing spec-card grid (Build mode) and new loop input panel (Loop mode)
- [ ] T047 [US6] Add description input component in src/renderer/components/loop/LoopStartPanel.tsx — textarea for project description, file path input option, budget controls (max cycles number input, max budget USD number input), start button
- [ ] T048 [US6] Add loop event handling to useOrchestrator hook in src/renderer/hooks/useOrchestrator.ts — new state: `currentCycle`, `currentStage`, `isClarifying`, `loopTermination`; handle new event types: `clarification_started/question/completed`, `loop_cycle_started/completed`, `stage_started/completed`, `loop_terminated`
- [ ] T049 [US6] Create ClarificationPanel component in src/renderer/components/loop/ClarificationPanel.tsx — chat-like Q&A interface showing agent questions and user responses during Phase A, auto-scroll, renders during `isClarifying` state
- [ ] T050 [US6] Add loop progress indicators to Topbar in src/renderer/components/layout/Topbar.tsx — show current cycle number, current stage name, feature being worked on, and cumulative cost during Phase B
- [ ] T051 [US6] Create LoopSummary component in src/renderer/components/loop/LoopSummary.tsx — displayed on loop termination, shows termination reason, cycles completed, features completed/skipped, total cost and duration
- [ ] T052 [US6] Add CSS styles for loop mode components in src/renderer/styles/ — dark theme consistent with existing Catppuccin-inspired design, chat bubbles for clarification, progress bar styling for loop stages
- [ ] T053 [US6] Wire loop components into App.tsx view switching in src/renderer/App.tsx — show LoopStartPanel in overview when loop mode selected, show ClarificationPanel during Phase A, reuse existing task-board/trace views during Phase B, show LoopSummary on termination

**Checkpoint**: UI renders loop mode correctly, mode toggle works, clarification panel shows Q&A, loop progress indicators update in real time, summary displays on termination

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T054 [P] Update `getRunState()` return type in src/core/orchestrator.ts and src/main/preload.ts to ensure loop state fields are always present (with defaults) for consistent renderer consumption
- [ ] T055 Verify backward compatibility — confirm existing plan/build mode works unchanged after all loop mode additions by running `npx tsc --noEmit` and verifying app starts without errors
- [ ] T056 [P] Add crash recovery for loop mode in src/core/orchestrator.ts — on app restart, detect orphaned loop runs (status='running'), mark as 'crashed', allow user to resume from last completed stage by loading failure tracker and cycle data from SQLite

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 - Clarification)**: Depends on Phase 2 — entry point for loop mode
- **Phase 4 (US2 - Feature Cycle)**: Depends on Phase 2 — can start after Phase 2 (uses `fullPlanPath` to skip clarification)
- **Phase 5 (US3 - Recovery)**: Depends on Phase 4 — extends the running loop
- **Phase 6 (US4 - Termination)**: Depends on Phase 4 — extends the running loop
- **Phase 7 (US5 - Constitution)**: Depends on Phase 4 — verifies constitution integration
- **Phase 8 (US6 - UI)**: Depends on Phases 3 + 4 — needs loop IPC events to render
- **Phase 9 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Clarification)**: Can start after Foundational — no dependencies on other stories
- **US2 (Feature Cycle)**: Can start after Foundational — independent of US1 (uses `fullPlanPath`)
- **US3 (Recovery)**: Depends on US2 — extends the cycle loop with failure handling
- **US4 (Termination)**: Depends on US2 — extends the cycle loop with termination checks
- **US5 (Constitution)**: Depends on US2 — verifies the constitution step in the loop
- **US6 (UI)**: Depends on US1 + US2 — renders events from both phases

### Within Each User Story

- Models/types before services/logic
- Core implementation before integration
- IPC before renderer

### Parallel Opportunities

- T001, T002, T003 can run in parallel (all modify types.ts but different sections)
- T006-T013 can ALL run in parallel (independent prompt builders in same new file)
- T017-T021 can run in parallel (database, git — separate files)
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Phase 2
- US3 (Phase 5) and US4 (Phase 6) can run in parallel after Phase 4
- T046, T047, T049, T050, T051, T052 can run in parallel (different component files)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all prompt builders together:
Task: "buildClarificationPrompt in src/core/prompts.ts"      # T005
Task: "buildGapAnalysisPrompt in src/core/prompts.ts"        # T006 [P]
Task: "buildConstitutionPrompt in src/core/prompts.ts"       # T007 [P]
Task: "buildSpecifyPrompt in src/core/prompts.ts"            # T008 [P]
Task: "buildLoopPlanPrompt in src/core/prompts.ts"           # T009 [P]
Task: "buildLoopTasksPrompt in src/core/prompts.ts"          # T010 [P]
Task: "buildVerifyPrompt in src/core/prompts.ts"             # T011 [P]
Task: "buildLearningsPrompt in src/core/prompts.ts"          # T012 [P]
Task: "buildImplementPrompt in src/core/prompts.ts"          # T013 [P]

# After prompts, launch parser + database + git in parallel:
Task: "parseGapAnalysisResult in src/core/parser.ts"         # T014
Task: "discoverNewSpecDir in src/core/parser.ts"             # T015
Task: "loop_cycles + failure_tracker tables in database.ts"  # T017 [P]
Task: "ALTER TABLE runs/phase_traces in database.ts"         # T018 [P]
Task: "CRUD functions for loop tables in database.ts"        # T019 [P]
Task: "git.ts loop branch naming"                            # T020 [P]
Task: "git.ts loop PR metrics"                               # T021 [P]
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (types + refactor)
2. Complete Phase 2: Foundational (prompts, parser, database, git)
3. Complete Phase 3: US1 — Clarification + loop entry point
4. Complete Phase 4: US2 — Autonomous feature cycle
5. **STOP and VALIDATE**: Run loop end-to-end with a test project
6. This delivers the core loop — clarification + autonomous cycles

### Incremental Delivery

1. Setup + Foundational → Types compile, infrastructure ready
2. Add US1 → Clarification works, produces full_plan.md
3. Add US2 → Full loop cycles work, terminates on GAPS_COMPLETE (MVP!)
4. Add US3 → Failure recovery protects against runaway costs
5. Add US4 → Budget/cycle limits, abort, PR generation
6. Add US5 → Constitution integration verified
7. Add US6 → UI for loop mode
8. Polish → Crash recovery, backward compatibility verification

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 and US2 are both P1 — US2 can be tested independently using `fullPlanPath` to skip clarification
