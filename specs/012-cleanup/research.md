# Phase 0 Research: Cleanup — Retire Variant-Groups Verbs and Step Candidate Prompt

**Status**: complete (no `[NEEDS CLARIFICATION]` markers in spec)
**Date**: 2026-04-29

## Why this is a thin research phase

This is a deletion-only refactor of a feature that was authored by the same project. There are no external integrations, no new technologies, and no novel design decisions. The seed README in `docs/my-specs/012-cleanup/README.md` already encodes line-level instructions. What follows is the small set of decisions where the spec or seed could plausibly have been ambiguous — locked in here so they don't re-litigate during implementation.

## Decision 1 — `WORKTREE_LOCKED` error code: drop both code path and test

**Decision**: Remove `"WORKTREE_LOCKED"` from `CheckpointErrorCode` (`src/renderer/services/checkpointService.ts:17`) and the matching `mapToCheckpointError` regex branch (`:43-45`). Also drop the matching test row in `src/renderer/services/__tests__/checkpointService.test.ts:134`.

**Rationale**: A `grep -rn "WORKTREE_LOCKED\|worktree.*lock" src/` against the working tree returns four hits — all in the two files above (the type, the regex, and the test). No non-variant call site surfaces. The error was only ever produced by `spawnVariants` / `cleanupVariantWorktree`, both of which are being deleted.

**Alternatives considered**:

- *Keep the code+regex, drop only the test.* Rejected — the code becomes dead immediately upon variant deletion and would fail the constitution's "no dead code" rule (Principle IV).
- *Keep everything as forward-compat shim.* Rejected — same Principle IV reasoning, plus this spec is explicitly deletion-only and any shim is YAGNI.

## Decision 2 — `.gitignore` seed retention for `.dex/variant-groups/` and `.dex/worktrees/`: keep

**Decision**: Leave the two `.gitignore` seed entries in `src/main/ipc/checkpoints.ts:277-282` (`checkpoints:initRepo` handler) untouched.

**Rationale**: Users who upgrade with leftover `.dex/variant-groups/` or `.dex/worktrees/` directories will benefit from those paths still being silently ignored. The lines are inert reservations — they don't bind any code path, they just prevent accidental commits of stale orphan dirs. Removing them risks pulling those orphans into a future commit on a user's project.

**Alternatives considered**:

- *Scrub both entries.* Rejected — net cost (two extra `.gitignore` entries reserved) is far below net benefit (no risk of orphan commits in user projects).
- *Add a one-shot deletion of `.dex/variant-groups/` and `.dex/worktrees/` on first launch post-upgrade.* Rejected — too risky against user data on first launch; seed README explicitly forbids auto-delete.

## Decision 3 — `AgentProfile.claudeDir` residue: leave for follow-up spec

**Decision**: After deleting `variants.ts` and `agent-overlay.ts`, the `claudeDir` field on `AgentProfile` (and any related variant-only fields in `agent-profile.ts`) becomes unreferenced. Leave it as residue. A future, dedicated spec retires the field.

**Rationale**: Threading the field collapse through `agent-profile.ts`, `profilesService.ts`, `ipc/profiles.ts`, `preload-modules/profiles-api.ts`, and `AgentRunner` profile threading would balloon the change-set well past the deletion-only scope and risks touching the unrelated agent-profile system. The non-goal is explicit in the spec (Non-Goals section). Constitution's Simplicity-First principle prefers a separate, focused spec for that follow-up.

**Alternatives considered**:

- *Collapse `claudeDir` and any variant-only fields in this spec.* Rejected — bloats scope, touches the unrelated profiles system, and adds risk that the smoke test wouldn't cover (profile threading runs through many call sites). A dedicated spec can audit the full profile surface and remove the residue cleanly.
- *Mark `claudeDir` `@deprecated` with a TODO.* Rejected — Principle IV forbids TODO comments.

## Decision 4 — `step_candidate` consumer survival strategy

**Decision**: The `step_candidate` event keeps firing from `src/core/stages/finalize.ts:89`. Two consumers survive:

1. `src/renderer/components/checkpoints/hooks/useTimeline.ts:69` — refresh trigger for timeline marker rendering.
2. `src/renderer/App.tsx:332` — DEBUG-badge payload (carries `candidateSha`, `attemptBranch`, `lastCheckpointTag`).

The third consumer — `CheckpointsEnvelope.tsx`, which used the event to mount the deleted `CandidatePrompt` modal — is removed.

**Rationale**: Both surviving consumers serve operator/diagnostic purposes that are independent of the variant-groups feature. Marker refresh is a UX tell that a stage produced a kept commit; the DEBUG badge is a one-click diagnostic snapshot used to pivot from "the UI is showing something weird" to the right log file (per `.claude/rules/06-testing.md` §4f.6). Both must keep working — SC-004 in the spec is the explicit verification gate.

**Alternatives considered**:

- *Stop firing `step_candidate` entirely.* Rejected — would silently break the DEBUG badge payload's `candidateSha` / `lastCheckpointTag` fields and the timeline marker refresh. Both are out of scope to break.
- *Fire `step_candidate` but rename it (e.g. `checkpoint_promoted`).* Rejected — pure churn with no value, bloats the diff with rename noise that obscures the real deletion.

## Decision 5 — Editing order: leaves first, consumers last, `tsc` between chunks

**Decision**: Implement in this strict order, running `npx tsc --noEmit` after each chunk:

1. **Engine** — `src/core/checkpoints/index.ts` barrel, `jumpTo.ts`, `run-lifecycle.ts`, `events.ts`, `commit.ts` comment, then delete `variants.ts`, `variantGroups.ts`, `agent-overlay.ts`.
2. **IPC + preload** — `src/main/ipc/checkpoints.ts` handlers + imports, `src/main/preload-modules/checkpoints-api.ts`, `src/renderer/electron.d.ts` type signatures.
3. **Renderer service** — `src/renderer/services/checkpointService.ts` methods + types + error codes.
4. **Renderer components** — `CheckpointsEnvelope.tsx`, `TimelinePanel.tsx`, `TimelineGraph.tsx`, `TimelineView.tsx`, `hooks/useTimeline.ts`, then delete the six modal/menu components and `AgentProfileForm.tsx`.
5. **Tests** — `src/core/__tests__/checkpoints.test.ts` block deletions, `src/core/__tests__/agentOverlay.test.ts` delete, `src/renderer/services/__tests__/checkpointService.test.ts` block + fixture trim.
6. **Docs** — banner the two superseded READMEs, run the `grep -l ...` audit and banner any others that surface.

**Rationale**: TypeScript resolves symbols at the consumer site. If you delete a leaf (e.g. `variants.ts`) before the IPC handlers that import it, `tsc --noEmit` reports dozens of unrelated cascade errors. Editing the importer first, then the leaf, keeps each chunk's `tsc` output focused on the change you just made — a tighter feedback loop and a faster bisect path if something goes wrong mid-cleanup. Deleting the actual files only after their imports are gone is the cleanest mechanical order.

**Alternatives considered**:

- *Big-bang delete + edit, then one final `tsc`.* Rejected — would surface a wall of cascade errors at the end with no signal about which chunk introduced them. Constitution's "Test Before Report" principle (III) is easier to honour incrementally.
- *Top-down (consumer first, then leaves).* Equivalent to the chosen order; the chosen wording is leaves-of-the-dependency-graph first, which for *deletion* means edit-the-importer first (because the importer becomes a "leaf consumer" once the symbol it relied on is removed). Same execution order, clearer mental model.

## Decision 6 — `promoteToCheckpoint` unit test: keep

**Decision**: Retain the `promoteToCheckpoint: happy path + idempotent + bad SHA` block in `src/core/__tests__/checkpoints.test.ts:131`.

**Rationale**: It is the **only** unit-level coverage of Record Mode's git-tag operation. No `recordMode.test.ts` exists, and `finalize.test.ts` carries only type-shape pins (the behaviour blocks at `:76-101` are commented out, awaiting Wave-D Vitest infra). Removing the block would leave Record Mode with zero unit coverage — a regression in test depth that violates Principle III (Test Before Report) for the code paths Record Mode protects.

**Alternatives considered**:

- *Move the test to a new `recordMode.test.ts` file.* Rejected — pure churn for this spec, out of scope. A future Wave-E or follow-up spec can split the file.
- *Drop the test and rely on the `dex-ecommerce` smoke run.* Rejected — smoke runs cover the happy path but not the idempotent and bad-SHA branches; losing those is a material drop in coverage.

## Open questions

None. All scope-affecting decisions are resolved.

## References

- Spec: [`spec.md`](./spec.md)
- Seed README: [`docs/my-specs/012-cleanup/README.md`](../../docs/my-specs/012-cleanup/README.md)
- Constitution Principle III (Test Before Report) and IV (Simplicity First): [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)
- Testing protocol: [`.claude/rules/06-testing.md`](../../.claude/rules/06-testing.md) §4c, §4f.6
