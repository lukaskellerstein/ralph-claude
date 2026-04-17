# Implementation Plan: Structured Outputs for Agent Boundaries

**Branch**: `003-structured-outputs` | **Date**: 2026-04-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-structured-outputs/spec.md`

## Summary

Eliminate free-text parsing at agent boundaries in the Dex autonomous loop by using the Claude Agent SDK's structured outputs (`outputFormat` / `structured_output`). Introduce a deterministic feature manifest for feature selection, add machine-readable verification results with a fix-reverify loop, fix the specify prompt format, and convert learnings/synthesis to structured output. Requires SDK upgrade from `^0.1.0` to `^0.1.45`.

## Technical Context

**Language/Version**: TypeScript 5.6+ (strict mode)
**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` ^0.1.45 (upgrade from ^0.1.0), `better-sqlite3` ^12.9.0, Electron ^41.2.1, React 18
**Storage**: `.dex/state.json` (filesystem state), `.dex/feature-manifest.json` (new — feature manifest), SQLite (run/phase/step audit trail)
**Testing**: `npx tsc --noEmit` (type checking), manual integration testing via autonomous loop runs
**Target Platform**: Electron desktop app (macOS/Linux)
**Project Type**: Desktop app (Electron) with platform-agnostic core engine
**Performance Goals**: Manifest-based feature selection in <10ms (zero LLM cost); verify-fix-reverify loop bounded to 1 retry by default
**Constraints**: Core engine (`src/core/`) must remain Electron-free; all changes backward-compatible with existing `.dex/state.json` format
**Scale/Scope**: 6 files modified, 1 new file created; ~400 lines added, ~80 lines removed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Clean-Context Orchestration | **PASS** | Each stage still runs via its own `query()` call. `outputFormat` is passed per-call, no cross-stage state leakage. Manifest is read from disk, not carried in-memory across agent instances. |
| II. Platform-Agnostic Core | **PASS** | All changes are in `src/core/` (orchestrator, types, prompts, parser, state, new manifest module). No Electron imports. `manifest.ts` uses only `fs` and `crypto` from Node.js stdlib. |
| III. Test Before Report | **PASS** | Verification plan includes type checking, manual multi-cycle integration tests, and specific test scenarios per user story. |
| IV. Simplicity First | **PASS** | Manifest is a flat JSON array — no ORM, no graph, no indirection. Deduplication uses normalized string matching — no embeddings. Fix-reverify loop has a hard cap (default 1). No speculative abstractions. |
| V. Mandatory Workflow | **PASS** | Following Understand → Plan → Implement → Test → Report. |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-structured-outputs/
├── plan.md              # This file
├── research.md          # Phase 0: SDK structured outputs research
├── data-model.md        # Phase 1: Entity models
├── quickstart.md        # Phase 1: Quick start guide
├── contracts/           # Phase 1: Internal interface contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/core/
├── orchestrator.ts      # MODIFY — add outputFormat to runStage, manifest extraction,
│                        #   deterministic gap analysis, structured verify/learnings/synthesis
├── manifest.ts          # NEW — FeatureManifest types, load/save/query/drift-check
├── types.ts             # MODIFY — add featureId to GapAnalysisDecision, new stage types,
│                        #   new event types, new RunConfig fields
├── prompts.ts           # MODIFY — fix buildSpecifyPrompt, add new prompt builders,
│                        #   update verify/learnings prompts for structured output
├── parser.ts            # MODIFY — remove parseGapAnalysisResult and GAP_DECISION_RE
└── state.ts             # MODIFY — add FeatureArtifacts.status updates during normal execution,
                         #   add manifest reconciliation to crash recovery

package.json             # MODIFY — upgrade @anthropic-ai/claude-agent-sdk to ^0.1.45
```

**Structure Decision**: Single-project structure. All changes are in `src/core/` (platform-agnostic engine). No new directories needed — `manifest.ts` lives alongside existing core modules.

## Implementation Phases

### Phase 1: SDK Upgrade and runStage Extension

**Goal**: Upgrade SDK, extend `runStage` to support `outputFormat`, handle structured output errors.

**Changes**:
1. `package.json`: Upgrade `@anthropic-ai/claude-agent-sdk` from `^0.1.0` to `^0.1.45`
2. `src/core/types.ts`:
   - Add `"manifest_extraction"` and `"implement_fix"` to `LoopStageType`
   - Add `featureId: number` to `NEXT_FEATURE` variant of `GapAnalysisDecision`
   - Add `manifest_created`, `manifest_drift_detected`, `verify_failed` to `OrchestratorEvent`
   - Add `maxVerifyRetries?: number` and `maxLearningsPerCategory?: number` to `RunConfig`
3. `src/core/orchestrator.ts` — `runStage`:
   - Add optional `outputFormat` parameter
   - Pass `outputFormat` into `query()` options
   - Capture `message.structured_output` from result
   - Handle `error_max_structured_output_retries` subtype
   - Return `structuredOutput: unknown | null` in result object
   - All existing callers unaffected (they ignore `structuredOutput`)

**Verification**: `npx tsc --noEmit` passes; existing loop behavior unchanged (no callers pass outputFormat yet).

### Phase 2: Feature Manifest Module

**Goal**: Create `manifest.ts` with types and CRUD functions for the feature manifest.

**Changes**:
1. `src/core/manifest.ts` (NEW):
   - Types: `ManifestFeatureStatus`, `FeatureManifestEntry`, `FeatureManifest`
   - `loadManifest(projectDir)` — read `.dex/feature-manifest.json`
   - `saveManifest(projectDir, manifest)` — atomic write (tmp + rename)
   - `getNextFeature(manifest)` — first `pending` entry
   - `getActiveFeature(manifest)` — first `active` entry
   - `updateFeatureStatus(projectDir, featureId, status)`
   - `updateFeatureSpecDir(projectDir, featureId, specDir)`
   - `checkSourceDrift(projectDir, manifest, goalPath)` — SHA-256 comparison
   - `hashFile(filePath)` — SHA-256 helper

**Verification**: `npx tsc --noEmit` passes; unit-level verification by importing and calling functions in a test script.

### Phase 3: Manifest Extraction and Deterministic Gap Analysis

**Goal**: Replace LLM-based gap analysis with manifest extraction + deterministic selection.

**Changes**:
1. `src/core/prompts.ts`:
   - Add `buildManifestExtractionPrompt(goalPath)` — instructs agent to extract features from the plan
   - Add `buildFeatureEvaluationPrompt(config, specDir)` — for RESUME vs REPLAN evaluation
   - Remove `buildGapAnalysisPrompt` (replaced)
   - Add JSON schema constants: `MANIFEST_SCHEMA`, `GAP_ANALYSIS_SCHEMA`
2. `src/core/parser.ts`:
   - Remove `parseGapAnalysisResult()` and `GAP_DECISION_RE`
3. `src/core/orchestrator.ts`:
   - After clarification: manifest extraction via `runStage` with `MANIFEST_SCHEMA` and retry logic
   - Drift detection on loop start
   - Replace gap analysis block (~lines 2086-2102) with deterministic manifest walk
   - For active features with `specDir`: structured RESUME/REPLAN evaluation
   - For active features without `specDir`: re-run specify
   - For pending features: deterministic NEXT_FEATURE (no LLM call)

**Verification**: Run loop on test project. Verify manifest created in `.dex/feature-manifest.json`. Verify deterministic feature selection across 2+ cycles.

### Phase 4: Fix Specify Prompt and Manifest-specDir Linking

**Goal**: Fix the prompt format bug and link manifest entries to spec directories.

**Changes**:
1. `src/core/prompts.ts`:
   - Fix `buildSpecifyPrompt`: remove `config` param, output `/speckit-specify {title}: {description}` on one line
2. `src/core/orchestrator.ts`:
   - Update `buildSpecifyPrompt` call-site (remove `config` arg)
   - After `discoverNewSpecDir`: call `updateFeatureSpecDir(projectDir, featureId, specDir)`
   - Update `updateFeatureStatus` to `"active"` when feature is selected

**Verification**: Run specify stage. Verify spec created under `specs/NNN-<name>/`. Verify manifest entry updated with `specDir`.

### Phase 5: Structured Verify with Fix-Reverify Loop

**Goal**: Add structured verification output and automated fix-reverify loop.

**Changes**:
1. `src/core/prompts.ts`:
   - Update `buildVerifyPrompt` to instruct agent about structured output expectations
   - Add `buildVerifyFixPrompt(config, specDir, failures)` — targeted fix prompt
   - Add `VERIFY_SCHEMA` constant
2. `src/core/orchestrator.ts`:
   - Pass `VERIFY_SCHEMA` to verify `runStage` call
   - Parse `structuredOutput` as `VerifyOutput`
   - Null fallback: treat as not-passed (conservative)
   - On blocking failures: fix-reverify loop bounded by `maxVerifyRetries` (default 1)
   - On re-verify pass: log success and proceed
   - On re-verify fail (max retries): proceed to learnings, defer to next cycle
3. `src/core/state.ts`:
   - Add `FeatureArtifacts.status` updates during normal execution (specifying/planning/implementing/verifying/completed/skipped) — currently only set during crash recovery

**Verification**: Run loop with a feature that has a known defect. Verify structured verify output. Verify fix-reverify triggers. Verify no infinite loops.

### Phase 6: Structured Learnings, Synthesis Confirmation, and Lifecycle Updates

**Goal**: Convert learnings and synthesis to structured output. Ensure manifest + state consistency.

**Changes**:
1. `src/core/prompts.ts`:
   - Update `buildLearningsPrompt` for structured output
   - Add `LEARNINGS_SCHEMA` and `SYNTHESIS_SCHEMA` constants
   - Update synthesis prompt for structured confirmation
2. `src/core/orchestrator.ts`:
   - Structured learnings: parse output, call `appendLearnings()` with dedup and per-category cap
   - Structured synthesis: read `goalClarifiedPath` from output, fall back to filesystem probing
   - Manifest lifecycle updates: set `"completed"` after verify passes, `"skipped"` after 3 replan failures
   - Manifest + state dual-write in same checkpoint
3. `src/core/manifest.ts`:
   - Add `appendLearnings(projectDir, insights)` — normalized dedup, per-category cap
4. `src/core/state.ts`:
   - Add manifest reconciliation to crash recovery
   - Extend `commitCheckpoint` to accept optional manifest write

**Verification**: Run 3+ cycle loop. Verify learnings file has categorized entries without duplicates. Verify synthesis confirmation. Verify manifest status transitions. Simulate crash and verify reconciliation.
