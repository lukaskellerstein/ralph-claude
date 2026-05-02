# Implementation Plan: Cleanup — Retire Variant-Groups Verbs and Step Candidate Prompt

**Branch**: `012-cleanup` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification at [`/specs/012-cleanup/spec.md`](./spec.md)

## Summary

Delete the variant-groups feature surface (worktrees, attempt branches, compare/resume modals) and the `Keep this` / `Unmark kept` / `Try N ways from here` right-click verbs from the Timeline canvas. Retire the `CandidatePrompt` modal so step-mode pauses resume via the existing **Resume** button on the Loop Dashboard. Record Mode auto-promote, Go-Back, Jump-to-Checkpoint, the Record-mode badge, and the timeline core all stay. Deletion-only — no new functions, abstractions, or dependencies.

**Technical approach**: Edit the dependency graph from leaves toward consumers — engine (`src/core/`) → IPC handlers + preload bridge → renderer service → renderer components → unit tests — running `npx tsc --noEmit` between each chunk to catch barrel-export typos and dangling imports early. Final verification combines `npm test`, an `dex-ecommerce` UI smoke run, and a regex-grep that asserts zero hits for removed symbols inside `src/`.

## Technical Context

**Language/Version**: TypeScript 5.6+ (strict mode), Node.js bundled with Electron 41 (Node 20 runtime).
**Primary Dependencies**: Unchanged production stack — `@anthropic-ai/claude-agent-sdk` ^0.1.45, `electron` ^41.2.1, `react` ^18.3.1, `gsap` ^3.12.5, `lucide-react` ^0.460.0, `d3-shape`, `d3-zoom`. Dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` (already present from 011 Wave D). **No new dependencies.**
**Storage**: Filesystem only — `<projectDir>/.dex/state.json`, `<projectDir>/.dex/feature-manifest.json`, `<projectDir>/.dex/learnings.md`, `<projectDir>/.dex/runs/<runId>.json`, `~/.dex/logs/<project>/<runId>/...`. No schema change.
**Testing**: Vitest (`npm test`) + `npx tsc --noEmit` after each chunk; UI smoke against `dex-ecommerce` per `.claude/rules/06-testing.md` §4c using the `electron-chrome` MCP server (CDP port 9333).
**Target Platform**: Electron 41 desktop app on Linux/macOS/Windows (frameless BrowserWindow, custom title bar).
**Project Type**: desktop-app (Electron main + Vite-bundled React renderer + platform-agnostic Node core).
**Performance Goals**: No regression in current Timeline rendering (60 fps interactions on graphs up to ~500 commits). Removal-only — no new perf budgets.
**Constraints**: `npx tsc --noEmit` must return zero errors after each chunk; `npm test` must stay green; right-click + step-candidate paths must produce no UI output post-cleanup; existing on-disk artefacts (`checkpoint/*` tags, orphan `.dex/variant-groups/`) must continue to load.
**Scale/Scope**: ~10 files deleted, ~10 files edited; ~7 IPC handlers + ~7 preload methods removed; 5 unit-test blocks deleted; 2 spec READMEs banner-flagged. Estimated net `src/` LOC reduction ≈ 1.5–2 kLOC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Rationale |
|-----------|---------|-----------|
| I. Clean-Context Orchestration | ✅ Pass | No changes to `query()` invocations or hook callbacks. `step_candidate` event firing path is preserved; only consumers shrink. |
| II. Platform-Agnostic Core | ✅ Pass | All `src/core/` deletions reduce code; no new imports added. The barrel `src/core/checkpoints/index.ts` and dependents stay Electron-free. |
| III. Test Before Report | ✅ Pass | Verification is encoded as FR-017 + SC-001..-008 in the spec, including the `dex-ecommerce` UI smoke recipe and the regex-grep. `promoteToCheckpoint` unit test is preserved as the sole Record-Mode coverage. |
| IV. Simplicity First | ✅ Pass (this *is* simplicity-first) | Pure deletion of YAGNI/dead code. No abstractions, no flags, no compatibility shims. The `claudeDir` residue is documented as a follow-up rather than dragged in here. |
| V. Mandatory Workflow | ✅ Pass | Spec ✅ → Plan (this) → `/speckit.tasks` → implement in chunks → test (per FR-017) → report. |

No gate violations. Complexity Tracking section omitted.

**Post-design re-check** (after Phase 1 artefacts below): unchanged — the `contracts/`, `data-model.md`, and `quickstart.md` documents are descriptive (after-state inventories of the IPC + event surfaces); they introduce no new code, abstractions, or dependencies, so all five gates remain green.

## Project Structure

### Documentation (this feature)

```text
specs/012-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0 — locked-in decisions (no clarifications, but four pre-resolved choices recorded)
├── data-model.md        # Phase 1 — removed-entity inventory (no new entities introduced)
├── quickstart.md        # Phase 1 — `dex-ecommerce` smoke-test recipe with exact MCP/grep verification commands
├── contracts/
│   ├── ipc-checkpoints.md          # Phase 1 — after-state of the `dexAPI.checkpoints` shape + removed entries
│   └── orchestrator-events.md      # Phase 1 — after-state of the orchestrator event union + the namespace barrel re-exports
└── tasks.md             # Phase 2 — produced by `/speckit.tasks`, not this command
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── index.ts
│   ├── preload.ts
│   ├── preload-modules/
│   │   └── checkpoints-api.ts        # ✏️ EDIT — drop variant + promote/unmark + compareAttempts methods
│   └── ipc/
│       └── checkpoints.ts            # ✏️ EDIT — drop 7 handlers + the variant-related imports
├── core/                              # platform-agnostic engine
│   ├── orchestrator.ts                # unchanged (callsite for autoPromoteIfRecordMode at :287 stays)
│   ├── run-lifecycle.ts               # ✏️ EDIT — drop emitPendingVariantGroups + 2 callsites
│   ├── events.ts                      # ✏️ EDIT — drop variant_group_resume_needed + variant_group_complete from union
│   ├── stages/
│   │   └── finalize.ts                # unchanged (autoPromoteIfRecordMode :99 + step_candidate emit :89 stay)
│   ├── checkpoints/
│   │   ├── index.ts                   # ✏️ EDIT — drop variant + unmark exports + namespace keys
│   │   ├── jumpTo.ts                  # ✏️ EDIT — delete unmarkCheckpoint :66-89; trim doc :2
│   │   ├── recordMode.ts              # unchanged (promoteToCheckpoint, autoPromoteIfRecordMode)
│   │   ├── timeline.ts                # unchanged
│   │   ├── commit.ts                  # ✏️ EDIT (comment-only) — trim variant-groups/worktrees mention :44
│   │   ├── tags.ts                    # unchanged
│   │   ├── _helpers.ts                # unchanged
│   │   ├── variants.ts                # 🗑 DELETE
│   │   └── variantGroups.ts           # 🗑 DELETE
│   ├── agent-overlay.ts               # 🗑 DELETE (only consumer is variants.ts)
│   ├── agent-profile.ts               # unchanged (claudeDir residue intentionally left for follow-up spec)
│   └── __tests__/
│       ├── checkpoints.test.ts        # ✏️ EDIT — drop 5 variant/unmark blocks, keep promoteToCheckpoint block
│       ├── agentOverlay.test.ts       # 🗑 DELETE
│       └── finalize.test.ts           # unchanged (re-run to confirm green)
└── renderer/
    ├── electron.d.ts                  # ✏️ EDIT — drop variant + promote/unmark + compareAttempts method signatures
    ├── App.tsx                        # unchanged (step_candidate listener at :332 — DEBUG-badge payload — stays)
    ├── services/
    │   ├── checkpointService.ts       # ✏️ EDIT — drop 7 methods + WORKTREE_LOCKED + VARIANT_GROUP_MISSING + variant types
    │   └── __tests__/
    │       └── checkpointService.test.ts  # ✏️ EDIT — drop variant blocks + shrink expected method-set assertion
    └── components/checkpoints/
        ├── CheckpointsEnvelope.tsx    # ✏️ EDIT — gut variant + step-candidate state, handlers, JSX, imports, poll
        ├── TimelinePanel.tsx          # ✏️ EDIT — drop right-click wiring + onTryNWaysAt prop chain
        ├── TimelineGraph.tsx          # ✏️ EDIT — drop onContextMenu prop + listener + cursor styling
        ├── TimelineView.tsx           # ✏️ EDIT — drop TryNWaysModal mount + handleTryNWaysAt + handleConfirmSpawn + ClaudeProfile/VariantSlotState imports
        ├── hooks/
        │   └── useTimeline.ts         # ✏️ EDIT — drop variant_group_complete branch from event subscription
        ├── RecBadge.tsx               # unchanged
        ├── GoBackConfirm.tsx          # unchanged
        ├── IdentityPrompt.tsx         # unchanged
        ├── InitRepoPrompt.tsx         # unchanged
        ├── Modal.tsx                  # unchanged
        ├── StageSummary.tsx           # unchanged
        ├── timelineLayout.ts          # unchanged
        ├── stageOrder.ts              # unchanged
        ├── AgentProfileForm.tsx       # 🗑 DELETE
        ├── CandidatePrompt.tsx        # 🗑 DELETE
        ├── CommitContextMenu.tsx      # 🗑 DELETE
        ├── ContinueVariantGroupModal.tsx # 🗑 DELETE
        ├── TryNWaysModal.tsx          # 🗑 DELETE
        └── VariantCompareModal.tsx    # 🗑 DELETE

docs/my-specs/                          # ✏️ banner-flag updates
├── 008-interactive-checkpoint/README.md   # ✏️ EDIT — add Status: banner under H1
├── 010-interactive-timeline/README.md     # ✏️ EDIT — add Status: banner under H1
└── …                                       # ✏️ banner any other README surfaced by grep
```

**Structure Decision**: Single-project Electron desktop-app layout (existing). No new directories. The chunked editing order — engine → IPC + preload → renderer service → renderer components → tests — drives the implementation phases in `/speckit.tasks` because TypeScript's symbol resolution will surface dangling-import errors at the consuming layer if you reverse the order. `tsc --noEmit` between chunks turns those errors into fast feedback rather than a single end-of-run avalanche.

## Complexity Tracking

> No constitution violations to justify. Section intentionally empty.
