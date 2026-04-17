# Feature Specification: Mid-Cycle Resume

**Feature Branch**: `006-mid-cycle-resume`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User description: "Mid-cycle resume — don't lose work when the user pauses between stages (see `docs/my-specs/006-mid-cycle-resume/README.md`)"

## User Scenarios & Testing *(mandatory)*

Dex's autonomous loop walks each feature through an ordered sequence of stages — `gap_analysis → specify → plan → tasks → implement → verify → learnings` — and groups those stages into cycles. Pause/resume is advertised as a safe, first-class affordance: the Topbar **Stop** button is deliberately "pause, not kill" so the user can step away, review, or stop for the day without losing progress.

Today that promise only holds if the user pauses at a cycle boundary. Pausing mid-cycle (e.g., after `specify` finished but `plan` is still running) silently discards the partial work on the next resume: the aborted cycle is counted as complete, a fresh cycle starts from `gap_analysis`, and the spec directory written by `specify` is orphaned on disk with no plan or tasks ever generated against it. The user pays for a specify run they can never use.

The feature restores parity between "pause at a cycle boundary" and "pause between any two stages inside a cycle" so a Stop click never costs the user a stage's worth of LLM spend.

### User Story 1 - Resume at the stage after the last completed one (Priority: P1)

A user running the loop clicks **Stop** after `specify` finishes but before `plan` begins. They come back later, click **Resume**, and the loop picks up at `plan` against the same spec directory `specify` produced — no re-run of `specify`, no new spec directory, no re-walk from `gap_analysis`.

**Why this priority**: This is the core bug. Every other scenario in this spec flows from getting this right. Without it, the Stop button is a trap rather than a tool.

**Independent Test**: Reset the example project to the `fixture/after-clarification` fixture, click **Resume**, wait for the trace to emit `stage_completed(specify)`, click **Stop**, wait for the orchestrator to settle into `status: "paused"`, click **Resume** again. Observe that the first *actually-executed* stage in the new run is `plan`, that the spec directory on disk is the same one `specify` produced in the aborted run, and that the project's cycle counter is unchanged from before the abort.

**Acceptance Scenarios**:

1. **Given** a loop paused after `specify` completed in cycle N, **When** the user clicks **Resume**, **Then** the orchestrator runs `plan` (not `specify`, not `gap_analysis`) against the existing spec directory and the active cycle number remains N.
2. **Given** a loop paused after `plan` completed in cycle N, **When** the user clicks **Resume**, **Then** the orchestrator runs `tasks` next against the existing spec directory and the active cycle number remains N.
3. **Given** a loop paused after `tasks` completed in cycle N (cycle-boundary case — already works today), **When** the user clicks **Resume**, **Then** the orchestrator runs `implement` next and existing behavior is preserved with no regression.

---

### User Story 2 - The run history stays coherent after a mid-cycle resume (Priority: P2)

Because stages are skipped on resume (the cycle doesn't re-run `specify`), the UI's cycle timeline must still show those earlier stages as completed — not missing, not stuck on "running" — so the user can trust what the timeline is telling them about where the loop is.

**Why this priority**: A working resume with a misleading UI erodes trust faster than a broken resume with honest error messages. The whole point of preserving work is letting the user *see* that nothing was lost.

**Independent Test**: After performing the P1 pause-between-specify-and-plan scenario, inspect the Loop Dashboard's cycle timeline for cycle N. All stages that completed before the abort (`gap_analysis`, `specify`) appear as ✓ completed, the stages that are about to run (`plan` onwards) appear in their normal pending/running states, and no stage is shown duplicated or in the wrong order.

**Acceptance Scenarios**:

1. **Given** a mid-cycle resume at stage `plan`, **When** the user views the cycle timeline for the affected cycle, **Then** `gap_analysis` and `specify` appear as completed with their original timestamps and `plan` appears as the currently active stage — not as "re-running" or "queued twice".
2. **Given** a mid-cycle resume, **When** the user inspects the run in the audit trail, **Then** the stored phase records for the skipped stages reflect their original completion and the new stages run under the same cycle identifier.

---

### User Story 3 - Normal completion still advances the loop (Priority: P3)

When a cycle completes naturally — no Stop click, no unrecoverable failure — the loop still advances to the next feature and the cycles-completed counter increments exactly once.

**Why this priority**: This is the regression bar. A fix that solves the pause case but breaks the happy path is worse than the bug. Must keep working.

**Independent Test**: Run a cycle to completion without any manual intervention. Verify the cycle counter increased by exactly one, the next cycle starts at `gap_analysis`, and the loop selects the next feature from the manifest.

**Acceptance Scenarios**:

1. **Given** a cycle that reaches `learnings` without an abort, **When** the cycle's post-amble runs, **Then** the cycles-completed counter increments by one and the next cycle begins at `gap_analysis` for a different feature.
2. **Given** a cycle that fails with an unrecoverable error (not a user abort), **When** the post-amble runs, **Then** the counter still increments so the loop can progress past a poison feature rather than retrying it forever.

---

### Edge Cases

- **Pause during `gap_analysis` itself.** `gap_analysis` is a single short LLM call, cheap to re-run. If the user aborts during it, the next resume re-runs `gap_analysis` from scratch — acceptable, no special handling required.
- **Pause during `implement`, `verify`, or `learnings`.** Out of scope for this feature. `implement` already supports mid-stage resume via its task-checkbox checksum. `verify` and `learnings` are cheap and idempotent; re-running them is acceptable. This feature scope is the pre-implement stages (`specify`, `plan`, `tasks`) whose abortability is the gap.
- **Pause mid-stage, not at a boundary.** Resuming in the middle of a running LLM call is out of scope. The grain of resume is the stage boundary. A user who pauses mid-`plan` will have `plan` re-run from the top on resume — an accepted cost one order of magnitude smaller than the current "lose the whole cycle" cost.
- **Projects with an inflated cycles-completed counter from prior aborts (pre-upgrade state).** On first resume after this feature lands, the orchestrator's existing state-reconciliation path already tolerates the inconsistency by falling back to the earliest affected stage. One slightly-suboptimal resume for pre-existing state is acceptable; no data migration is required.
- **Orchestrator version upgrade that changes the stage sequence.** Out of scope. Any stage-sequence change is a breaking version bump with its own migration story; the existing artifact-drift detection covers this case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve the cycle's identity (cycle number and associated spec directory) across a user-initiated pause, so that a subsequent resume continues the same cycle rather than starting a new one.
- **FR-002**: The system MUST resume at the stage immediately following the last stage that completed before the abort, for pauses that occurred between any two of `specify`, `plan`, and `tasks`.
- **FR-003**: The system MUST NOT re-execute stages that completed successfully before the abort; already-completed stages are skipped on resume.
- **FR-004**: The system MUST preserve on-disk artifacts (specifically the spec directory created by `specify`) across a mid-cycle pause so that subsequent stages operate on the same files the earlier stages produced.
- **FR-005**: The system MUST advance the cycles-completed counter only when a cycle reaches its terminal stage naturally or fails with an unrecoverable error — never as the result of a user-initiated abort.
- **FR-006**: The system MUST record, in the UI's cycle timeline and in the audit trail, that the skipped stages completed successfully during the original run, so the timeline presents a coherent, continuous history after a mid-cycle resume.
- **FR-007**: The system MUST preserve the existing resume behavior for pauses that occurred at a cycle boundary (after `tasks` completed) — resume at `implement`, do not regress.
- **FR-008**: The system MUST treat pauses during `gap_analysis`, `implement`, `verify`, and `learnings` using their current resume behavior (`gap_analysis` re-runs from scratch; `implement` uses its checksum-based resume; `verify` and `learnings` re-run). No changes to those paths.
- **FR-009**: When a cycle is resumed mid-cycle, the system MUST NOT create a new spec directory for the feature being worked on; the existing spec directory continues to be the target for subsequent stages.
- **FR-010**: The system MUST persist enough per-project state at every stage boundary that a hard crash or host-process kill between any two stages can be recovered by the normal resume path — not only soft stops via the UI Stop button.

### Key Entities *(include if feature involves data)*

- **Cycle**: A single traversal of the stage sequence for one feature. Identified by a cycle number within the project. Has a status (`running`, `completed`, `failed`, `stopped`). A `stopped` cycle is resumable; a `completed` or `failed` cycle is not.
- **Stage**: One step of work inside a cycle (`gap_analysis`, `specify`, `plan`, `tasks`, `implement`, `verify`, `learnings`). Stages have a total ordering within a cycle. The last-completed stage is the anchor used by resume to decide the entry point.
- **Active Spec Directory**: The on-disk directory for the feature currently in progress. Created by `specify`. Must be tracked in project state as soon as it exists so that a pause immediately after `specify` (and before any persisted state update from a later stage) is still recoverable.
- **Cycles-Completed Counter**: A per-project counter of cycles whose outcome was `completed` or `failed`. Does not include cycles that ended in `stopped` via a user abort. Used to compute the number of the next cycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of the three pause points covered (between `specify`/`plan`, between `plan`/`tasks`, between `tasks`/`implement`), resuming continues at the correct next stage in 100% of attempts — verified by running each pause scenario against the example project fixture and observing the first executed stage.
- **SC-002**: After any mid-cycle resume, the spec directory on disk is identical (same path, same file contents) to the one the pre-abort run produced — zero new spec directories are created.
- **SC-003**: A user-initiated abort does not advance the cycles-completed counter. Verified by snapshotting the counter before and after a pause; the counter is unchanged.
- **SC-004**: LLM spend on stages that already completed before a pause drops to zero on resume. Verified by observing that no tokens are spent on re-running `specify` after a pause-between-specify-and-plan.
- **SC-005**: Cycles that complete naturally (no abort) continue to advance the counter by exactly one and move to the next feature — no regression in the happy path.
- **SC-006**: The UI's cycle timeline displays every stage of a resumed cycle exactly once, in the correct order, with the skipped stages marked completed and the resumed stage active — verified by visual inspection after each pause scenario.
- **SC-007**: The verification matrix described in the approach document (six scenarios — baseline, three mid-cycle pause points, normal completion, UI coherence) passes end to end with a single loop-run budget (~$10 of LLM spend) against the example project.

## Assumptions

- The grain of resume is the stage boundary. Mid-stage resume (pausing inside a single LLM call) is explicitly out of scope — the cost of re-running the last stage from the top is acceptable compared to the engineering cost of persisting in-flight session state.
- Cycles that end with status `failed` (unrecoverable error) continue to advance the counter, to prevent an infinite retry loop on a poison feature. Only `stopped` (user abort) preserves the counter.
- The `implement`, `verify`, and `learnings` stages are outside this feature's scope. `implement`'s existing per-task checksum resume is sufficient; `verify` and `learnings` are idempotent.
- Existing project state written by previous orchestrator versions does not require explicit migration. The orchestrator's existing state-reconciliation code falls back to the earliest affected stage when it detects drift, which covers any counter inflation from past aborts.
- No UI-facing code changes are required beyond what flows naturally from the existing cycle timeline reading its data from the audit trail. No new dependencies, no schema changes.
