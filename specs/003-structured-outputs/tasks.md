# Tasks: Structured Outputs for Agent Boundaries

**Input**: Design documents from `/specs/003-structured-outputs/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (SDK Upgrade)

**Purpose**: Upgrade the Agent SDK and verify structured output types exist. This is the hard prerequisite — blocks everything.

- [x] T001 Upgrade `@anthropic-ai/claude-agent-sdk` from `^0.1.0` to `^0.1.45` in package.json and run `npm install`
- [x] T002 Verify `outputFormat` type and `structured_output` property exist in installed SDK type definitions under node_modules/@anthropic-ai/claude-agent-sdk/

---

## Phase 2: Foundational (runStage Extension + Type Definitions)

**Purpose**: Extend the core stage runner to support structured outputs and define all new types. MUST complete before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Add `"manifest_extraction"` and `"implement_fix"` to `LoopStageType` union in src/core/types.ts
- [x] T004 [P] Add `featureId: number` to `NEXT_FEATURE` variant of `GapAnalysisDecision` in src/core/types.ts
- [x] T005 [P] Add `manifest_created`, `manifest_drift_detected`, and `verify_failed` event types to `OrchestratorEvent` union in src/core/types.ts
- [x] T006 [P] Add `maxVerifyRetries?: number` and `maxLearningsPerCategory?: number` to `RunConfig` in src/core/types.ts
- [x] T007 Add optional `outputFormat` parameter to `runStage` function signature in src/core/orchestrator.ts (lines 873-882), pass it into `query()` options, capture `message.structured_output` from result messages, handle `error_max_structured_output_retries` subtype, and return `structuredOutput: unknown | null` in the result object
- [x] T008 Run `npx tsc --noEmit` to verify all type changes compile cleanly and existing callers are unaffected

**Checkpoint**: runStage now accepts `outputFormat` — all existing behavior unchanged, new callers can pass schemas

---

## Phase 3: User Story 1 — Deterministic Feature Selection (Priority: P1) 🎯 MVP

**Goal**: Replace LLM-based gap analysis with manifest extraction + deterministic selection. Feature ordering is stable and costs zero LLM tokens for NEXT_FEATURE.

**Independent Test**: Run the autonomous loop for 3+ cycles on a multi-feature project. Verify feature selection follows a fixed order and never drifts.

### Implementation for User Story 1

- [x] T009 [P] [US1] Create `ManifestFeatureStatus`, `FeatureManifestEntry`, and `FeatureManifest` types in src/core/manifest.ts per data-model.md
- [x] T010 [P] [US1] Implement `hashFile(filePath)` utility in src/core/manifest.ts — SHA-256 hex digest using Node.js `crypto`
- [x] T011 [US1] Implement `loadManifest(projectDir)` in src/core/manifest.ts — read `.dex/feature-manifest.json`, return null if missing, throw on malformed JSON
- [x] T012 [US1] Implement `saveManifest(projectDir, manifest)` in src/core/manifest.ts — atomic write via tmp file + rename
- [x] T013 [P] [US1] Implement `getNextFeature(manifest)` in src/core/manifest.ts — return first entry with `status === "pending"`
- [x] T014 [P] [US1] Implement `getActiveFeature(manifest)` in src/core/manifest.ts — return first entry with `status === "active"`
- [x] T015 [US1] Implement `updateFeatureStatus(projectDir, featureId, status)` in src/core/manifest.ts — load, update, save; throw if featureId not found
- [x] T016 [US1] Implement `updateFeatureSpecDir(projectDir, featureId, specDir)` in src/core/manifest.ts — load, set specDir, save
- [x] T017 [US1] Implement `checkSourceDrift(projectDir, manifest, goalPath)` in src/core/manifest.ts — compare current SHA-256 of goalPath against manifest.sourceHash
- [x] T018 [P] [US1] Add `MANIFEST_SCHEMA` constant in src/core/prompts.ts per contracts/structured-output-schemas.md
- [x] T019 [P] [US1] Add `GAP_ANALYSIS_SCHEMA` constant in src/core/prompts.ts per contracts/structured-output-schemas.md
- [x] T020 [US1] Add `buildManifestExtractionPrompt(goalPath)` in src/core/prompts.ts — instruct agent to extract features from the priority table with rich descriptions
- [x] T021 [US1] Add `buildFeatureEvaluationPrompt(config, specDir)` in src/core/prompts.ts — for RESUME vs REPLAN evaluation of partially-completed features
- [x] T022 [US1] Remove `buildGapAnalysisPrompt` function from src/core/prompts.ts (replaced by deterministic manifest walk + buildFeatureEvaluationPrompt)
- [x] T023 [US1] Remove `parseGapAnalysisResult()` function and `GAP_DECISION_RE` regex from src/core/parser.ts
- [x] T024 [US1] Add manifest extraction block in src/core/orchestrator.ts — after clarification completes: load manifest, if null run `runStage` with `MANIFEST_SCHEMA` and retry logic (max 2 attempts), save manifest with sourceHash, emit `manifest_created` event
- [x] T025 [US1] Add drift detection in src/core/orchestrator.ts — on loop start when manifest exists: call `checkSourceDrift`, log warning and emit `manifest_drift_detected` if plan changed
- [x] T026 [US1] Replace gap analysis block (~lines 2086-2102) in src/core/orchestrator.ts with deterministic manifest walk: check active feature (RESUME/REPLAN via structured evaluation), then pending feature (NEXT_FEATURE with featureId, zero LLM cost), then GAPS_COMPLETE
- [x] T027 [US1] Run `npx tsc --noEmit` to verify all manifest + gap analysis changes compile

**Checkpoint**: Feature selection is now deterministic from the manifest. Gap analysis for NEXT_FEATURE costs zero LLM tokens.

---

## Phase 4: User Story 3 — Correct Specify Prompt Format (Priority: P2)

**Goal**: Fix the specify prompt format to pass plain-text arguments and link manifest entries to spec directories after specify completes.

**Independent Test**: Run the specify stage and verify the spec is created under `specs/NNN-<name>/` (not `.specify/features/`).

### Implementation for User Story 3

- [x] T028 [US3] Fix `buildSpecifyPrompt` in src/core/prompts.ts — remove `config` parameter, output `/speckit-specify {title}: {description}` as single-line plain text (no structured fields, no `Project directory:`)
- [x] T029 [US3] Update `buildSpecifyPrompt` call-site in src/core/orchestrator.ts — remove `config` argument, pass `decision.name` and `decision.description`
- [x] T030 [US3] After `discoverNewSpecDir` returns in src/core/orchestrator.ts, call `updateFeatureSpecDir(config.projectDir, decision.featureId, newSpecDir)` to link manifest entry to the resolved spec directory
- [x] T031 [US3] Add `updateFeatureStatus(config.projectDir, decision.featureId, "active")` call when a feature is selected for NEXT_FEATURE in src/core/orchestrator.ts
- [x] T032 [US3] Run `npx tsc --noEmit` to verify specify prompt and manifest linking changes compile

**Checkpoint**: Specify prompt format is correct. Manifest entries are linked to spec directories.

---

## Phase 5: User Story 2 — Machine-Readable Verification Results (Priority: P1)

**Goal**: Verification stage returns structured pass/fail results. Blocking failures trigger automated fix-reverify within the same cycle.

**Independent Test**: Run a feature with a known defect. Verify the fix-reverify loop triggers and terminates correctly.

### Implementation for User Story 2

- [x] T033 [P] [US2] Add `VERIFY_SCHEMA` constant in src/core/prompts.ts per contracts/structured-output-schemas.md
- [x] T034 [US2] Update `buildVerifyPrompt` in src/core/prompts.ts — add structured output instructions telling the agent to set `passed=true` only if build, tests, and all acceptance criteria pass; classify failures as blocking vs minor
- [x] T035 [US2] Add `buildVerifyFixPrompt(config, specDir, failures)` in src/core/prompts.ts — targeted fix prompt listing specific blocking failures by criterion and description
- [x] T036 [US2] Replace the verify block in src/core/orchestrator.ts (~lines 2333-2339) — pass `VERIFY_SCHEMA` to `runStage`, parse `structuredOutput` as `VerifyOutput`, implement null fallback (treat as not-passed with synthetic blocking failure)
- [x] T037 [US2] Implement fix-reverify loop in src/core/orchestrator.ts — when blocking failures exist: run `buildVerifyFixPrompt` via `runStage` with `"implement_fix"` stage type, then re-verify with `VERIFY_SCHEMA`; bound by `config.maxVerifyRetries` (default 1); emit `verify_failed` event on each failure
- [x] T038 [US2] Add `FeatureArtifacts.status` updates during normal execution in src/core/state.ts — set status to `"specifying"`, `"planning"`, `"implementing"`, `"verifying"`, `"completed"`, `"skipped"` at each lifecycle transition (currently only set during crash recovery)
- [x] T039 [US2] Run `npx tsc --noEmit` to verify structured verify and fix-reverify changes compile

**Checkpoint**: Verify returns structured results. Blocking failures trigger fix-reverify. Feature status tracked in both manifest and state.

---

## Phase 6: User Story 4 — Structured Learnings Collection (Priority: P3)

**Goal**: Learnings stage returns typed, categorized insights. Deduplication and per-category caps prevent unbounded growth.

**Independent Test**: Run 5+ cycles and verify the learnings file contains categorized, deduplicated entries.

### Implementation for User Story 4

- [x] T040 [P] [US4] Add `LEARNINGS_SCHEMA` constant in src/core/prompts.ts per contracts/structured-output-schemas.md
- [x] T041 [US4] Update `buildLearningsPrompt` in src/core/prompts.ts — instruct agent to return insights with category, insight text, and context instead of directly editing the file
- [x] T042 [US4] Implement `appendLearnings(projectDir, insights, maxPerCategory)` in src/core/manifest.ts — read existing learnings.md, deduplicate using normalized matching (case-insensitive, trimmed, whitespace collapsed), append new entries, enforce per-category cap (default 20, drop oldest)
- [x] T043 [US4] Update learnings block in src/core/orchestrator.ts — pass `LEARNINGS_SCHEMA` to `runStage`, parse `structuredOutput`, call `appendLearnings`; on null output: no-op with log warning
- [x] T044 [US4] Run `npx tsc --noEmit` to verify structured learnings changes compile

**Checkpoint**: Learnings are categorized, deduplicated, and bounded.

---

## Phase 7: User Story 5 — Manifest Source Drift Detection (Priority: P3)

**Goal**: Warn when the project plan changes after manifest creation. No auto-regeneration.

**Independent Test**: Modify GOAL_clarified.md between runs. Verify drift warning is emitted.

### Implementation for User Story 5

- [x] T045 [US5] Verify drift detection logic added in T025 emits `manifest_drift_detected` event and logs warning but does NOT auto-regenerate the manifest in src/core/orchestrator.ts
- [x] T046 [US5] Run `npx tsc --noEmit` to verify drift detection compiles

**Checkpoint**: Drift detection warns but does not auto-regenerate.

---

## Phase 8: User Story 6 — Structured Synthesis Confirmation (Priority: P3)

**Goal**: Synthesis stage confirms file paths via structured output. Orchestrator reads paths directly instead of filesystem probing.

**Independent Test**: Run synthesis and verify goalClarifiedPath is read from structured output.

### Implementation for User Story 6

- [x] T047 [P] [US6] Add `SYNTHESIS_SCHEMA` constant in src/core/prompts.ts per contracts/structured-output-schemas.md
- [x] T048 [US6] Update `buildClarificationSynthesisPrompt` in src/core/prompts.ts — add structured output instructions for returning `filesProduced` and `goalClarifiedPath`
- [x] T049 [US6] Update synthesis block in src/core/orchestrator.ts — pass `SYNTHESIS_SCHEMA` to `runStage`, read `goalClarifiedPath` from structured output; on null output: fall back to existing filesystem probing
- [x] T050 [US6] Run `npx tsc --noEmit` to verify synthesis confirmation changes compile

**Checkpoint**: Synthesis confirms file paths via structured output. Filesystem probing preserved as fallback.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Lifecycle consistency, crash recovery, and final validation

- [x] T051 Add manifest lifecycle updates in src/core/orchestrator.ts — set manifest status `"completed"` after verify passes, `"skipped"` after 3 replan failures
- [x] T052 Extend `commitCheckpoint` in src/core/state.ts to accept optional manifest write alongside state write for atomic dual-write
- [x] T053 Add manifest reconciliation to crash recovery in src/core/state.ts — if manifest says `"active"` but no FeatureArtifacts entry exists, create one with `status: "specifying"`; if manifest says `"completed"` but FeatureArtifacts.status disagrees, update it
- [x] T054 Run `npx tsc --noEmit` for final type-check across all changes
- [ ] T055 Run quickstart.md validation — verify end-to-end checklist items pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (SDK must be installed first)
- **US1 — Deterministic Selection (Phase 3)**: Depends on Phase 2 (needs runStage with outputFormat + new types)
- **US3 — Fix Specify Prompt (Phase 4)**: Depends on Phase 3 (needs manifest module for specDir linking)
- **US2 — Structured Verify (Phase 5)**: Depends on Phase 2 (needs runStage with outputFormat); can parallel with Phase 3-4
- **US4 — Structured Learnings (Phase 6)**: Depends on Phase 2; can parallel with Phase 3-5
- **US5 — Drift Detection (Phase 7)**: Depends on Phase 3 (drift check is part of manifest module)
- **US6 — Synthesis Confirmation (Phase 8)**: Depends on Phase 2; can parallel with Phase 3-7
- **Polish (Phase 9)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. Creates the manifest module used by US3 and US5.
- **US2 (P1)**: Depends only on Foundational. Independent of manifest work — can parallel with US1.
- **US3 (P2)**: Depends on US1 (needs manifest `updateFeatureSpecDir` and `updateFeatureStatus`).
- **US4 (P3)**: Depends only on Foundational. Independent of US1/US2/US3.
- **US5 (P3)**: Depends on US1 (needs `checkSourceDrift` from manifest module). Minimal additional code.
- **US6 (P3)**: Depends only on Foundational. Independent of all other stories.

### Within Each User Story

- Schema constants and prompt builders before orchestrator integration
- Manifest module functions before orchestrator consumers
- Type check after each phase

### Parallel Opportunities

- T003-T006 (type definitions) all modify different sections of types.ts — can parallel
- T009-T010 (manifest types + hashFile) can parallel with T018-T019 (schema constants)
- T013-T014 (getNextFeature + getActiveFeature) can parallel
- T033, T040, T047 (VERIFY_SCHEMA, LEARNINGS_SCHEMA, SYNTHESIS_SCHEMA) can parallel
- US2, US4, US6 can run in parallel after Foundational completes (all depend only on Phase 2)

---

## Parallel Example: User Story 1

```bash
# Launch manifest types and schema constants together:
Task: "T009 [US1] Create ManifestFeatureStatus, FeatureManifestEntry, FeatureManifest types in src/core/manifest.ts"
Task: "T010 [US1] Implement hashFile(filePath) in src/core/manifest.ts"
Task: "T018 [US1] Add MANIFEST_SCHEMA constant in src/core/prompts.ts"
Task: "T019 [US1] Add GAP_ANALYSIS_SCHEMA constant in src/core/prompts.ts"

# Then launch query functions together:
Task: "T013 [US1] Implement getNextFeature(manifest) in src/core/manifest.ts"
Task: "T014 [US1] Implement getActiveFeature(manifest) in src/core/manifest.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US3 — Deterministic Selection + Correct Specify)

1. Complete Phase 1: SDK Upgrade
2. Complete Phase 2: Foundational (runStage extension + types)
3. Complete Phase 3: US1 — Manifest extraction + deterministic gap analysis
4. Complete Phase 4: US3 — Fix specify prompt + specDir linking
5. **STOP and VALIDATE**: Run loop for 3+ cycles, verify deterministic selection and correct spec creation

### Incremental Delivery

1. Setup + Foundational → runStage supports structured outputs
2. Add US1 + US3 → Deterministic feature selection + correct specify (MVP!)
3. Add US2 → Structured verify with fix-reverify (major reliability improvement)
4. Add US4 → Structured learnings with dedup
5. Add US5 + US6 → Drift detection + synthesis confirmation (polish)
6. Polish → Crash recovery, lifecycle consistency

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US5 (drift detection) is mostly covered by T025 in US1 — Phase 7 is a verification pass
- All schema constants come from contracts/structured-output-schemas.md — single source of truth
- parser.ts cleanup (T023) removes ~35 lines; prompts.ts cleanup (T022) removes buildGapAnalysisPrompt
- state.ts changes (T038, T052, T053) fix an existing bug where FeatureArtifacts.status was never updated during normal execution
