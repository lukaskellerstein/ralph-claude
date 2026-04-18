# 009 — Testing Checkpointing via Mock Agent

## Context

Testing the **008-interactive-checkpoint** feature end-to-end requires cycling through every phase of the loop — prerequisites, clarification, the per-feature Dex loop, completion — just to exercise the checkpoint UI (tags, timeline, Go Back, Try Again, Try N Ways, Record/Step, promotion).

Real Claude runs are **20+ min/cycle and dollars per run**. We need a deterministic mock that:

- Plays a pre-scripted execution instead of calling the SDK,
- Writes the artifacts the **next** stage actually reads, so checkpoints commit real non-empty diffs and the loop progresses naturally,
- Is driven by a **fully enumerated config** — every phase, every step, every cycle spelled out.

At the same time this is a natural opportunity to stop hard-coding `@anthropic-ai/claude-agent-sdk` at the orchestrator level. Abstracting agent execution behind an interface with a small registry lets us plug in **Codex, Gemini, or any future provider** the same way we plug in the mock — no `if/else` litter, no surgery in `orchestrator.ts` per provider.

## Non-Goals

- Replacing real runs in CI or pre-ship validation.
- Faking SDK message-stream fidelity (tool calls, thinking, subagents). Mock emits one `agent_step` per stage; trace view is intentionally sparse.
- A settings UI for agent selection or mock-config editing. Power user edits JSON files.
- Auto-scaling cycles. The config is **explicit** — one cycle entry per cycle; each cycle handles exactly one feature.

## Design — Pluggable `AgentRunner` Registry (Strategy + Factory + Registry)

Today the orchestrator invokes `query()` at two call sites — `runStage()` (`src/core/orchestrator.ts:970`) and `runPhase()` (`src/core/orchestrator.ts:566`). Both mix prompt assembly, SDK invocation, message-loop consumption, and event emission.

**Refactor**: extract agent execution behind an `AgentRunner` interface. The orchestrator calls only `runner.runStage(ctx)` / `runner.runPhase(ctx)` and is agnostic to which provider backs it.

```text
┌──────────────────────┐         ┌──────────────────────────┐
│    orchestrator.ts   │◄────────│  AgentRunner (interface) │
│  runStage / runPhase │         │   runStage(ctx)          │
│   NO provider code   │         │   runPhase(ctx)          │
└──────────────────────┘         └────────────┬─────────────┘
                                              │
            ┌──────────────┬──────────────────┼───────────────┬──────────────────┐
            ▼              ▼                  ▼               ▼                  ▼
  ┌──────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────┐
  │ ClaudeAgentRunner│ │ MockRunner   │ │ CodexRunner  │ │ GeminiRunner  │ │   …future    │
  │ wraps query()    │ │ reads        │ │  (future)    │ │   (future)    │ │              │
  │ from Anthropic   │ │ mock-config  │ │              │ │               │ │              │
  │ SDK              │ │              │ │              │ │               │ │              │
  └──────────────────┘ └──────────────┘ └──────────────┘ └───────────────┘ └──────────────┘
```

### Registry + Factory

```typescript
// src/core/agent/registry.ts
const AGENT_REGISTRY: Record<string, AgentRunnerFactory> = {};

export function registerAgent(name: string, factory: AgentRunnerFactory) {
  AGENT_REGISTRY[name] = factory;
}
export function createAgentRunner(name: string, config: RunConfig, projectDir: string): AgentRunner {
  const factory = AGENT_REGISTRY[name];
  if (!factory) throw new Error(`Unknown agent: ${name}. Registered: ${Object.keys(AGENT_REGISTRY).join(", ")}`);
  return factory(config, projectDir);
}

// at module init (e.g. src/core/agent/index.ts):
registerAgent("claude", (cfg, dir) => new ClaudeAgentRunner(cfg, dir));
registerAgent("mock",   (cfg, dir) => new MockAgentRunner(loadMockConfig(dir), dir));
// future: registerAgent("codex", ...); registerAgent("gemini", ...);
```

Adding Codex later = write `CodexAgentRunner implements AgentRunner`, register it, set `"codex"` in `dex-config.json`. **No orchestrator changes.**

## Project-Level Config — `dex-config.json`

Dex doesn't currently have a persistent project-level config file (only per-run `RunConfig` from the UI, plus `.dex/state.json` for runtime state). We introduce one:

**Path**: `<projectDir>/.dex/dex-config.json` (gitignored, per-developer).

**Initial shape** — minimal, room to grow:

```json
{
  "agent": "claude"
}
```

- `agent` — `"claude"` (default) | `"mock"` | future `"codex"` | `"gemini"`. Matches a name in the `AGENT_REGISTRY`.
- Unknown value → throw at load time with the list of registered agents.
- File absent → default to `{ "agent": "claude" }` and proceed.

Future fields slot in naturally (`defaultModel`, `maxBudgetUsd`, per-agent pointers, etc.). We intentionally don't pre-populate — YAGNI.

### Per-Agent Config Convention

Each registered runner owns its own config file next to `dex-config.json`, named `<agent>-config.json`:

| Runner | Config file | Loaded by |
|---|---|---|
| `claude` | *(none — uses `RunConfig`/env)* | `ClaudeAgentRunner` |
| `mock`   | `.dex/mock-config.json` | `MockAgentRunner` |
| *future* `codex` | `.dex/codex-config.json` | `CodexAgentRunner` |
| *future* `gemini` | `.dex/gemini-config.json` | `GeminiAgentRunner` |

`dex-config.json` is small and selects the runner; each runner's file is as elaborate as it needs to be.

### Loading Flow

1. Orchestrator `run()` → `loadDexConfig(projectDir)` reads `.dex/dex-config.json` (or defaults).
2. `createAgentRunner(dexConfig.agent, runConfig, projectDir)` looks up the factory in `AGENT_REGISTRY`.
3. The factory instantiates the runner; the runner loads its own `<agent>-config.json` if it needs one (e.g. `MockAgentRunner` reads `mock-config.json`).
4. `RunConfig.agent` is an **optional override** — if set (e.g. by a future UI), it wins over `dex-config.json`.

```typescript
// src/core/types.ts — RunConfig
agent?: "claude" | "mock" | string;   // optional override; falls back to dex-config.json
```

## Files to Change / Add

| File | Change |
|---|---|
| `src/core/agent/AgentRunner.ts` **(new)** | `interface AgentRunner { runStage(ctx): Promise<StageResult>; runPhase(ctx): Promise<PhaseResult>; }` + shared types (`StageContext`, `StageResult`, `PhaseContext`, `PhaseResult`). |
| `src/core/agent/ClaudeAgentRunner.ts` **(new)** | Current SDK invocation logic from `runStage`/`runPhase` moved verbatim (hooks, `canUseTool`, structured-output, message loop, event emission). |
| `src/core/agent/MockAgentRunner.ts` **(new)** | Playback engine: constructor takes `MockConfig`; each call → lookup, emit 1 `agent_step`, sleep, execute `writes` / `appends` / return `structured_output`; throws on missing config entry. |
| `src/core/agent/MockConfig.ts` **(new)** | Schema, loader, validator, fixture-path resolver. |
| `src/core/agent/registry.ts` **(new)** | Registry + factory + default registrations. |
| `src/core/agent/index.ts` **(new)** | Barrel + registration of built-in runners. |
| `src/core/dexConfig.ts` **(new)** | `loadDexConfig(projectDir) → { agent: string }`. Reads `.dex/dex-config.json`, validates `agent` against registry, defaults to `"claude"`. |
| `src/core/orchestrator.ts` | In `run()`: `const dexCfg = loadDexConfig(projectDir); const agentName = config.agent ?? dexCfg.agent; const runner = createAgentRunner(agentName, config, projectDir);`. Replace SDK calls with `runner.runStage/runPhase`. **No `if (mockMode)` / no `if (agent === "...")` anywhere.** |
| `src/core/types.ts` | Add `agent?: string` to `RunConfig` (optional override). |
| `src/renderer/components/loop/LoopStartPanel.tsx` | *(No changes initially.)* Agent selection lives in `.dex/dex-config.json`. A UI override can be added later without touching the orchestrator. |
| `fixtures/mock-run/` **(new)** | Fixture set: `spec.md`, `plan.md`, `tasks.md`, `GOAL_clarified.md`, `CLAUDE.md`, `feature-manifest.json`, etc. Trimmed copies of real files in `specs/008-interactive-checkpoint/`. |
| `src/core/agent/__tests__/MockAgentRunner.test.ts` **(new)** | Per-stage handlers, missing-config error, fixture-missing error, structured-output pass-through. |
| `src/core/agent/__tests__/registry.test.ts` **(new)** | Unknown-agent error, default registration, override via `registerAgent`. |

Existing pieces the mock relies on **without modification**:
- `commitCheckpoint` at `src/core/git.ts:34-75`
- Tag naming at `src/core/checkpoints.ts:50-52`
- `STAGE_ORDER` at `src/core/state.ts:380`
- `OrchestratorEvent` types at `src/core/types.ts:200-305`

## Mock Config Shape — Mirrors the Four Orchestrator Phases

Path: `<projectDir>/.dex/mock-config.json` (gitignored).

Top-level keys = the four phases: **`prerequisites`**, **`clarification`**, **`dex_loop`**, **`completion`**. Each phase contains sub-objects for its steps. The Dex loop phase additionally contains the cycles enumeration since those only exist there.

### Proposed phase → stage mapping

| Phase | Stages (from `STAGE_ORDER` at `src/core/state.ts:380`) |
|---|---|
| `prerequisites`   | `prerequisites` |
| `clarification`   | `clarification_product`, `clarification_technical`, `clarification_synthesis`, `constitution`, `manifest_extraction` |
| `dex_loop`        | per cycle (one feature per cycle): `gap_analysis`, `specify`, `plan`, `tasks`, `implement`, `implement_fix`, `verify`, `learnings` |
| `completion`      | *(currently none; reserved for future post-loop wrap stages)* |

Confirm at implementation time — if `constitution` / `manifest_extraction` should live in their own phase, it's a one-line change in the grouping.

### Example

```json
{
  "enabled": true,
  "fixtureDir": "fixtures/mock-run/",

  "prerequisites": {
    "prerequisites": { "delay": 100 }
  },

  "clarification": {
    "clarification_product":   { "delay": 200 },
    "clarification_technical": { "delay": 200 },
    "clarification_synthesis": {
      "delay": 200,
      "writes": [
        { "path": "GOAL_clarified.md", "from": "GOAL_clarified.md" },
        { "path": "CLAUDE.md",         "from": "CLAUDE.md" }
      ]
    },
    "constitution": { "delay": 200 },
    "manifest_extraction": {
      "delay": 200,
      "writes": [{ "path": ".dex/feature-manifest.json", "from": "feature-manifest.json" }]
    }
  },

  "dex_loop": {
    "cycles": [
      {
        "feature": { "id": "f-001", "title": "Authentication" },
        "stages": {
          "gap_analysis": { "delay": 150, "structured_output": { "decision": "RESUME_FEATURE" } },
          "specify":      { "delay": 400, "writes": [{ "path": "{specDir}/spec.md",  "from": "f1-spec.md"  }] },
          "plan":         { "delay": 400, "writes": [{ "path": "{specDir}/plan.md",  "from": "f1-plan.md"  }] },
          "tasks":        { "delay": 400, "writes": [{ "path": "{specDir}/tasks.md", "from": "f1-tasks.md" }] },
          "implement":    { "delay": 500, "writes": [{ "path": "src/mock/c1-f1.ts",  "content": "// mock c1-f1\n" }] },
          "verify":       { "delay": 200, "structured_output": { "ok": true, "issues": [] } },
          "learnings":    { "delay": 200, "appends": [{ "path": ".dex/learnings.md", "line": "- **mock**: c1 f-001\n" }] }
        }
      },
      {
        "feature": { "id": "f-002", "title": "Payments" },
        "stages": { "...": "same shape — one cycle handles exactly one feature" }
      },
      {
        "feature": { "id": "f-001", "title": "Authentication (follow-up)" },
        "stages": { "...": "final cycle would use gap_analysis structured_output { decision: 'GAPS_COMPLETE' } to terminate" }
      }
    ]
  },

  "completion": {}
}
```

### Field Semantics

- `enabled` — master switch. If `false` while `dex-config.json` says `agent: "mock"`, refuse to start with a clear error.
- `fixtureDir` — base for `from` paths. Defaults to repo `fixtures/mock-run/`.
- Each step descriptor:
  - `delay` — ms to sleep (`time.sleep` equivalent).
  - `writes` — `[{ path, from? , content? }]`. `path` supports `{specDir}`, `{cycle}`, `{feature}`. Either `from` (copy fixture) or `content` (literal). Parent dirs created.
  - `appends` — `[{ path, line }]`. Append a line.
  - `structured_output` — JSON returned verbatim for stages with output schemas (`gap_analysis`, `verify`, `clarification_synthesis`, `manifest_extraction`).

### Lookup Rules (inside `MockAgentRunner`)

1. Resolve which phase the requested `ctx.stage` belongs to via the phase→stage map.
2. If phase is `dex_loop` → look in `dex_loop.cycles[ctx.cycleNumber - 1].stages[ctx.stage]`. (One cycle = one feature — see orchestrator at `src/core/orchestrator.ts:2441-2502`.)
3. Else → look in `<phase>.<stage>`.
4. Miss → throw `MockConfigMissingEntryError` with the requested coordinates and the closest match.

**No silent fakes.** Config drift is loud and immediately fixable.

### Loop Length

Emerges directly from the config:

- `manifest_extraction`'s fixture (`feature-manifest.json`) enumerates the features the orchestrator's gap-analysis step will walk through. The distinct `cycles[].feature.id` values in `dex_loop` must match the IDs in that manifest.
- Per-cycle `gap_analysis.structured_output.decision` drives what happens that cycle: `RESUME_FEATURE` / `REPLAN_FEATURE` for continuing on a feature, `NEXT_FEATURE` for moving to the next pending one, `GAPS_COMPLETE` to terminate the loop. The last cycle should end with `GAPS_COMPLETE`. (Values taken from `GAP_ANALYSIS_SCHEMA` at `src/core/orchestrator.ts:2471`.)
- Exhausting `cycles[]` without an explicit `GAPS_COMPLETE` is treated as a halt with a clear message.

## Per-Stage Mock Behavior (Canonical Table)

| Stage | Mock action |
|---|---|
| `prerequisites` | Sleep; no artifact. |
| `clarification_product` / `_technical` | Sleep; no artifact. |
| `clarification_synthesis` | Sleep; copy fixtures → `GOAL_clarified.md`, `CLAUDE.md`. |
| `constitution` | Sleep; copy constitution fixture. |
| `manifest_extraction` | Sleep; copy fixture → `.dex/feature-manifest.json` (sourceHash recomputed against current `GOAL_clarified.md`). |
| `gap_analysis` | Sleep; return config's `structured_output`. |
| `specify` / `plan` / `tasks` | Sleep; copy fixture → `<specDir>/{spec,plan,tasks}.md`. Create `<specDir>` if absent. |
| `implement` / `implement_fix` | Sleep; write a mock source file (path from config) → non-empty git diff for `commitCheckpoint`. |
| `verify` | Sleep; return config's `structured_output` (matches `VERIFY_SCHEMA`). |
| `learnings` | Sleep; append line to `.dex/learnings.md`. |

## Verification (DoD)

1. `npx tsc --noEmit` — types compile.
2. `npm test -- MockAgentRunner registry` — unit tests pass.
3. End-to-end in `dex-ecommerce`:
   - `./scripts/reset-example-to.sh clean`
   - Author `dex-ecommerce/.dex/dex-config.json` → `{ "agent": "mock" }`.
   - Author `dex-ecommerce/.dex/mock-config.json` with e.g. 3 cycles (one feature each), `delay: 100` everywhere, last cycle's `gap_analysis.structured_output.decision: "GAPS_COMPLETE"`.
   - Click **Start Autonomous Loop** (no UI toggle needed — orchestrator reads `dex-config.json`).
   - Full loop finishes in well under 60s.
   - `git tag --list 'checkpoint/*'` — expect tags for every stage in every cycle.
   - `git log --all --grep='^\[checkpoint:' --oneline` — every commit stamped.
   - `.dex/feature-manifest.json`, `.dex/learnings.md`, `specs/*/{spec,plan,tasks}.md`, `src/mock/c*-f*.ts` all present.
   - In the UI: open 008 TimelinePanel, click Go Back on a mid-cycle checkpoint, confirm the attempt branch is created and working tree matches.
   - Repeat with Step Mode on (loop pauses after each stage).
   - Repeat with Record Mode on (every candidate auto-promoted).
4. Negative: delete one entry mid-run → `MockConfigMissingEntryError` surfaces cleanly, loop halts.
5. Sanity: set `dex-config.json` back to `{ "agent": "claude" }` and run one real-agent cycle — confirm the refactor caused no regression.

## Risks / Notes

- **Refactor surface**: moving `runStage`/`runPhase` SDK bodies into `ClaudeAgentRunner` is a real (~150-300 line) move. Existing tests on the real path are minimal — step 5 of Verification guards this explicitly.
- **Structured-output schemas** — `MockAgentRunner` does not validate `structured_output` against `GAP_ANALYSIS_SCHEMA` / `VERIFY_SCHEMA` / `MANIFEST_SCHEMA`; user owns shape correctness. Mismatch fails at the next stage with a clear orchestrator error.
- **Mock trace is sparse** (one step per stage). Acceptable — this mode targets checkpoint testing, not trace fidelity.
- **Fixture drift** — real prompts evolving could stale fixtures. Mitigation: missing fixture → clear error naming the resolved path.
