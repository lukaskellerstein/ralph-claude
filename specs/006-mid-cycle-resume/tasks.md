---
description: "Task list for 006-mid-cycle-resume"
---

# Tasks: Mid-Cycle Resume

**Input**: Design documents from `/specs/006-mid-cycle-resume/`
**Prerequisites**: plan.md (loaded), spec.md (loaded), research.md (loaded), data-model.md (loaded), contracts/types-contract.md (loaded), quickstart.md (loaded)

**Tests**: No automated test tasks — the project has no unit-test harness (no vitest/jest/mocha installed; `npm test` is absent from `package.json`). Verification is end-to-end via the six-scenario matrix in `quickstart.md`, driven through the `electron-chrome` MCP server against the `dex-ecommerce` example project. Per plan §Technical Context and constitution Principle III, the static gate is `npx tsc --noEmit`.

**Organization**: Tasks are grouped by user story. Because almost every code edit lands in a single file (`src/core/orchestrator.ts`), parallel opportunities are limited — the `[P]` marker is only used where the task touches a different file from the surrounding work. The user stories are still independently verifiable as independent slices of observable behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All file paths are absolute from the repo root

## Path Conventions

All orchestrator code lives under `src/core/`. The two files edited in this feature:

- `src/core/types.ts` — the `GapAnalysisDecision` union
- `src/core/orchestrator.ts` — the cycle body, decision emitter, stage blocks, post-amble

Verification is run against the example project at `/home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce`, reset between scenarios via `./dex/scripts/reset-example-to.sh`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the verification environment is reachable before touching code. No project initialization is required — this is an existing Electron project with an existing dev-setup.

- [ ] T001 Verify verification environment is live: (a) `./dex/scripts/dev-setup.sh` is running with `~/.dex/dev-logs/vite.log` and `~/.dex/dev-logs/electron.log` written this session; (b) `mcp__electron-chrome__list_pages` succeeds (confirms CDP port 9333 is reachable); (c) `./dex/scripts/reset-example-to.sh` exists and is executable; (d) fixture branches `fixture/after-clarification` and `fixture/after-tasks` exist in the `dex-ecommerce` repo (`cd /home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce && git branch --list 'fixture/*'`). *(deferred — only required for verification tasks T014+)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type-system work that every later task relies on. Adding the new `RESUME_AT_STAGE` variant first means every subsequent orchestrator edit can use it with compile-time exhaustiveness.

**⚠️ CRITICAL**: T002 must land before any task in Phase 3.

- [X] T002 Add the `RESUME_AT_STAGE` variant to the `GapAnalysisDecision` union in `/home/lukas/Projects/Github/lukaskellerstein/dex/src/core/types.ts`. Exact shape per `contracts/types-contract.md § C1`: `| { type: "RESUME_AT_STAGE"; specDir: string; resumeAtStage: LoopStageType }`. Do not remove or modify the existing four variants. Confirm `LoopStageType` is already exported in the same file (it is — used by other variants).

- [X] T003 Run `cd /home/lukas/Projects/Github/lukaskellerstein/dex && npx tsc --noEmit` and observe the expected compile errors in `src/core/orchestrator.ts` — exhaustiveness checks on the union will now flag every `switch`/ternary over `decision.type` that doesn't handle `RESUME_AT_STAGE`. Record the list of compile-error sites as a checklist for Phase 3 (expected hits: ~`orchestrator.ts:2282`, `2283`, `2357`, plus any other `decision.type === "…"` conditions added since the research audit). This is the build's authoritative list of dispatch sites to update. **Result: 0 errors** — the existing dispatch sites use non-exhaustive `decision.type === "X"` conditionals that don't force a type error on new variants. Dispatch sites were located manually via grep per `research.md § R6`.

**Checkpoint**: The type union is extended. Every callsite that must be updated is now surfaced by the typechecker.

---

## Phase 3: User Story 1 — Resume at the stage after the last completed one (Priority: P1) 🎯 MVP

**Goal**: A Stop click between `specify`/`plan`/`tasks` preserves the cycle's identity and spec directory; the next Resume continues at the stage immediately following the last completed one, not from the top of a new cycle.

**Independent Test**: Quickstart scenarios S2 (pause specify→plan), S3 (pause plan→tasks), and S4 (pause tasks→implement — cycle-boundary case, existing RESUME_FEATURE path preserved). All three pass criteria from `quickstart.md` must hold: correct first executed stage, unchanged `currentSpecDir`, unchanged `cyclesCompleted`, no new spec directory, skipped stages shown as ✓ on the stepper.

This phase implements every behavioural change in the feature. All subsequent stories are verification-only.

### Implementation for User Story 1

These tasks all edit `/home/lukas/Projects/Github/lukaskellerstein/dex/src/core/orchestrator.ts` and must be sequenced in the order below — they share the `runLoop` function and introduce dependencies on each other.

- [X] T004 [US1] In `runLoop`, define the `shouldRun(stage: LoopStageType): boolean` helper as the exhaustive `switch` given in `contracts/types-contract.md § C2`. Place it directly after the `decision` variable is assigned so it closes over the final `decision`. Do NOT yet swap any stage-block guards to use it — that happens in T009–T011. Confirm the switch has no `default` branch so TypeScript proves exhaustiveness. **Note: `GAPS_COMPLETE` case removed — TypeScript narrows the type by the time the helper is defined (the early `break` on GAPS_COMPLETE at the top of the cycle body eliminated that variant), so including it triggered `TS2678`. Exhaustiveness still enforced over the 4 remaining variants.**

- [X] T005 [US1] Update the gap-analysis short-circuit at roughly `orchestrator.ts:2198-2207` to select between `RESUME_AT_STAGE` and `RESUME_FEATURE` per `contracts/types-contract.md § C1 emitter`: when `resumeSpecDir` is set, `cycleNumber === cyclesCompleted + 1`, and `resumeLastStage` is `"specify"` or `"plan"` → emit `RESUME_AT_STAGE`; otherwise keep the existing `RESUME_FEATURE` fallthrough (this covers `lastCompletedStage === "tasks"`, later stages, and null). Preserve the synthetic `stage_started(gap_analysis)` / `stage_completed(gap_analysis)` events that the existing code emits — do not remove them.

- [X] T006 [US1] Update the `specDir` resolution site at roughly `orchestrator.ts:2283` so that `decision.type === "RESUME_AT_STAGE"` is also recognised as a decision that carries `decision.specDir`.

- [X] T007 [US1] Update the skipped-stage emission at roughly `orchestrator.ts:2357-2361` per `contracts/types-contract.md § C3`.

- [X] T008 [US1] Immediately after `specify` produces the new spec directory, write `currentSpecDir` and the matching `artifacts.features[specDir]` entry to `state.json` per `contracts/types-contract.md § C5`. Existing null-clobber guard at `orchestrator.ts:1215-1222` remains in place.

- [X] T009 [US1] Specify stage block guard unchanged — kept `if (decision.type === "NEXT_FEATURE")` because the block body accesses `decision.name`, `decision.description`, `decision.featureId`, which require type narrowing. `shouldRun("specify")` would return true only for `NEXT_FEATURE` anyway, so the semantics are equivalent.

- [X] T010 [US1] Split the combined plan+tasks block into separate blocks, each guarded by `shouldRun("plan")` and `shouldRun("tasks")` respectively. Each block recomputes its own `specPath` — small duplication justified by the cleaner guard structure.

- [X] T011 [US1] Verified implement/verify/learnings blocks had no decision-type guards today (they correctly run for all non-GAPS_COMPLETE decisions — GAPS_COMPLETE breaks out of the cycle early). No edits needed. `shouldRun("implement")`/`shouldRun("verify")`/`shouldRun("learnings")` would return `true` for `RESUME_AT_STAGE` since `resumeAtStage ∈ {specify, plan}` has a lower ordinal than all three — matching the required behaviour.

- [X] T012 [US1] Guard the `cyclesCompleted++` in the cycle post-amble at `orchestrator.ts:2757` with `if (!cycleAborted)`. Reused the existing `cycleAborted` computation from the preceding line.

- [X] T013 [US1] `npx tsc --noEmit` → 0 errors. One iteration needed to remove the dead `GAPS_COMPLETE` case from `shouldRun` (see T004 note).

**Also performed, not in original task list**: exported `STAGE_ORDER` from `src/core/state.ts` so `orchestrator.ts` can import it for the `shouldRun` helper's ordinal comparison. Minor scope expansion justified by not duplicating the stage list.

### Verification for User Story 1

All verification runs against `/home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce` via the `electron-chrome` MCP server. Reset the fixture between scenarios. Each verification task is complete only when every pass criterion in the corresponding `quickstart.md` section passes.

- [X] T014 [US1] Execute `quickstart.md § S2` (pause between specify and plan). **PASS**: after resume, `currentStage="plan"` within 300ms (sampled 10× over 3s via `getRunState`); `cyclesCompleted=1` preserved across Stop; `currentSpecDir=specs/001-category-catalog-browsing` persisted by C5 early write; spec.md on disk reused (no new dir). Found and fixed a bug in the C5 implementation during verification: the `abortController?.signal.aborted` check at `orchestrator.ts:2417` ran BEFORE the early `currentSpecDir` write, so a Stop click between specify completion and the state-write landing orphaned the spec dir. Fix: moved the abort check after the write, and changed `.catch(() => {})` to `await ....catch(() => {})` so the write completes before the abort fires.

- [ ] T015 [US1] Execute `quickstart.md § S3` (pause between plan and tasks). Same reset, pause at `stage_completed(plan)`. Assert: first executed stage after `gap_analysis` is `tasks`; other state-preservation criteria as S2.

- [ ] T016 [US1] Execute `quickstart.md § S4` (pause between tasks and implement). Same reset, pause at `stage_completed(tasks)`. Assert: first executed stage after `gap_analysis` is `implement`; the decision emitter selects `RESUME_FEATURE` (not `RESUME_AT_STAGE`) — confirm via `~/.dex/logs/dex-ecommerce/<RunID>/run.log` showing the decision type; stepper shows all three of specify/plan/tasks as ✓ completed.

**Checkpoint**: User Story 1 is fully functional. S2, S3, S4 pass → the feature's core promise (pause at any stage boundary → resume at the next stage) is delivered.

---

## Phase 4: User Story 2 — Run history stays coherent after mid-cycle resume (Priority: P2)

**Goal**: After a mid-cycle resume, the UI's cycle timeline shows every stage exactly once, in the correct order, with skipped stages marked ✓ at their original timestamps.

**Independent Test**: Quickstart scenario S6 — inspect the Loop Dashboard's cycle timeline during or after the S2 resume.

No code changes are required for US2. The behaviour is delivered by T007's `emitSkippedStage` loop being correct; US2's work is the observational verification that the UI renders this coherently.

### Verification for User Story 2

- [ ] T017 [US2] Execute `quickstart.md § S6` during the S2 run (or immediately after, while the cycle is still open). Navigate to the Loop Dashboard, identify the affected cycle, and assert: (a) exactly one row per stage (`gap_analysis → specify → plan → tasks → implement → verify → learnings`), no duplicates, none missing; (b) `specify` timestamp pre-dates the Resume click; (c) `plan` is either ✓ completed (if T014 also ran it to completion) or running, not "queued twice"; (d) no stage shows "re-running". Capture `mcp__electron-chrome__take_screenshot` and `mcp__electron-chrome__take_snapshot` of the timeline for the report.

- [ ] T018 [US2] Cross-check the audit trail: `sqlite3 ~/.dex/db/data.db "SELECT phase_number, status FROM phase_traces WHERE run_id = '<runId from DEBUG badge>' ORDER BY created_at;"`. Assert the phase sequence matches the timeline exactly — the audit-trail rows are the source of truth the UI reads; any disagreement is a timeline-rendering bug, not a data bug.

**Checkpoint**: Mid-cycle resume is observable and trustworthy, not just correct under the hood.

---

## Phase 5: User Story 3 — Normal completion still advances the loop (Priority: P3)

**Goal**: A cycle that completes naturally — no Stop click, no unrecoverable failure — still increments `cyclesCompleted` by exactly 1 and moves to the next feature.

**Independent Test**: Quickstart scenarios S1 (cycle-boundary baseline resume) and S5 (natural completion).

No code changes. The behaviour is delivered by T012's `!cycleAborted` guard — the guard only fires on user abort, so natural completion and unrecoverable failures still advance the counter. US3's work is regression verification.

### Verification for User Story 3

- [ ] T019 [US3] Execute `quickstart.md § S1` (baseline RESUME_FEATURE path). Reset to `fixture/after-tasks`, open, click Resume. Assert: first executed stage is `implement`; stepper shows specify/plan/tasks as ✓ completed via skipped events; no new spec directory. This confirms the pre-existing `RESUME_FEATURE` path was not regressed by T005's emitter change.

- [ ] T020 [US3] Execute `quickstart.md § S5` (natural cycle completion). Reset to `fixture/after-tasks`, start the loop, and let it run through implement → verify → learnings to natural completion (no abort). Assert: `jq .cyclesCompleted dex-ecommerce/.dex/state.json` before vs. after shows an increment of exactly 1; next cycle's decision is `NEXT_FEATURE` (pick different feature) or `GAPS_COMPLETE` (no more features); feature manifest marks the completed feature as `"completed"`.

**Checkpoint**: All three user stories verified. The feature is end-to-end complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close out the feature — update the testing session doc that surfaced the bug, and confirm the static gate still passes.

- [ ] T021 [P] Update `/home/lukas/Projects/Github/lukaskellerstein/dex/docs/testing-session-005.md` (Phase B.2, bug B-3) to mark the mid-cycle-resume follow-up as landed. Reference this feature's spec at `specs/006-mid-cycle-resume/` and the verification results from T014–T020. Do not delete the bug entry — annotate it with the resolution and date per the existing doc's style.

- [ ] T022 [P] Final static gate: `cd /home/lukas/Projects/Github/lukaskellerstein/dex && npx tsc --noEmit`. Expected: zero errors. If errors appear at this point they were introduced by a late edit — resolve before claiming the feature done.

- [ ] T023 Fill out the pass/fail summary at the bottom of `specs/006-mid-cycle-resume/quickstart.md` (S1–S6 and `npx tsc`) and reference screenshots from T014 and T017 in the implementation report.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup — T001)**: no code dependencies, pure environment check. Run first.
- **Phase 2 (Foundational — T002, T003)**: depends on T001. T002 blocks everything in Phase 3; T003 produces the compile-error list that guides Phase 3's dispatch-site updates.
- **Phase 3 (US1 — T004–T016)**: depends on T002, T003. Internal ordering matters (T004 before T009–T011; T005 before T014–T016; T013 static gate before verification runs).
- **Phase 4 (US2 — T017, T018)**: depends on T014 completing (S2 must have produced the state US2 inspects). Can run concurrently with tail of Phase 3 if a second MCP session is available — not recommended (single dev server, single fixture).
- **Phase 5 (US3 — T019, T020)**: depends on Phase 3 complete (the production code must be in place). Can run after US2.
- **Phase 6 (Polish — T021, T022, T023)**: runs last.

### User Story Dependencies

- **US1 (P1)**: the load-bearing story. All code changes live here. No dependencies on US2 or US3.
- **US2 (P2)**: verification-only; depends on US1's code being in place and S2 having been run (reuses the S2 run's artifacts).
- **US3 (P3)**: verification-only; regression check on code written in US1.

### Within User Story 1

- T004 before T009, T010, T011 (the helper must exist before callsites switch to it).
- T005 before T014, T015, T016 (emitter logic must be correct before verifying scenario outcomes).
- T008 before T014 (early `currentSpecDir` write is what closes S2's pause window — without it, S2 fails).
- T012 before T014 (counter guard is what makes `cyclesCompleted` unchanged across a pause).
- T013 (static gate) before T014, T015, T016 (don't run the Electron app against broken types).

### Parallel Opportunities

The feature's tight scoping means parallelism is limited:

- T002 (types.ts) is the only edit outside `orchestrator.ts`; it's still serial because Phase 3 depends on it.
- T021 and T022 can run in parallel — T021 is a doc update in `docs/`, T022 is a typecheck. Both independent of each other.
- Verification runs (T014/T015/T016/T017/T019/T020) share one dev server and one fixture, so they sequence serially.

---

## Parallel Example: Phase 6

```bash
# Launch doc update and static gate together:
Task: "Update docs/testing-session-005.md to close bug B-3"
Task: "Run npx tsc --noEmit in the dex repo root"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 — environment check.
2. T002 — extend the union in `types.ts`.
3. T003 — compile-error inventory from the typechecker.
4. T004–T013 — introduce `shouldRun`, swap dispatch sites, guard the counter, move the `currentSpecDir` write, pass typecheck.
5. T014–T016 — verify S2, S3, S4 against fixtures.
6. **STOP and VALIDATE**: at this point the MVP promise (mid-cycle pause no longer loses work) is delivered. Ship here if resume behaviour is the only ask.

### Full Delivery

7. T017, T018 — US2 UI/audit-trail coherence checks.
8. T019, T020 — US3 regression checks (baseline resume + natural completion).
9. T021, T022, T023 — docs, static gate, report.

### Single-developer path

All code tasks (T004–T012) touch `orchestrator.ts` and must be serialized. Verification tasks run against one dev server. No meaningful multi-developer parallelism — this is a surgical fix, not a team sprint.

---

## Notes

- `[P]` appears on T021 (docs) and T022 (typecheck) only. Almost every other task edits `src/core/orchestrator.ts` or depends on a prior edit to the same file.
- All `[Story]` labels map back to the spec.md priorities: US1 = P1, US2 = P2, US3 = P3.
- `quickstart.md` is the authoritative scenario reference; this file's verification tasks are the checklist, not the protocol.
- If a verification task fails, do not mark it complete — diagnose via the "Diagnosis tips" section of `quickstart.md`, fix the root cause in the implementation tasks of US1, and re-run verification. The project convention (constitution Principle III) is: test before report, no exceptions.
- Commit discipline follows project policy: no commits unless the user explicitly asks. Each task landing does not auto-commit.
