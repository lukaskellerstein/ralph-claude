# Feature Specification: Autonomous Ralph Loop

**Feature Branch**: `001-autonomous-ralph-loop`  
**Created**: 2026-04-15  
**Status**: Draft  
**Input**: User description: "Implement the Ralph Wiggum autonomous loop as described in FINAL_PLAN.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start Autonomous Loop from Description (Priority: P1)

A developer opens Ralph-Claude, selects "Loop" mode, and provides a high-level project description (typed or from a file). The system enters Phase A — an interactive clarification session — asking targeted questions about requirements, tech stack, testing strategy, data model, deployment, and dependencies. The developer answers iteratively until the system confirms all completeness criteria are met, then writes `.specify/full_plan.md` and transitions to the autonomous loop without further user input.

**Why this priority**: This is the entry point for the entire feature. Without interactive clarification producing a complete `full_plan.md`, the autonomous loop has no source of truth to work from. The quality of clarification directly determines whether the loop can run for hours without human intervention.

**Independent Test**: Can be tested by starting loop mode with a sample project description, completing the Q&A session, and verifying that `full_plan.md` is written with all completeness checklist items covered.

**Acceptance Scenarios**:

1. **Given** a developer in Loop mode with a project description, **When** the clarification session completes all checklist items, **Then** `.specify/full_plan.md` is written containing requirements, tech stack, testing strategy, data model, deployment target, and user stories with acceptance criteria.
2. **Given** a developer who wants to end clarification early, **When** they signal to stop, **Then** `full_plan.md` is written with incomplete items noted, and the loop proceeds with documented gaps.
3. **Given** a developer providing a file path as description, **When** the loop starts, **Then** the file contents are loaded as the initial description for clarification.

---

### User Story 2 - Autonomous Feature Cycle (Gap Analysis through Verification) (Priority: P1)

After clarification completes, the system enters Phase B. Each loop cycle autonomously: (1) runs gap analysis against `full_plan.md` to decide what to build next, (2) creates a spec via `/speckit.specify`, (3) generates a plan and tasks, (4) implements via `/speckit.implement`, (5) verifies via build/tests/browser-based e2e, and (6) records learnings. The cycle repeats until all features are complete or a termination condition is met.

**Why this priority**: This is the core autonomous execution engine — the defining capability of the Ralph loop. Without it, clarification produces a plan that nothing acts on.

**Independent Test**: Can be tested by providing a pre-written `full_plan.md` with 2-3 small features, running the loop, and verifying that specs are created, code is implemented, tests pass, and the loop terminates with `GAPS_COMPLETE`.

**Acceptance Scenarios**:

1. **Given** a completed `full_plan.md` with multiple features, **When** the loop runs, **Then** gap analysis identifies the first unimplemented feature and outputs `NEXT_FEATURE: {name} | {description}`.
2. **Given** a feature with a spec directory but incomplete tasks, **When** gap analysis runs, **Then** it outputs `RESUME_FEATURE: {specDir}` and skips directly to implementation.
3. **Given** a feature with a spec but invalid/conflicting tasks, **When** gap analysis runs, **Then** it outputs `REPLAN_FEATURE: {specDir}` and re-runs plan + tasks generation.
4. **Given** all features in `full_plan.md` are implemented and verified, **When** gap analysis runs, **Then** it outputs `GAPS_COMPLETE` and the loop terminates.
5. **Given** a completed cycle, **When** the learnings stage runs, **Then** `.claude/rules/learnings.md` is updated with operational insights from the cycle.

---

### User Story 3 - Degenerate Case Recovery (Priority: P2)

When a feature fails implementation 3 times consecutively, the system automatically triggers re-planning (`REPLAN_FEATURE`). If re-planning also fails 3 times, the feature is skipped entirely and the failure is logged to `learnings.md`. The loop continues with the next feature rather than burning budget unproductively.

**Why this priority**: Without failure recovery, a single broken feature can consume the entire budget. This safeguard is essential for unsupervised multi-hour runs, but the core loop (P1) must work first.

**Independent Test**: Can be tested by providing a `full_plan.md` with a deliberately impossible feature alongside valid ones, running the loop, and verifying the impossible feature is skipped after the failure threshold while valid features complete.

**Acceptance Scenarios**:

1. **Given** 3 consecutive implementation failures on the same spec, **When** the next cycle starts, **Then** gap analysis forces `REPLAN_FEATURE` for that spec.
2. **Given** 3 consecutive re-plan failures on the same spec, **When** the next cycle starts, **Then** the feature is skipped, the failure is logged to `learnings.md`, and the loop proceeds to the next feature.
3. **Given** a skipped feature, **When** the loop summary is generated, **Then** the skipped feature and reason are included in the report.

---

### User Story 4 - Loop Termination Controls (Priority: P2)

The developer can configure termination conditions: maximum loop cycles, maximum budget in USD, or manual abort via the UI. When any condition is met, the loop stops gracefully after the current stage completes, and a summary is presented.

**Why this priority**: Budget and cycle caps prevent runaway costs. Abort provides an escape hatch. Required for production use but not for basic loop functionality.

**Independent Test**: Can be tested by setting a low cycle limit (e.g., 2) and verifying the loop terminates after 2 cycles with a summary of what was completed.

**Acceptance Scenarios**:

1. **Given** `maxLoopCycles` is set to N, **When** N cycles complete, **Then** the loop terminates with a summary.
2. **Given** `maxBudgetUsd` is set, **When** cumulative cost exceeds the budget, **Then** the loop terminates after the current stage finishes.
3. **Given** the user clicks abort in the UI, **When** an agent is running, **Then** the current stage completes and the loop stops gracefully.

---

### User Story 5 - Constitution Generation (Priority: P3)

Before the first loop cycle, the system runs `/speckit.constitution` to create `.specify/constitution.md` from `full_plan.md`. This establishes project-wide constraints (coding standards, testing requirements, architectural boundaries) that shape all subsequent spec generation. Constitution is created once and reused for all features.

**Why this priority**: Constitution improves consistency across features but the loop functions without it. Each individual spec can still be self-contained.

**Independent Test**: Can be tested by running the loop with a `full_plan.md` and verifying that `constitution.md` is created before the first feature cycle, and that subsequent `/speckit.specify` calls reference it.

**Acceptance Scenarios**:

1. **Given** no `constitution.md` exists, **When** the loop starts Phase B, **Then** `/speckit.constitution` runs first and creates `.specify/constitution.md`.
2. **Given** `constitution.md` already exists, **When** the loop starts Phase B, **Then** constitution generation is skipped.

---

### User Story 6 - Loop Mode UI (Priority: P3)

The Ralph-Claude UI provides: a mode selector (Build / Loop), a description input for loop mode, a clarification panel (chat-like Q&A), cycle/stage progress indicators during the autonomous loop, and budget controls. The developer can monitor progress in real time.

**Why this priority**: The loop can run headless (core engine only) without UI. UI is important for production use but can be built after the engine is solid.

**Independent Test**: Can be tested by starting loop mode in the UI and verifying all panels render, the clarification chat works, and stage indicators update during the loop.

**Acceptance Scenarios**:

1. **Given** the app is open, **When** the user selects "Loop" mode, **Then** a description input and budget controls appear.
2. **Given** Phase A is active, **When** the system asks clarification questions, **Then** a chat-like panel displays the Q&A exchange.
3. **Given** Phase B is running, **When** the loop progresses through stages, **Then** cycle number, current stage, and feature name are displayed in the top bar.

---

### Edge Cases

- What happens when `full_plan.md` describes zero features? The loop should terminate immediately with `GAPS_COMPLETE`.
- What happens when the user's project has no test runner configured? The verify stage should run only build verification and document that testing was skipped due to missing configuration.
- What happens when gap analysis outputs an unexpected format? The parser should treat it as an error, log to `learnings.md`, and retry the gap analysis stage once before failing the cycle.
- What happens when the Electron app crashes mid-loop? On restart, the system should detect orphaned runs and offer to resume from the last completed stage.
- What happens when `full_plan.md` is accidentally modified during the loop? The system enforces read-only access via prompt guardrail (999-level) — modifications by the agent are prohibited. External modifications by the user are the user's responsibility.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a `"loop"` run mode alongside existing `"plan"` and `"build"` modes.
- **FR-002**: System MUST accept a high-level description (text or file path) as input for loop mode.
- **FR-003**: System MUST conduct an interactive clarification session (Phase A) that covers requirements, technology, infrastructure, credentials, testing strategy, architecture, non-functionals, and dependencies.
- **FR-004**: System MUST verify a completeness checklist before transitioning from Phase A to Phase B, ensuring at least: one user story per major feature, tech stack with versions, build/test/dev commands, deployment target, testing strategy, and data model overview.
- **FR-005**: System MUST write `.specify/full_plan.md` as the single source of truth at the end of Phase A, and MUST NOT modify it during Phase B.
- **FR-006**: System MUST run gap analysis at the start of each loop cycle, comparing `full_plan.md` against existing specs and implementation.
- **FR-007**: Gap analysis MUST output exactly one of: `NEXT_FEATURE`, `RESUME_FEATURE`, `REPLAN_FEATURE`, or `GAPS_COMPLETE`.
- **FR-008**: System MUST execute each stage (gap analysis, specify, plan, tasks, implement, verify, learnings) as a separate `query()` call with fresh context.
- **FR-009**: System MUST track consecutive failures per spec directory and auto-trigger `REPLAN_FEATURE` after 3 implementation failures.
- **FR-010**: System MUST skip a feature after 3 consecutive re-plan failures and log the failure to `.claude/rules/learnings.md`.
- **FR-011**: System MUST terminate the loop when any termination condition is met: `GAPS_COMPLETE`, budget exceeded, max cycles reached, or user abort.
- **FR-012**: System MUST run `/speckit.constitution` once before the first loop cycle if no `constitution.md` exists.
- **FR-013**: System MUST include Ralph-style prompt guardrails (orient phase 0a-0e, numbered signs 999+) in implement and verify stage prompts.
- **FR-014**: System MUST include acceptance-driven test derivation instructions in the plan stage prompt.
- **FR-015**: Verify stage MUST include browser-based e2e verification (via chrome-devtools-mcp or playwright MCP) for web projects, in addition to build and unit tests.
- **FR-016**: Gap analysis prompt MUST include the list of existing spec directories to prevent duplicate spec creation.
- **FR-017**: Gap analysis prompt MUST be scoped to features described in `full_plan.md` only — the agent must not invent new features.
- **FR-018**: Learnings stage MUST update `.claude/rules/learnings.md` which is automatically loaded by the SDK via `settingSources: ["project"]`.
- **FR-019**: System MUST handle `"loop"` mode in git branch naming (`ralph/loop/{date}-{id}`) and PR generation with cost/duration/phase metrics.

### Key Entities

- **Run**: A single execution session with a mode (plan, build, loop), configuration, and lifecycle state. Contains phases or loop cycles.
- **LoopCycle**: One iteration of the Ralph loop — gap analysis through learnings. Tracks cycle number, feature name, decision type, and outcome.
- **Stage**: A single step within a loop cycle (e.g., gap-analysis, specify, plan, tasks, implement, verify, learnings). Each is a separate `query()` call.
- **GapAnalysisResult**: The output of the gap analysis stage — one of four decision variants with associated data (feature name/description or spec directory path).
- **FullPlan**: The `.specify/full_plan.md` document — read-only source of truth produced by Phase A clarification.
- **Constitution**: The `.specify/constitution.md` document — project-wide constraints derived from the full plan.
- **FailureTracker**: Per-spec-directory counter of consecutive implementation and re-plan failures, used for degenerate case safeguards.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from a vague project description to a complete `full_plan.md` through the interactive clarification session, with all completeness checklist items covered, in a single sitting.
- **SC-002**: The autonomous loop can execute at least 3 consecutive feature cycles (gap analysis → implement → verify → learnings) without requiring user intervention.
- **SC-003**: Each loop stage runs in a fresh context window (separate `query()` call), preventing context bloat across stages.
- **SC-004**: The system correctly identifies and resumes incomplete features (`RESUME_FEATURE`) instead of creating duplicate specs.
- **SC-005**: The system terminates within one stage of a termination condition being met (budget, cycle limit, or `GAPS_COMPLETE`).
- **SC-006**: Degenerate case safeguards activate correctly: 3 implementation failures trigger re-plan, 3 re-plan failures trigger skip-and-log.
- **SC-007**: After the loop completes, all implemented features have passing builds and tests as verified by the verify stage.
- **SC-008**: `.claude/rules/learnings.md` accumulates actionable operational insights across loop cycles, improving agent behavior in subsequent cycles.

## Assumptions

- The existing `run()` and `runPhase()` infrastructure in `src/core/orchestrator.ts` can be extended without breaking the `"plan"` and `"build"` modes.
- The Claude Agent SDK `query()` API supports the calling patterns needed (sequential stages, abort mid-query, cost tracking per call).
- Spec-kit commands (`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`) can be invoked programmatically via prompt injection in `query()` calls.
- The developer has a working development environment with the necessary tools (build commands, test runners) as declared during clarification.
- Browser-based e2e verification requires a running dev server and a configured MCP tool (chrome-devtools-mcp or playwright) — projects without these will fall back to build-only verification.
- The SQLite persistence layer already supports the data structures needed for loop cycles, or can be extended to do so.
- `settingSources: ["project"]` in the SDK correctly loads `.claude/rules/learnings.md` into the context of every `query()` call.
