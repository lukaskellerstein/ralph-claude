# Quickstart: Verifying Mid-Cycle Resume

**Feature**: 006-mid-cycle-resume
**Date**: 2026-04-17
**Purpose**: Run the six-scenario verification matrix that proves the feature behaves as specified. Total LLM budget: ~$10 for a single end-to-end pass; each scenario can be run independently against a freshly-reset fixture.

This document is the canonical verification contract for `/speckit.implement` and the tester who comes after it. Every scenario includes the exact trigger steps, the observable outcome, and the commands to inspect state.

## Prerequisites

1. Dev environment running (`./dex/scripts/dev-setup.sh` in the background).
2. `electron-chrome` MCP server reachable on CDP port 9333 (confirm via `mcp__electron-chrome__list_pages`).
3. Example project path: `/home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce`.
4. Working branch: `006-mid-cycle-resume` in the `dex` repo (this spec's branch).
5. Changes from C1–C5 (see `contracts/types-contract.md`) implemented in `src/core/types.ts` and `src/core/orchestrator.ts`.
6. Typecheck passes: `npx tsc --noEmit` from the `dex` repo root.

## Reset helper

Before each scenario, reset the example project to a clean fixture:

```bash
# Scenario 2, 3, 4, 5, 6 — start from after-clarification (post-spec-kit setup, pre-specify)
./dex/scripts/reset-example-to.sh after-clarification

# Scenario 1 — start from after-tasks (baseline: pre-existing RESUME_FEATURE path)
./dex/scripts/reset-example-to.sh after-tasks
```

After every reset, sanity-check the workspace:

```bash
cd /home/lukas/Projects/Github/lukaskellerstein/dex-ecommerce && git status --short && ls -la .dex/
```

## Scenarios

### S1 — Baseline: clean resume at cycle boundary (RESUME_FEATURE)

**Purpose**: Confirm the existing cycle-boundary resume path is preserved with zero regression.

1. Reset: `./dex/scripts/reset-example-to.sh after-tasks`.
2. In the Electron app, on the welcome screen, fill `welcome-path` = `/home/lukas/Projects/Github/lukaskellerstein`, `welcome-name` = `dex-ecommerce`. Submit (label should read **Open Existing**).
3. On the loop page, click **Resume** (primary button — the loop detects history and auto-picks resume mode).
4. Observe the trace view.

**Pass criteria**:
- The first stage to actually execute in the new run is `implement` (not `specify`, not `plan`, not `tasks`).
- The stepper shows `specify`, `plan`, `tasks` as ✓ completed (emitted as skipped-with-completion events).
- No new spec directory is created — `ls dex-ecommerce/specs/` shows the same directories as before Resume.
- Audit DB: `sqlite3 ~/.dex/db/data.db "SELECT stage, status FROM phase_traces WHERE run_id = (SELECT id FROM runs ORDER BY created_at DESC LIMIT 1) ORDER BY created_at;"` — the first real (non-skipped) phase is `implement`.

### S2 — Pause between specify and plan (P1)

**Purpose**: The core bug being fixed. A pause immediately after `specify` completes must resume at `plan`.

1. Reset: `./dex/scripts/reset-example-to.sh after-clarification`.
2. Open the project in the Electron app; on the loop page click **Resume**.
3. Watch the trace for `stage_completed(specify)`. Also watch `~/.dex/dev-logs/electron.log` for the matching event line.
4. Click **Stop** in the Topbar immediately after `stage_completed(specify)` and before `stage_started(plan)` fires.
5. Wait until `status: "paused"` lands in `dex-ecommerce/.dex/state.json` — confirm with `cat dex-ecommerce/.dex/state.json | jq .status` returning `"paused"`.
6. Record the pre-resume state: the `cyclesCompleted` value and the `currentSpecDir` value.
7. Click **Resume** again.

**Pass criteria**:
- The first stage to actually execute after gap_analysis is `plan` (NOT `specify`, NOT `implement`).
- `currentSpecDir` in state is unchanged across the Resume — same path as recorded in step 6.
- `specs/NNN-…/spec.md` on disk inside the example project is the same file specify wrote before the abort (byte-for-byte; no spec dir churn). Check with `ls dex-ecommerce/specs/` — exactly one new `NNN-…` directory should exist from this cycle.
- `cyclesCompleted` in state equals what it was before the abort — no silent advance.
- Stepper coherence: `specify` is marked ✓ completed on the cycle timeline; `plan` transitions pending → running.

### S3 — Pause between plan and tasks

**Purpose**: The second intra-cycle resume point. Validates `RESUME_AT_STAGE` with `resumeAtStage = "plan"`.

1. Reset: `./dex/scripts/reset-example-to.sh after-clarification`.
2. Start/resume the loop, same as S2.
3. Wait for `stage_completed(plan)` and click **Stop** before `stage_started(tasks)`.
4. Confirm `status: "paused"`.
5. Click **Resume**.

**Pass criteria**:
- The first stage to actually execute after gap_analysis is `tasks`.
- `currentSpecDir` unchanged.
- Stepper shows `specify` and `plan` as ✓ completed; `tasks` transitions pending → running.
- No new spec directory.
- `cyclesCompleted` unchanged.

### S4 — Pause between tasks and implement (same as S1 pattern)

**Purpose**: Duplicate of S1's pass criteria but originated from a fresh run (not from the `after-tasks` fixture). Confirms that tasks completing organically also maps to `RESUME_FEATURE` (not `RESUME_AT_STAGE`).

1. Reset: `./dex/scripts/reset-example-to.sh after-clarification`.
2. Start/resume the loop.
3. Wait for `stage_completed(tasks)` and click **Stop** before `stage_started(implement)`.
4. Confirm `status: "paused"`.
5. Click **Resume**.

**Pass criteria**:
- The first stage to actually execute after gap_analysis is `implement`.
- Per `research.md §R5 Q4`, the decision emitter selects `RESUME_FEATURE` (not `RESUME_AT_STAGE`) — because `lastCompletedStage === "tasks"`, which is the cycle-boundary case.
- Stepper shows `specify`, `plan`, `tasks` as ✓ completed.
- `cyclesCompleted` unchanged across the pause.

### S5 — Normal cycle completion still advances `cyclesCompleted`

**Purpose**: Regression check. A natural cycle completion must still advance the counter; otherwise the happy path loops forever.

1. Reset: `./dex/scripts/reset-example-to.sh after-tasks`.
2. Start/resume the loop and **do not abort**.
3. Let the cycle run through implement → verify → learnings to natural completion.

**Pass criteria**:
- Before/after: `jq .cyclesCompleted dex-ecommerce/.dex/state.json`. The counter increments by exactly 1.
- The next cycle starts at `gap_analysis` and the emitted decision is `NEXT_FEATURE` (or `GAPS_COMPLETE` if no more features remain).
- If `NEXT_FEATURE`: the feature picked is a different `featureId` from the one just completed.

### S6 — UI stepper coherence after mid-cycle resume

**Purpose**: The timeline is the user's window into resume correctness. Confirm skipped stages render as ✓ completed with their original timestamps, not as "running" or missing.

1. Execute scenario S2 (pause between specify and plan).
2. After the Resume, while `plan` is executing (or immediately after it completes), open the Loop Dashboard.

**Pass criteria**:
- The cycle's timeline row contains one entry per stage, in the correct order: `gap_analysis → specify → plan → tasks → implement → verify → learnings`.
- `specify` shows as ✓ completed with a timestamp from *before* the pause (not from the resume).
- `plan` shows running (if still executing) or ✓ completed (if finished); no duplicate `plan` entry from a pre-abort attempt.
- No stage appears twice. No stage is missing.
- Visual spot-check via `mcp__electron-chrome__take_screenshot` after navigating to the Loop Dashboard — attach to the task's completion report.

## Lightweight post-change checks

After each code change during implementation, run:

```bash
cd /home/lukas/Projects/Github/lukaskellerstein/dex && npx tsc --noEmit
```

This is the only automated check the project supports for core-engine changes (no unit-test harness exists — see plan §Technical Context/Testing). The six scenarios above are the full verification protocol.

## Diagnosis tips if a scenario fails

- **Wrong first stage after Resume**: check the decision emitter at `orchestrator.ts:~2198-2207`. Log `decision` with a `console.log` and compare against the table in `contracts/types-contract.md § C2`. Most likely culprit: the condition that selects between `RESUME_AT_STAGE` and `RESUME_FEATURE`.
- **New spec directory created on Resume (should not happen)**: confirm the `currentSpecDir` early-write from C5 is in place in the specify stage block. If state was written but then immediately nulled, check the null-clobber guard at `orchestrator.ts:~1215-1222`.
- **Counter advanced on Stop (should not happen)**: check the `!cycleAborted` guard at `orchestrator.ts:~2727`. The detector is `abortController?.signal.aborted`.
- **Stepper shows a skipped stage as "running" or missing**: check the `emitSkippedStage` loop in the dispatch at `orchestrator.ts:~2357`. Must emit `specify`/`plan`/`tasks` for `RESUME_FEATURE` (all three) and the stages up to and including `resumeAtStage` for `RESUME_AT_STAGE`.
- **`status` stuck at "paused" even after Resume click**: out of scope for this feature — resume trigger lives in `src/renderer/` and `src/main/ipc/`. Inspect `~/.dex/dev-logs/electron.log` for IPC errors.
- **Per-run logs**: click the DEBUG badge in the UI to copy `RunID` / `PhaseTraceID`, then open `~/.dex/logs/dex-ecommerce/<RunID>/phase-<N>_<slug>/agent.log` for the exact event stream of that stage.

## Pass/fail summary template

Fill this out during the verification pass:

| Scenario | Result | Notes |
|---|---|---|
| S1 — Baseline cycle-boundary resume | ☐ | |
| S2 — Pause specify→plan (P1) | ☐ | |
| S3 — Pause plan→tasks | ☐ | |
| S4 — Pause tasks→implement | ☐ | |
| S5 — Normal completion advance | ☐ | |
| S6 — UI stepper coherence | ☐ | |
| `npx tsc --noEmit` | ☐ | |
