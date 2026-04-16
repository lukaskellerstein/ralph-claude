# Quickstart: Autonomous Ralph Loop

**Feature**: 001-autonomous-ralph-loop | **Date**: 2026-04-15

## Prerequisites

- Node.js 18+ with npm
- Electron 30+ (installed via `npm install`)
- `@anthropic-ai/claude-agent-sdk` ^0.1.0
- `ANTHROPIC_API_KEY` environment variable set
- Existing Ralph Claude dev environment (`npm install` completed)

## Development Setup

```bash
# 1. Ensure dependencies are installed
npm install

# 2. Start the dev environment (Vite + Electron)
./dev-setup.sh

# 3. Verify the app launches
# Check /tmp/ralph-claude-logs/electron.log for errors
# Check /tmp/ralph-claude-logs/vite.log for Vite status
```

## Implementation Order

### Phase 1: Foundation (P0)

1. **Add types** — Extend `src/core/types.ts` with `LoopStage`, `GapAnalysisDecision`, loop events, and `RunConfig.mode: "loop"` variant
2. **Extract `runBuild()`** — Pure refactor of `src/core/orchestrator.ts`: move spec-loop + phase-loop into `runBuild()`, call from `run()` for `"plan"` and `"build"` modes
3. **Add prompt builders** — Create `src/core/prompts.ts` with Ralph-style guardrail prompts

### Phase 2: Core Loop Engine (P1)

4. **Add `runStage()`** — Lightweight `query()` wrapper in `src/core/orchestrator.ts` for single-shot stages
5. **Add `runLoop()`** — Main loop function: clarification → constitution → gap analysis → feature cycle
6. **Add failure tracking** — In-memory `Map` + SQLite persistence for degenerate case recovery
7. **Update database schema** — Add `loop_cycles` and `failure_tracker` tables, extend `runs` and `phase_traces`
8. **Update `git.ts`** — Handle `"loop"` mode in branch naming and PR generation

### Phase 3: Integration (P1)

9. **Wire `runLoop()` into `run()`** — Mode dispatch: `"loop"` → `runLoop()`, others → `runBuild()`
10. **Update IPC handlers** — Support loop-specific events and clarification forwarding
11. **Update preload** — Expose loop API methods on `window.dexAPI`

### Phase 4: UI (P2)

12. **Mode selector** — Build/Loop toggle in overview
13. **Description input** — Textarea + file path option for loop mode
14. **Budget controls** — Max cycles and max USD inputs
15. **Clarification panel** — Chat-like Q&A for Phase A
16. **Loop progress indicators** — Cycle/stage display in topbar

## Key Files to Modify

| File | Change |
|------|--------|
| `src/core/types.ts` | Add loop types, extend RunConfig, add events |
| `src/core/orchestrator.ts` | Extract runBuild(), add runStage(), add runLoop() |
| `src/core/prompts.ts` | **NEW** — All prompt builders for loop stages |
| `src/core/parser.ts` | Add parseGapAnalysisResult() |
| `src/core/git.ts` | Add "loop" branch naming |
| `src/core/database.ts` | Add loop_cycles, failure_tracker tables |
| `src/main/ipc/orchestrator.ts` | Add loop IPC handlers |
| `src/main/preload.ts` | Expose loop API |
| `src/renderer/App.tsx` | Add mode selector, loop state |
| `src/renderer/hooks/useOrchestrator.ts` | Add loop event handling |
| `src/renderer/components/loop/` | **NEW** — ClarificationPanel, LoopProgress, BudgetControls |
| `src/renderer/components/layout/Topbar.tsx` | Add loop cycle/stage indicators |

## Testing Strategy

### Per-Phase Verification

- **Phase 1**: `npx tsc --noEmit` — types compile, no runtime changes
- **Phase 2**: Unit test `parseGapAnalysisResult()` with all four decision variants. Run orchestrator with a mock `full_plan.md` to verify loop mechanics.
- **Phase 3**: Start Electron app, verify no regressions in plan/build modes via MCP chrome-devtools
- **Phase 4**: MCP chrome-devtools verification of all new UI components

### End-to-End Verification

Provide a small `full_plan.md` with 2-3 features. Run loop mode. Verify:
- Gap analysis identifies first feature
- Spec is created via `/speckit.specify`
- Plan and tasks are generated
- Implementation runs per phase
- Verify stage catches build errors
- Learnings are written
- Loop terminates on `GAPS_COMPLETE`

## Architecture Decisions

See [research.md](./research.md) for detailed rationale on:
- R1: Interactive clarification via SDK's `AskUserQuestion` tool
- R2: Spec-kit command invocation via prompt slash commands
- R3: Disk-based state persistence between stages
- R4: Regex-based gap analysis result parsing
- R5: In-memory + SQLite failure tracking
- R9: `runStage()` vs `runPhase()` separation
