# Implementation Plan: Mid-Cycle Resume

**Branch**: `006-mid-cycle-resume` | **Date**: 2026-04-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-mid-cycle-resume/spec.md`

## Summary

Close the "pause at a cycle boundary vs. pause mid-cycle" behavioural gap in the orchestrator. Today a Stop click between `specify` and `plan` loses the cycle's spec directory and the LLM spend on specify; the next Resume starts a fresh cycle from `gap_analysis`. The plan introduces a new `RESUME_AT_STAGE` decision variant, a `shouldRun(stage)` helper that replaces the scattered decision-type guards in the cycle body, and a one-line guard on the `cyclesCompleted++` post-amble. Net code delta is ~50 TypeScript lines across `src/core/types.ts` and `src/core/orchestrator.ts`; no new dependencies, no schema changes, no UI work. The source brief at `docs/my-specs/006-mid-cycle-resume/README.md` contains the fully worked technical design — this plan records the decisions, resolves the open questions it flagged, and pins the exact dispatch sites that must be updated.

## Technical Context

**Language/Version**: TypeScript 5.6+ (strict mode).
**Primary Dependencies**: Unchanged — `@anthropic-ai/claude-agent-sdk` ^0.1.45, `better-sqlite3` ^12.9.0, `electron` ^41.2.1, `react` ^18.3.1. No additions.
**Storage**: Unchanged — `<projectDir>/.dex/state.json` (filesystem state, in particular `cyclesCompleted`, `currentSpecDir`, `lastCompletedStage`, `artifacts.features`), `~/.dex/db/data.db` (SQLite audit trail — `runs`, `phase_traces`, `loop_cycles` tables are read to pin cycle identity on resume).
**Testing**: `npx tsc --noEmit` for type gate. No unit-test harness exists in the project (no vitest/jest/mocha installed); verification is end-to-end through the Electron app against the `dex-ecommerce` example project, driven by the `electron-chrome` MCP server on CDP port 9333. The fixture branches `fixture/after-clarification` and `fixture/after-tasks` are the anchors for the six-scenario verification matrix defined in `quickstart.md`.
**Target Platform**: Electron ^41.2 desktop app on Linux (primary), macOS, Windows. Core engine (`src/core/*`) is platform-agnostic pure Node.js.
**Project Type**: Desktop application with three layers — main process (`src/main/`), renderer (`src/renderer/`), platform-agnostic orchestration engine (`src/core/`). All changes live in `src/core/`.
**Performance Goals**: No measurable change. The feature is a control-flow fix — the branch that used to waste a stage's LLM spend now preserves it. Stage execution itself is unchanged.
**Constraints**: No schema changes. No new dependencies. No UI changes (the UI already renders the cycle timeline from the audit trail; once skipped-stage events fire correctly through `emitSkippedStage`, the existing timeline renders coherently). No migration of existing `state.json` files — pre-existing counter drift is absorbed by the existing `reconcileState` fallback, see `research.md § Q4`.
**Scale/Scope**: ~50 lines of TypeScript across 2 files (`src/core/types.ts`, `src/core/orchestrator.ts`). 7 decision-dispatch sites in `orchestrator.ts` audited; 4 require updates to accept `RESUME_AT_STAGE`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Re-evaluated against `.specify/memory/constitution.md` v1.0.0. All gates pass with no justified violations.

| Principle | Status | Notes |
|---|---|---|
| I. Clean-Context Orchestration | ✅ Pass | Each stage still runs in its own `query()` call. The change is to the decision that chooses *which* stages run, not to how they run. Hook callbacks unchanged. |
| II. Platform-Agnostic Core | ✅ Pass | All edits confined to `src/core/types.ts` and `src/core/orchestrator.ts`. Zero `electron`, `src/main/`, or `src/renderer/` imports introduced. |
| III. Test Before Report | ✅ Pass | Verification: `npx tsc --noEmit` + end-to-end UI run of the six-scenario matrix (baseline, three mid-cycle pause points, normal completion, UI stepper coherence) against `dex-ecommerce` fixtures via `electron-chrome` MCP. Reset the example project between scenarios using `./dex/scripts/reset-example-to.sh`. |
| IV. Simplicity First | ✅ Pass | Introduces `shouldRun(stage)` to *eliminate* scattered `decision.type === "…"` guards across seven sites in the cycle body, net reducing duplication. The new decision variant is additive, not a refactor of existing variants. No speculative abstractions — the union is closed and `shouldRun` has one caller pattern. |
| V. Mandatory Workflow | ✅ Pass | Spec 006 written → plan (this document) → tasks (`/speckit.tasks` pending) → implement → test → report. |

**Complexity Tracking**: N/A — no violations, no justifications required.

## Project Structure

### Documentation (this feature)

```text
specs/006-mid-cycle-resume/
├── plan.md                                 # this file
├── spec.md                                 # /speckit.specify output (already exists)
├── research.md                             # Phase 0 output — design rationale + open-question resolutions
├── data-model.md                           # Phase 1 output — types + state-field usage
├── quickstart.md                           # Phase 1 output — six-scenario verification matrix
├── contracts/
│   └── types-contract.md                   # Phase 1 output — new union variant + shouldRun signature
├── checklists/
│   └── requirements.md                     # from /speckit.specify
└── tasks.md                                # /speckit.tasks output (not created here)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── orchestrator.ts                     # EDITED — shouldRun helper, cyclesCompleted guard,
│   │                                       #          currentSpecDir propagation, RESUME_AT_STAGE
│   │                                       #          emit + dispatch-site updates at ~7 locations
│   ├── types.ts                            # EDITED — new RESUME_AT_STAGE variant in
│   │                                       #          GapAnalysisDecision union
│   └── state.ts                            # UNCHANGED — STAGE_ORDER, detectStaleState,
│                                           #             reconcileState already tolerate the change
├── main/                                   # UNCHANGED
└── renderer/                               # UNCHANGED
```

**Structure Decision**: No structural changes. The feature is a surgical fix to two files inside the platform-agnostic core. The existing layered architecture (core ↔ IPC ↔ main ↔ renderer) absorbs the change without modification: the UI timeline is already fed by the audit trail's `phase_traces` rows, so as long as `emitSkippedStage` fires for the stages the new resume path skips (it already does), the timeline renders coherently. No IPC contract changes, no preload bridge changes, no renderer changes.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A — all Constitution Check gates pass on the first evaluation.
