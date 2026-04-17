# Feature Specification: Structured Outputs for Agent Boundaries

**Feature Branch**: `003-structured-outputs`  
**Created**: 2026-04-16  
**Status**: Draft  
**Input**: User description: "Structured outputs for bulletproof feature handoff in the Dex autonomous loop — eliminate free-text parsing at agent boundaries using machine-readable schemas"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deterministic Feature Selection (Priority: P1)

The autonomous loop selects the next feature to build from a pre-extracted manifest rather than re-analyzing the entire project plan every cycle. Feature ordering is stable across cycles — the same feature is never renamed, reordered, or re-described between runs.

**Why this priority**: The current gap analysis stage re-reads the full plan each cycle and independently decides what's next via free-text output that must be regex-parsed. Feature naming, ordering, and descriptions drift across cycles, causing wasted cycles and unpredictable behavior. This is the most frequent failure mode.

**Independent Test**: Run the autonomous loop for 3+ cycles on a multi-feature project. Verify that feature selection follows a fixed, predictable order and never drifts.

**Acceptance Scenarios**:

1. **Given** a clarified project plan with N features, **When** the autonomous loop starts for the first time, **Then** a feature manifest is extracted containing all N features in the exact order they appear in the plan, each with a rich description including user stories, acceptance criteria, and scope constraints.
2. **Given** an existing feature manifest, **When** a new cycle begins, **Then** the next feature is selected deterministically (first pending entry) without invoking an LLM — near-zero cost and instant selection.
3. **Given** the first feature is completed, **When** the next cycle starts, **Then** the second feature is selected (not the first again, and not a randomly different feature).
4. **Given** a manifest already exists from a prior run, **When** the loop restarts, **Then** the existing manifest is reused without re-extraction.

---

### User Story 2 - Machine-Readable Verification Results (Priority: P1)

After each feature implementation, the verification stage produces structured pass/fail results that the orchestrator can act on. When blocking failures are found, the system automatically attempts a targeted fix and re-verifies within the same cycle.

**Why this priority**: Currently the verify stage produces a plain-text report that the orchestrator ignores entirely. The loop always proceeds regardless of verification outcome — it cannot self-correct within a cycle. This means verification failures waste an entire cycle before they can be addressed.

**Independent Test**: Implement a feature with a known defect. Verify that the verification stage detects the failure, triggers a fix attempt, and re-verifies — all within a single cycle.

**Acceptance Scenarios**:

1. **Given** a completed implementation that passes all acceptance criteria, **When** verification runs, **Then** the result indicates overall pass with no blocking failures.
2. **Given** a completed implementation with a build error, **When** verification runs, **Then** the result indicates failure with `buildSucceeded: false` and a blocking failure entry describing the build error.
3. **Given** a verification result with blocking failures, **When** the orchestrator receives the result, **Then** it spawns a targeted fix agent with the specific failure descriptions, then re-verifies.
4. **Given** a re-verification that still fails, **When** the maximum fix attempts are exhausted, **Then** the system proceeds to the learnings stage and defers the fix to the next cycle (no infinite loops).
5. **Given** a verification where the agent fails to produce structured output, **When** the orchestrator receives a null result, **Then** it conservatively treats the feature as not-passed (never marks a feature complete without confirmed verification).

---

### User Story 3 - Correct Specify Prompt Format (Priority: P2)

The orchestrator passes feature descriptions to the specify stage in the correct format expected by the speckit skill. The specify agent creates the spec in the expected location every time.

**Why this priority**: A prompt format mismatch caused the specify agent to create specs in the wrong directory, which cascaded into the orchestrator throwing "no new spec directory was created" and terminating the cycle. This is a discrete bug with a clear fix.

**Independent Test**: Run the specify stage for a feature and verify the spec is created under the standard `specs/` directory with the correct naming convention.

**Acceptance Scenarios**:

1. **Given** a feature with title "Product Catalog" and a rich description, **When** the specify stage runs, **Then** the speckit skill receives the description as plain-text arguments (not structured fields) and creates `specs/NNN-<name>/spec.md`.
2. **Given** a feature manifest entry, **When** specify completes and creates a spec directory, **Then** the manifest entry is updated with the resolved `specDir` path, linking the manifest to the artifact tracking system.

---

### User Story 4 - Structured Learnings Collection (Priority: P3)

After each cycle, the learnings stage produces typed, categorized insights that are machine-appendable to a learnings file. Duplicate insights are automatically detected and suppressed. The file size is bounded to prevent unbounded growth.

**Why this priority**: Learnings are non-critical — losing one cycle's insights is acceptable. However, structured learnings enable deduplication and categorization, improving the signal-to-noise ratio of accumulated knowledge across many cycles.

**Independent Test**: Run 5+ cycles and verify the learnings file contains categorized, deduplicated entries without unbounded growth.

**Acceptance Scenarios**:

1. **Given** a cycle completes, **When** the learnings stage runs, **Then** insights are returned as typed entries with category, insight text, and context.
2. **Given** the learnings file already contains "Use --legacy-peer-deps for install", **When** a new cycle produces "use --legacy-peer-deps for install" (different casing), **Then** the duplicate is detected and not appended.
3. **Given** a category has reached its maximum entry cap, **When** a new insight arrives for that category, **Then** the oldest entry in that category is dropped to make room.
4. **Given** the learnings agent fails to produce structured output, **When** the orchestrator receives a null result, **Then** it skips the append (no-op) and logs a warning — the cycle is not interrupted.

---

### User Story 5 - Manifest Source Drift Detection (Priority: P3)

When the project plan changes after the manifest was created, the system warns the user but does not automatically regenerate the manifest (which could discard in-progress feature state).

**Why this priority**: Edge case — users may edit the plan mid-run. The conservative approach avoids data loss while still informing the user.

**Independent Test**: Modify the clarified plan file between runs and verify the system emits a drift warning but continues using the existing manifest.

**Acceptance Scenarios**:

1. **Given** a manifest was created from plan version A, **When** the plan is modified to version B and the loop restarts, **Then** the system logs a warning and emits a drift detection event but continues with the existing manifest.
2. **Given** the user wants to force re-extraction, **When** they delete the manifest file and restart the loop, **Then** a new manifest is extracted from the current plan.

---

### User Story 6 - Structured Synthesis Confirmation (Priority: P3)

After the clarification synthesis stage, the agent confirms which files were produced via structured output instead of the orchestrator probing the filesystem.

**Why this priority**: Low-cost reliability improvement. The filesystem probing approach is fragile — explicit confirmation from the agent is more reliable.

**Independent Test**: Run the clarification synthesis stage and verify the orchestrator reads the file paths from structured output rather than filesystem scanning.

**Acceptance Scenarios**:

1. **Given** the synthesis stage completes, **When** the result is returned, **Then** it includes the list of files produced and the path to the clarified goal file.
2. **Given** the synthesis agent fails to produce structured output, **When** the orchestrator receives a null result, **Then** it falls back to filesystem probing (existing behavior preserved).

---

### Edge Cases

- What happens when manifest extraction fails on both retry attempts? The run aborts with a clear error message directing the user to check the plan format.
- What happens when an active feature has no `specDir` yet (started but specify hasn't completed)? The orchestrator re-runs specify for that feature.
- What happens if the orchestrator crashes between updating the manifest and the state file? Crash recovery reconciliation restores consistency — manifest is source of truth for selection, state file is source of truth for phase progress.
- What happens when a feature evaluation (RESUME vs REPLAN) returns null structured output? The stage throws — the decision is binary with no safe default.
- What happens when the same feature name produces different spec directory names across runs? The manifest stores the resolved `specDir` after specify, so it's tracked explicitly — no fuzzy matching needed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extract a feature manifest from the clarified project plan as a one-time operation after clarification completes, containing all features in priority order with rich descriptions.
- **FR-002**: System MUST select the next feature deterministically from the manifest (first `pending` entry) without requiring an LLM call.
- **FR-003**: System MUST support structured output schemas on agent stages, passing them to the agent SDK and capturing the parsed result.
- **FR-004**: System MUST handle structured output validation failures (max retries exceeded) by throwing with a clear error message.
- **FR-005**: System MUST implement per-stage null fallback policies: manifest extraction and gap analysis throw; verify treats as not-passed; learnings no-ops.
- **FR-006**: System MUST produce structured verification results including overall pass/fail, build status, test status, categorized failures with severity, and a summary.
- **FR-007**: System MUST attempt targeted fixes for blocking verification failures and re-verify, bounded by a configurable maximum retry count per cycle.
- **FR-008**: System MUST pass feature descriptions to the specify stage as plain-text arguments in the format expected by the speckit skill.
- **FR-009**: System MUST update the manifest entry with the resolved `specDir` after specify completes successfully.
- **FR-010**: System MUST produce structured learnings with category, insight, and context fields, deduplicated on append with per-category entry caps.
- **FR-011**: System MUST detect source drift (plan file changed since manifest creation) and warn without auto-regenerating.
- **FR-012**: System MUST retry manifest extraction once on failure before aborting the run.
- **FR-013**: System MUST update feature status in both the manifest (coarse: pending/active/completed/skipped) and the artifact tracking system (fine-grained: specifying/planning/implementing/verifying/completed/skipped) at each lifecycle transition.
- **FR-014**: System MUST maintain crash consistency between the manifest and the state file by writing both in the same checkpoint operation.
- **FR-015**: System MUST produce structured synthesis confirmation with file paths, falling back to filesystem probing if unavailable.
- **FR-016**: System MUST remove the legacy regex-based gap analysis parsing — the old code path is eliminated, not maintained alongside the new approach.

### Key Entities

- **Feature Manifest**: An ordered list of features extracted from the project plan. Stores feature id, title, rich description, coarse status (pending/active/completed/skipped), and a link to the spec directory. Created once, updated at lifecycle transitions. Lives alongside the state file.
- **Feature Manifest Entry**: A single feature within the manifest. Tracks selection state and links to the artifact system via `specDir`.
- **Verification Result**: Structured output from the verify stage. Contains pass/fail boolean, build/test status booleans, a list of typed failures with severity classification, and a summary.
- **Learning Insight**: A categorized, one-line actionable insight with context. Categories: build, testing, api, architecture, tooling, workaround.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Feature selection is 100% deterministic — running the same project plan twice produces the identical feature order with identical descriptions.
- **SC-002**: Feature selection for NEXT_FEATURE incurs zero LLM cost (pure manifest lookup).
- **SC-003**: The specify stage creates spec files in the correct location on every invocation (zero misrouted specs).
- **SC-004**: Verification failures with blocking severity trigger at least one automated fix-reverify cycle within the same loop cycle.
- **SC-005**: No duplicate learnings entries accumulate across 10+ cycles on the same project.
- **SC-006**: Manifest extraction failure after 2 attempts produces a clear, actionable error message and halts gracefully (no partial state left behind).
- **SC-007**: The system recovers to a consistent state after a simulated crash between manifest and state file updates.
- **SC-008**: After a plan file modification, the system warns about drift within the first 30 seconds of the next run.

## Assumptions

- The agent SDK version supporting `outputFormat` and `structured_output` (v0.1.45+) is available and installable. This is a hard prerequisite — the entire feature depends on it.
- The clarified project plan contains a feature priority table with numbered features, titles, and descriptions. The manifest extraction prompt is designed for this format.
- Only one feature is active at a time — the orchestrator processes features sequentially, not in parallel.
- The speckit skill (`/speckit-specify`) is an external dependency whose input format (plain-text `$ARGUMENTS`) and output format (filesystem artifacts) are stable and will not change.
- The learnings file format is plain text (Markdown). Deduplication uses normalized string matching, which is sufficient for catching the most common rephrasing patterns without requiring embeddings.
- No concurrent Dex orchestrator instances run against the same project directory — the manifest file has no locking mechanism.
