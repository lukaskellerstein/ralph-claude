# Feature Specification: Interactive Checkpoint — Branch, Version, and Retry Without Git

**Feature Branch**: `008-interactive-checkpoint`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User description: "read /home/lukas/Projects/Github/lukaskellerstein/dex/docs/my-specs/008-interactive-checkpoint"

## User Scenarios & Testing *(mandatory)*

Dex runs a project as a pipeline of discrete stages — clarification, constitution, gap analysis, specify, plan, tasks, implement, verify, learnings — and today that pipeline is one-shot. If the user dislikes a stage's output, there is no first-class way to rewind to that stage, retry it, or compare alternatives. This feature adds a **time-travel tree** over the pipeline: every completed stage is captured as a **checkpoint**, and users can rewind, retry, fan out into parallel alternatives, and promote the version they like — all without ever touching git directly.

The feature must preserve Dex's one-button feel: users who do not care about checkpoints should see no new modals, no new toggles in the happy path, and no new concepts to learn.

### User Story 1 - Safety net: auto-capture plus go back and retry a stage (Priority: P1)

Every time a pipeline stage completes, Dex silently captures a checkpoint. When the user looks at the output of a stage and does not like it, they can open the timeline, pick that stage's checkpoint, and re-run the stage (or later stages) from there as a new attempt — without losing the canonical run, without merging branches, and without needing to know git.

**Why this priority**: This is the minimum viable slice that delivers the product promise. Without auto-capture plus go-back-and-retry, there is no feature. All remaining stories enhance, visualise, or parallelise this core loop but depend on it. A user with only this capability already gets the headline value: "run Dex, and if you don't like what stage N produced, just rewind and retry."

**Independent Test**: Run a pipeline end-to-end with default settings. Confirm that each completed stage produced a checkpoint that can later be listed. Pick any past checkpoint, invoke "Go back + Try again", and confirm that the project state is restored to that checkpoint and the stage (or the next stage after it) re-runs as a new attempt distinct from the original canonical history. The original canonical checkpoints must still be reachable after the retry.

**Acceptance Scenarios**:

1. **Given** a user runs a standard pipeline end-to-end with no special flags, **When** the run completes, **Then** every stage that completed has a named checkpoint associated with it, retrievable later, and the user was not shown any new modals or prompts.
2. **Given** a project has at least one completed run with checkpoints, **When** the user picks a past checkpoint (e.g., "after plan, cycle 1") and chooses "Try again", **Then** the project's files are restored to exactly the state at that checkpoint and the pipeline continues from that stage forward as a new attempt, without overwriting the original canonical checkpoints.
3. **Given** the user has uncommitted edits in the working directory, **When** they invoke "Go back", **Then** the system warns them, lists the affected files, and offers to save, discard, or cancel before performing any destructive operation.
4. **Given** an attempt has been started and run to completion, **When** the user inspects the original canonical timeline, **Then** the original canonical checkpoints are unchanged and the new attempt is visible as a separate branch of the timeline tree.

---

### User Story 2 - Timeline view: see and navigate the tree (Priority: P2)

A dedicated panel visualises the checkpoint tree as a git-flow-style graph: a canonical timeline plus any attempts and variant groups that branch off it. The user clicks a node, sees a summary of what that stage produced, and triggers Go back / Try again / Try N ways / Keep this from there. Checkpoints are labelled in plain language ("after plan", "cycle 2 · cart · after tasks"), never as raw git refs.

**Why this priority**: Story 1's retry capability is usable from a plain-text list, but users need a visual model to discover, compare, and reason about alternatives. The timeline makes the tree legible and discoverable. It is a precondition for the interactive flows in Stories 3–5 to feel usable at scale.

**Independent Test**: Open a project that has at least one completed run plus one alternative attempt. Open the timeline panel. Confirm the canonical sequence is shown on a top lane, the alternative attempt on a second lane branching from its fork point, and nodes are labelled with plain-language stage descriptions. Confirm clicking a node opens a detail pane with stage summary and action buttons; confirm the graph auto-scrolls to the newest node when a run is active.

**Acceptance Scenarios**:

1. **Given** a project has canonical checkpoints plus at least one alternative attempt, **When** the user opens the timeline panel, **Then** the canonical timeline is rendered as one visually distinct lane, each attempt as a separate branching lane, and each variant group as adjacent lanes within the fan-out point.
2. **Given** a user hovers over a node, **When** the cursor rests, **Then** a tooltip shows the stage name, duration, and cost.
3. **Given** a user clicks a node, **When** the click completes, **Then** a side panel opens showing the stage summary and offering the applicable actions (Go back, Try again, Try N ways, Keep this).
4. **Given** the user has not opened the panel, **When** a run executes, **Then** no panel appears and no modal fires in the default happy path.
5. **Given** a checkpoint's underlying data has been deleted outside the app, **When** the timeline refreshes, **Then** that entry is clearly marked as unavailable rather than silently omitted or crashing the panel.

---

### User Story 3 - Step mode: inspect each stage before continuing (Priority: P3)

When the user toggles "Pause after each stage", the orchestrator runs exactly one stage and then pauses. The user sees a per-stage summary and chooses what to do next: **Keep this** (promote the stage as canonical and continue), **Try again** (re-run this stage as a fresh attempt), or **Try N ways** (fork the next stage into parallel variants). Exiting step mode returns to the default run-to-completion behaviour.

**Why this priority**: Step mode converts Dex from an autonomous pipeline into an interactive one. It is distinct from abort/stop — the pause is a semantic "awaiting user decision" signal, not a crash. This is the UX backbone for the heavier interaction in Stories 4 and 5, and it is usable on its own.

**Independent Test**: Toggle the "Pause after each stage" setting on. Start a run. Confirm the pipeline runs exactly one stage, then pauses with a clear in-app indication that the pause was caused by step mode (not by user abort, budget exhaustion, or error). The user sees a stage summary. Clicking Keep this advances one more stage and pauses again; clicking Try again restarts the same stage as a new attempt and pauses again after it completes.

**Acceptance Scenarios**:

1. **Given** step mode is on, **When** a stage completes, **Then** the run pauses, the reason displayed to the user is clearly "step mode" (distinct from other pause causes), and a stage summary is shown.
2. **Given** the run is paused in step mode, **When** the user clicks **Keep this**, **Then** the canonical timeline advances to include the just-completed stage and the next stage begins running.
3. **Given** the run is paused in step mode, **When** the user clicks **Try again**, **Then** the just-completed stage's attempt is archived and the same stage re-runs as a fresh attempt from its parent checkpoint.
4. **Given** the user aborts mid-run, **When** the pause is examined, **Then** the reason is displayed as "user abort" and is visibly distinct from a step-mode pause.

---

### User Story 4 - Try N ways: parallel variants of a stage (Priority: P4)

From any checkpoint, the user picks **Try N ways** (default 3, configurable 2–5). Dex estimates the cost ("about $X per variant, median of the last 5 runs of this stage") and, on confirmation, spawns N alternative attempts of the next stage. Spec-only stages (those that only change planning documents, not compiled code) run **in parallel**, so the wall-clock time is roughly the same as a single attempt. Stages that share heavyweight build state (implementation, verification) run **sequentially** to avoid conflicts. When all variants have finished, Dex opens a side-by-side comparison view. The user picks one with **Keep this**; the others are retained as inspectable branches and cleaned up automatically after a grace period.

**Why this priority**: This is the standout capability that differentiates Dex from free-form AI coding tools. It is only usable once Stories 1–3 exist, but it transforms the product: "try 3 plans in parallel, compare, pick one" becomes a headline workflow. Priority P4 reflects dependency ordering, not importance.

**Independent Test**: From a checkpoint at a parallelisable stage (e.g., after tasks), click "Try 3 ways". Confirm the cost estimate modal shows a sensible median/upper-quartile figure derived from recent runs. Confirm three alternative attempts are generated. For a parallelisable stage, confirm the wall-clock time is close to one stage's duration, not three times it. When all three complete, confirm a comparison view opens with three panes showing per-stage summaries plus a diff of only the relevant artefact type. Click Keep this on variant B; confirm the canonical timeline now points at B's output and A and C remain as inspectable branches.

**Acceptance Scenarios**:

1. **Given** a user is on any checkpoint, **When** they click **Try N ways**, **Then** a cost estimate appears before any work starts, based on the median and upper quartile of recent comparable stage runs.
2. **Given** the selected stage is a spec-only stage (gap analysis, specify, plan, tasks, learnings), **When** the user confirms fan-out, **Then** all N attempts execute concurrently and total wall-clock time is approximately one variant's duration (not N × duration).
3. **Given** the selected stage shares build/compile state (implement, implement-fix, verify), **When** the user confirms fan-out, **Then** the N attempts execute serially on the main working tree to avoid conflicts.
4. **Given** all N variants have completed, **When** the user opens the comparison view, **Then** they see N side-by-side panes, each with a stage summary and a diff scoped to the artefacts relevant to that stage type.
5. **Given** the user clicks **Keep this** on variant B, **When** the promotion completes, **Then** the canonical timeline moves to B, the other variants remain as inspectable attempt branches, and any temporary working copies for the other variants are cleaned up.
6. **Given** the user clicks **Discard all** in the comparison view, **When** the dismissal completes, **Then** the canonical timeline is unchanged, working copies for all variants are cleaned up, and the branches remain available for inspection within the retention window.
7. **Given** a variant group is in progress, **When** the app is closed and reopened, **Then** the user is offered a "Continue variant group" flow that resumes pending variants and restarts any that died mid-run, rather than starting a new, unrelated run.
8. **Given** one variant crashed while others succeeded, **When** the group resolves, **Then** the crashed variant is marked as failed (not silently dropped) and the user can still Keep one of the successful variants.

---

### User Story 5 - Record mode: canonical snapshots for teams and baselines (Priority: P5)

The user toggles "Record" (a small badge appears in the top bar). While Record mode is on, every stage's attempt is automatically promoted to the canonical timeline as it completes. This is the operating mode for producing reference baselines — team-shared snapshots, CI fixtures, or the `dex-ecommerce` refresh workflow. Record mode is off by default; a scripted environment may force it on via environment variable. Turning Record on mid-run promotes from that point forward, not retroactively.

**Why this priority**: Record mode is opt-in and serves a narrow but important audience (team snapshotting, CI). It depends on Stories 1 and 2 being solid but is orthogonal to Stories 3 and 4. Its absence does not block any other story.

**Independent Test**: Toggle Record mode on. Start a run. Confirm the top bar shows a REC indicator. Run to completion. Confirm every stage's checkpoint was auto-promoted to the canonical timeline without any user clicks. Confirm the canonical timeline can be shared with a collaborator (e.g., via standard remote push), and that when the collaborator clones the project, they see the same checkpoint tree Dex renders locally.

**Acceptance Scenarios**:

1. **Given** Record mode is on, **When** each stage completes, **Then** that stage's attempt is automatically promoted to canonical without user interaction.
2. **Given** Record mode is toggled on partway through a run, **When** subsequent stages complete, **Then** only stages completed after the toggle are auto-promoted; earlier stages are unaffected.
3. **Given** a collaborator shares a Record-mode project, **When** the receiver opens the project, **Then** they see the same checkpoint tree without additional sync steps beyond standard version-control fetch.
4. **Given** Record mode is off (default), **When** a run completes in the happy path, **Then** no visible top-bar badge appears and no additional prompts interrupt the run.

---

### User Story 6 - Compare any two attempts (Priority: P6)

From the timeline, the user selects two attempt branches (or a checkpoint and an attempt) and opens a comparison. The diff is **stage-aware**: comparing two `plan` attempts shows only the planning artefact changes; comparing two `implement` attempts shows a code change summary; comparing `verify` attempts shows the verification output diff. The user does not have to specify what to diff.

**Why this priority**: Compare is a power-user convenience that reuses the diff infrastructure already built for Story 4's variant comparison view. It is shippable last without blocking anything else.

**Independent Test**: Produce two attempts of the same stage via Story 1 or Story 4. From the timeline, select both and click Compare. Confirm the opened diff is filtered to artefacts relevant to that stage type, not a firehose of unrelated changes.

**Acceptance Scenarios**:

1. **Given** two attempts of the same stage exist, **When** the user selects both and clicks Compare, **Then** a diff view opens scoped to the artefacts that stage produces.
2. **Given** two attempts from different stages are selected, **When** Compare opens, **Then** a general project-level change summary is shown instead of a stage-specific diff.

---

### Edge Cases

The following situations are known to break the "git is invisible" illusion and must be handled explicitly so the user never has to understand git to recover:

- **Uncommitted user changes before Go back**: system shows a modal listing the affected files and offering Save / Discard / Cancel before any destructive operation.
- **Missing version-control identity**: on project open, if identity is unset, the system prompts the user with OS-default suggestions and writes the result to project-local configuration only.
- **Project is not under version control**: system offers to initialise version control and make an initial commit; if the user declines, the timeline is disabled and a banner explains why.
- **Checkpoint data unavailable** (tag deleted, commit garbage-collected externally): the timeline marks the entry as unavailable; other checkpoints remain usable.
- **Detached state** (an internal version-control state that would surprise a non-git user): must never be surfaced; the system always wraps potentially-detached operations in operations that restore a named attempt.
- **External modifications while the app is open**: the timeline auto-refreshes on window focus and on a periodic poll. If the current attempt was deleted externally, the user is prompted to start a fresh attempt from the last known checkpoint.
- **Promotion fails at the last step** (e.g., filesystem or version-control error): the canonical timeline is unchanged, the user sees a friendly error toast, and the full error is logged for diagnosis.
- **Two concurrent Dex instances on the same project**: the second instance renders the timeline read-only and declines to mutate state until the first releases its project lock.
- **Cloned/forked project**: the checkpoint tree is visible to the collaborator because it travels via standard version-control mechanisms; runtime cache is rebuilt locally, not expected from the clone.
- **"Go back" must not destroy non-tracked user files**: environment files, build output, editor state, and anything the user has explicitly excluded from version control must survive a Go back intact.

## Requirements *(mandatory)*

### Functional Requirements

**Automatic capture (Story 1)**

- **FR-001**: System MUST automatically capture a checkpoint at the completion of every pipeline stage, including stages that produce no file changes (so every stage has its own distinct save point).
- **FR-002**: System MUST label every checkpoint in plain language using the stage name and, where applicable, the cycle number and feature name (e.g., "after plan", "cycle 2 · cart · after tasks").
- **FR-003**: System MUST keep a single source of truth for user-facing labels so the same checkpoint reads identically in every part of the UI and in terminal workflows.

**Go back and retry (Story 1)**

- **FR-004**: Users MUST be able to restore the project to the exact state of any past checkpoint and continue the pipeline from that point as a new attempt, without overwriting or rewriting the original canonical history.
- **FR-005**: System MUST detect uncommitted user changes before performing a Go back and offer the user a choice to save, discard, or cancel before any destructive action.
- **FR-006**: System MUST preserve all files that the project has intentionally excluded from version control (environment files, build output, editor state, etc.) across a Go back operation.
- **FR-007**: System MUST never expose an unnamed/detached project state to the user; every restore must result in a named, navigable attempt.

**Timeline visualisation (Story 2)**

- **FR-008**: System MUST provide a timeline panel that visualises the canonical history, all attempts, and all variant groups as a branching tree with distinct visual lanes for canonical, attempts, and variants.
- **FR-009**: System MUST auto-refresh the timeline when: the window regains focus, a stage completes, and a periodic refresh interval elapses (to catch external changes).
- **FR-010**: Users MUST be able to click any node in the timeline to open a detail panel showing the stage summary and context-appropriate actions (Go back, Try again, Try N ways, Keep this).
- **FR-011**: System MUST clearly mark timeline entries whose underlying data is no longer available rather than omitting or crashing on them.
- **FR-012**: System MUST keep the timeline panel collapsed by default so users who do not care about checkpoints see no additional UI in the happy path.
- **FR-013**: System MUST render an alternating visual cue (e.g., shade) between successive pipeline cycles within a run so cycle boundaries are visible at a glance.

**Step mode (Story 3)**

- **FR-014**: System MUST provide a "Pause after each stage" toggle that causes the orchestrator to pause after every stage completion and await an explicit user decision.
- **FR-015**: System MUST distinguish pause reasons (step mode, user abort, budget exhaustion, stage failure) in both the persisted state and the UI.
- **FR-016**: Users MUST be able to, while paused in step mode, choose Keep this (promote and continue), Try again (re-run this stage), or Try N ways (fan out the next stage).
- **FR-017**: Step mode MUST be independently toggleable and fully compatible with all other user-facing actions (Go back, Keep this, Try again, Try N ways, Record).

**Variants (Story 4)**

- **FR-018**: Users MUST be able to fan out any checkpoint into N parallel attempts of the next stage, with N configurable between 2 and 5 (default 3).
- **FR-019**: System MUST show a cost estimate before any fan-out work begins, derived from the median and upper-quartile costs of recent comparable completed stage runs.
- **FR-020**: System MUST execute variants for spec-only stages in parallel, such that total wall-clock time approximates one stage's duration rather than N times it.
- **FR-021**: System MUST execute variants for stages that share build or compile state serially, to avoid conflicts on shared resources such as build artefacts, dependencies, or network ports.
- **FR-022**: System MUST categorise each pipeline stage as parallelisable or serial in a single, centrally maintained place so the categorisation can evolve as new stages are added.
- **FR-023**: When all variants complete, system MUST open a side-by-side comparison view with N panes, each showing a stage summary and a diff scoped to the artefacts that stage produces.
- **FR-024**: Users MUST be able to pick one variant as canonical (Keep this) — which moves the canonical pointer, cleans up the picked variant's temporary working area, and leaves the other variants as inspectable branches.
- **FR-025**: Users MUST be able to dismiss all variants (Discard all) without affecting the canonical timeline; the variant branches remain inspectable within the retention window.
- **FR-026**: System MUST persist enough state about an in-flight variant group that closing the app or a process crash does not strand the user; on reopen, the user is offered a resume flow that continues pending variants and restarts variants that died mid-run.
- **FR-027**: System MUST clearly distinguish failed variants from successful ones in the comparison view so users can still pick a winner when not every variant succeeds.

**Record mode (Story 5)**

- **FR-028**: System MUST provide a Record mode toggle that automatically promotes every completed stage's attempt to canonical, with a clearly visible indicator (e.g., top-bar badge) whenever the mode is active.
- **FR-029**: Record mode MUST be off by default and MUST be overridable to "on" for scripted environments via environment variable.
- **FR-030**: Toggling Record mode mid-run MUST only affect stages that complete after the toggle; prior stages are not retroactively promoted.
- **FR-031**: The canonical checkpoint tree produced by Record mode MUST travel between collaborators using standard version-control push/pull, with no separate sync or service required.

**Comparison (Story 6)**

- **FR-032**: Users MUST be able to select any two attempts from the timeline and open a stage-aware diff that filters to artefacts relevant to the compared stage type.
- **FR-033**: The same stage-aware diff logic MUST back both manual comparison (Story 6) and variant-group comparison (Story 4), so the two flows always behave identically.

**Concurrency & leakage prevention**

- **FR-034**: System MUST prevent two concurrent app instances on the same project from both mutating checkpoint state; the second instance renders the timeline in a read-only presentation until the first releases its project-level lock.
- **FR-035**: System MUST detect missing version-control identity on project open and prompt the user, writing any collected values to project-local configuration only.
- **FR-036**: System MUST detect that a project is not under version control on open and offer to initialise it; declining disables the timeline with an in-app banner, not a crash.
- **FR-037**: System MUST recover gracefully from the user deleting the current attempt outside the app (e.g., via terminal), by prompting to start a new attempt from the last known checkpoint.
- **FR-038**: A failed promotion MUST leave the canonical timeline unchanged, surface a friendly in-app error, and emit a full diagnostic entry to the log pipeline.

**Default-behaviour contract**

- **FR-039**: A user who runs Dex end-to-end in default mode without interacting with the timeline MUST see zero new modals, toggles, or notifications compared to the pre-feature behaviour.
- **FR-040**: Checkpoints, attempts, and variants MUST be presented to the user using the user-facing verbs (Go back, Try again, Try N ways, Keep this, Record); raw version-control concepts (branches, tags, SHAs, detached HEAD) MUST NOT appear in primary UI affordances or primary error messages.
- **FR-041**: System MUST expose a power-user terminal workflow so users who want to work from the command line can find and navigate checkpoints programmatically without opening the app.

**Stage summaries**

- **FR-042**: System MUST provide a per-stage summary view that shows the minimum information needed to decide Keep or Try again for each stage type in the pipeline (clarifications, constitution, manifest, gap analysis, specify, plan, tasks, implement, implement-fix, verify, learnings).
- **FR-043**: Stage summaries MUST derive from existing structured stage output, commit history, and audit records; no new instrumentation is required to populate them.

### Key Entities *(include if feature involves data)*

- **Pipeline Stage**: One discrete step of a Dex run (e.g., "plan", "tasks", "implement"). Each stage produces an inspectable artefact set and, on completion, a checkpoint. Stages are categorised as **parallelisable** (only touches planning artefacts) or **serial** (touches shared build state).
- **Checkpoint**: A named, user-visible save point corresponding to the completion of a stage. Has a plain-language label ("after plan", "cycle 2 · cart · after tasks") that is the single source of truth across the UI and terminal workflows.
- **Canonical Timeline**: The authoritative sequence of checkpoints representing "the current official state" of a run. Mutated only when the user (or Record mode) explicitly promotes an attempt into it.
- **Attempt**: An alternative version of one or more stages that branches from a checkpoint. Attempts exist in parallel to the canonical timeline until one is promoted. Attempts are retained for an inspection window and auto-cleaned thereafter.
- **Variant Group**: A set of sibling attempts produced from a single "Try N ways" action, sharing a common parent checkpoint and a common target stage. The group has a lifecycle (spawned → running → complete → resolved) so that the system can resume a partially-executed group after an app restart.
- **Stage Summary**: A human-readable digest of what a stage produced. Enough information to let the user decide Keep or Try again without reading raw artefacts.
- **Operating Mode**: Default (invisible auto-capture), Step (pause after each stage), Record (auto-promote every attempt). Modes are independently toggleable; Default is the baseline, Step and Record are opt-in.
- **Project Lock**: A coordination primitive that prevents two concurrent app instances from both mutating checkpoint state on the same project. Holds for the duration of checkpoint-mutating operations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Zero-friction default**

- **SC-001**: A user who runs Dex end-to-end with default settings sees zero new modals and zero new prompts introduced by this feature.
- **SC-002**: A completed default run produces at least one checkpoint for every stage it executes, verifiable without opening the UI.

**Discoverable retry**

- **SC-003**: A user who does not know version control can, without reading documentation, rewind to a past stage and re-run it within three clicks from the timeline.
- **SC-004**: 100% of recoverable-state edge cases (dirty working tree, missing identity, not a repo, deleted ref, detached state, external modification, failed promotion, concurrent instances, cloned project, cleanup of user-excluded files) produce a friendly in-app explanation or recovery flow, and zero of them produce a raw version-control error string in primary UI.

**Parallel variants**

- **SC-005**: Running three variants of a parallelisable stage (e.g., plan) completes in wall-clock time no greater than 1.5 × the duration of a single plan run, not 3 × (the overhead captures spawn and synchronisation costs).
- **SC-006**: Running three variants of a serial stage (e.g., implement) completes in wall-clock time roughly equal to the sum of the variants' durations — confirming the system correctly prevents resource-conflicting parallelism.
- **SC-007**: Users can produce, compare, and pick among three variant outputs of any parallelisable stage within five minutes of opening the app for the first time (measuring discoverability of the headline workflow).

**Resume-mid-variant robustness**

- **SC-008**: Closing the app during a three-variant run and reopening it results in the user being offered a "Continue" flow for that variant group on the next open, and no pending variant is silently dropped.

**Collaboration**

- **SC-009**: A collaborator who clones a project with a Record-mode-produced timeline sees the same checkpoint tree the originator sees, using only standard version-control fetch — no additional setup required.

**Power-user path**

- **SC-010**: A user can list and navigate all canonical checkpoints for a run from a terminal using only stock version-control tooling, without running the app.

**Test-fixture utility**

- **SC-011**: The existing test-fixture reset workflow for the example project is restated in checkpoint terms without feature regressions — any checkpoint in a recorded run is a valid reset target.

**Scale**

- **SC-012**: The timeline renders a tree of at least 200 nodes (canonical + attempts + variants) without visible interaction lag (pan/zoom/click all remain responsive within 100 ms perceived latency).

## Assumptions

- **Prerequisite feature has shipped**: The per-project JSON audit format introduced in the preceding feature (retiring the shared audit database) is in place. Stage candidate metadata (candidate identifier, label, attempt name) is recorded into that per-project JSON rather than any prior store.
- **Version control is the shared-history layer**: Checkpoint history travels between collaborators via standard version-control push/pull. There is no separate sync service, cloud service, or out-of-band sharing mechanism in v1.
- **Runtime cache is local only**: The per-project runtime cache that holds UI preferences, current stage pointers, and variant-group progress is local to each machine and is rebuilt on project open; it is never expected to travel between collaborators.
- **Dev phase, no migration**: The project is still in a developer-facing phase. Legacy test fixtures that were created by a prior workflow can be deleted outright, not migrated.
- **v1 variant scope is one stage**: A "Try N ways" fan-out covers exactly one stage. Fanning out across multiple consecutive stages is out of scope for this feature and will be addressed in a follow-up.
- **Parallel implementation variants are out of scope for v1**: The implement, implement-fix, and verify stages share heavyweight build state (dependencies, build artefacts, ports) and cannot be safely parallelised in v1. Container-isolated parallelism is a follow-up.
- **Retention window**: Attempt branches are retained for an inspection window of roughly 30 days, then pruned automatically. The exact threshold is a starting guess and will be revisited after real usage data is collected.
- **Cost estimator trains on recent history**: The pre-fan-out cost estimate uses the median and upper quartile of the most recent five completed runs of the same stage type. Early-cycle runs are cheap; late-cycle runs grow — median/quartile is resilient to that skew, mean is not.
- **Timeline graph library choice**: The graph is rendered with a custom lightweight renderer rather than a third-party graph-viz library, to avoid long-term lock-in to an archived or commercialised dependency. (This is an architecture assumption, not a user-facing requirement, but affects maintenance cost.)
- **This feature supersedes the prior fixture-branch scheme** for the example project used in end-to-end tests. That scheme's documentation is rewritten; old fixture branches are deleted.
