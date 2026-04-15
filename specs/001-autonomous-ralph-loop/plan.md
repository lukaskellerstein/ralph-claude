# Implementation Plan: Autonomous Ralph Loop

**Branch**: `001-autonomous-ralph-loop` | **Date**: 2026-04-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-autonomous-ralph-loop/spec.md`

## Summary

Implement the Ralph Wiggum autonomous loop: a two-phase system where Phase A conducts interactive clarification to produce a comprehensive `full_plan.md`, and Phase B autonomously cycles through gap analysis, spec generation, planning, task generation, implementation, verification, and learnings — each as a fresh `query()` call with clean context. Extends the existing orchestrator with a new `"loop"` mode while preserving backward compatibility with `"plan"` and `"build"` modes.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js (Electron 30+)
**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` ^0.1.0, `better-sqlite3` ^12.9.0, Electron ^30.0.0, React 18, GSAP, Lucide React
**Storage**: SQLite via better-sqlite3 (runs, phase_traces, trace_steps, subagent_metadata tables)
**Testing**: `npx tsc --noEmit` (typecheck), MCP chrome-devtools (UI verification via CDP port 9333)
**Target Platform**: Desktop (Electron, frameless BrowserWindow)
**Project Type**: Desktop app (Electron + React)
**Performance Goals**: Responsive UI during long-running autonomous loops (hours/days), no context bloat across stages
**Constraints**: Each stage MUST be a separate `query()` call (clean context isolation), `src/core/` MUST NOT import Electron, `full_plan.md` is read-only during Phase B
**Scale/Scope**: 6 user stories (2×P1, 2×P2, 2×P3), 19 functional requirements, extends ~5 core files + ~3 new files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **I. Clean-Context Orchestration** | PASS | Each loop stage is a separate `query()` call. No state carried between stages — context provided solely through spec-kit artifacts on disk. Matches the constitution exactly. |
| **II. Platform-Agnostic Core** | PASS | All loop logic lives in `src/core/` (orchestrator.ts, prompts.ts, types.ts). No Electron imports. IPC handlers in `src/main/ipc/` bridge to renderer. |
| **III. Test Before Report** | PASS | Verify stage (step 6 of each cycle) runs build + tests + browser-based e2e. Per-task backpressure in implement prompts. Constitution's testing protocol applies to our own development of this feature. |
| **IV. Simplicity First** | PASS | Extends existing patterns (run→runBuild refactor, new runLoop alongside). No new frameworks, no speculative abstractions. Prompt builders are simple string functions. |
| **V. Mandatory Workflow** | PASS | The loop itself embodies this: gap analysis (understand) → plan → implement → verify → report (learnings). Our development of this feature follows the same workflow. |

**Gate result: PASS — no violations. Proceeding to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/001-autonomous-ralph-loop/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (IPC contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── orchestrator.ts     # MODIFY: Extract runBuild(), add runLoop(), runStage()
│   ├── types.ts            # MODIFY: Add LoopStage, GapAnalysisResult, loop events, RunConfig.mode union
│   ├── prompts.ts          # NEW: All prompt builders (clarification, gap analysis, specify, plan, etc.)
│   ├── parser.ts           # MODIFY: Add parseGapAnalysisResult()
│   ├── git.ts              # MODIFY: Add "loop" mode branch naming
│   └── database.ts         # MODIFY: Add loop_cycles, failure_tracker tables
├── main/
│   ├── preload.ts          # MODIFY: Expose loop-related API (startLoop, clarification events)
│   └── ipc/
│       └── orchestrator.ts # MODIFY: Add loop IPC handlers
└── renderer/
    ├── App.tsx             # MODIFY: Add Loop mode, description input, mode selector
    ├── components/
    │   ├── loop/
    │   │   ├── ClarificationPanel.tsx   # NEW: Chat-like Q&A for Phase A
    │   │   ├── LoopProgress.tsx         # NEW: Cycle/stage progress indicators
    │   │   └── BudgetControls.tsx       # NEW: Max cycles, max USD inputs
    │   └── layout/
    │       └── Topbar.tsx              # MODIFY: Show loop cycle/stage indicators
    └── hooks/
        └── useOrchestrator.ts          # MODIFY: Add loop state (currentCycle, currentStage, isClarifying)
```

**Structure Decision**: Extends existing single-project structure. New code follows established patterns — `src/core/` for engine logic, `src/main/ipc/` for bridge, `src/renderer/components/` for UI. One new file (`prompts.ts`) in core; three new components in a `loop/` subdirectory.

## Constitution Check — Post-Design Re-evaluation

| Principle | Status | Post-Design Evidence |
|-----------|--------|---------------------|
| **I. Clean-Context Orchestration** | PASS | `runStage()` confirmed as separate `query()` per stage. `runPhase()` reused only for implement (needs task tracking). No state leaks between stages — all context via disk artifacts. |
| **II. Platform-Agnostic Core** | PASS | All new code (`prompts.ts`, loop logic in `orchestrator.ts`, parser additions) stays in `src/core/`. IPC contracts are additive extensions to existing channels — no Electron imports in core. |
| **III. Test Before Report** | PASS | Verify stage (step 6) is a dedicated `query()` call that runs build + tests + browser e2e. Per-task backpressure via implement prompt guardrails. The loop cannot skip verification. |
| **IV. Simplicity First** | PASS | No new frameworks. `prompts.ts` is string builders. `runStage()` is a lighter `runPhase()`. Failure tracker is a simple `Map`. Database changes are additive columns + 2 tables. No speculative abstractions. |
| **V. Mandatory Workflow** | PASS | Loop embodies the workflow: gap analysis (understand) → plan → implement → verify → learnings (report). Each stage is isolated and follows the same principle. |

**Post-design gate: PASS — no violations introduced during Phase 1 design.**

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
