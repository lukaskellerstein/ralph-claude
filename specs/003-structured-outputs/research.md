# Research: Structured Outputs for Agent Boundaries

## R1: Claude Agent SDK Structured Outputs API

**Decision**: Use `outputFormat: { type: "json_schema", schema: {...} }` in `query()` options; read `message.structured_output` from result messages.

**Rationale**: The SDK (v0.1.45+) natively supports JSON schema–constrained final responses. The agent uses tools normally for its work; only the final response is schema-constrained. This is the exact pattern needed — agents do work AND return machine-readable results.

**Key API surface**:
- `query()` option: `outputFormat?: { type: "json_schema"; schema: Record<string, unknown> }`
- Result message: `structured_output?: unknown` (parsed JSON matching the schema)
- Error subtype: `error_max_structured_output_retries` when schema validation fails after max internal retries
- Runtime: SDK converts schema to `--json-schema` CLI arg

**Alternatives considered**:
- **Post-hoc parsing with regex**: Current approach. Fragile — any deviation in agent output format causes hard failure. Eliminated.
- **Tool-use for structured output**: Agent calls a "report" tool with typed args. Rejected — adds tool-call overhead and doesn't guarantee the tool is called exactly once.
- **Custom JSON extraction from raw text**: Parse JSON blocks from agent output. Rejected — brittle, no schema validation, agents may produce invalid JSON.

## R2: SDK Version Upgrade Path

**Decision**: Upgrade `@anthropic-ai/claude-agent-sdk` from `^0.1.0` to `^0.1.45`.

**Rationale**: `outputFormat` parameter and `structured_output` on result messages are only available in v0.1.45+. The `^0.1.0` range already allows this version, but we pin the minimum to ensure the types exist.

**Risk assessment**:
- The SDK follows semver pre-1.0 conventions (minor = breaking). The `^0.1.0` range already permits any 0.1.x version, so existing code is implicitly accepting API churn.
- Key interfaces used by Dex (`query()`, `Message`, hook callbacks) are stable across the 0.1.x range based on the design doc's analysis of the SDK source.
- `structured_output` is additive — existing code ignores it if not requested.

**Alternatives considered**:
- Pin exact version (`0.1.45`): Too restrictive — blocks patch fixes.
- Pin `>=0.1.45 <0.2.0`: Equivalent to `^0.1.45`. Preferred for clarity — use caret notation.

## R3: Feature Manifest Design

**Decision**: Flat JSON array in `.dex/feature-manifest.json` with coarse status (pending/active/completed/skipped), separate from existing `ArtifactManifest` in `state.json`.

**Rationale**: Two tracking systems serve different purposes:
- **FeatureManifest** (new): Feature *selection and ordering* — what to build next. Read-only after initial extraction (status updates only).
- **ArtifactManifest** (existing): Feature *artifact tracking* — what files exist and their integrity. Updated continuously.

Merging them would conflate selection with progress tracking, making the state machine harder to reason about.

**Key design choices**:
- `specDir: string | null` — null at extraction time, populated after specify. This links manifest entries to `ArtifactManifest.features[specDir]` without fragile fuzzy matching.
- `sourceHash` — SHA-256 of GOAL_clarified.md at creation time. Detects plan drift without auto-regenerating (conservative — avoids discarding in-progress state).
- Coarse status only (pending/active/completed/skipped). Fine-grained phase status (specifying/planning/etc.) lives in `ArtifactManifest`.

**Alternatives considered**:
- Extend `ArtifactManifest` with ordering info: Rejected — conflates concerns, makes crash recovery harder.
- Store manifest in SQLite: Rejected — overkill for a flat ordered list. JSON file is simpler, debuggable, and consistent with `state.json`.
- Auto-regenerate on drift: Rejected — could discard in-progress feature state. User must delete manifest to force re-extraction.

## R4: Null Structured Output Fallback Policies

**Decision**: Per-stage fallback policies based on criticality.

**Rationale**: When `outputFormat` is provided but `structured_output` comes back null (no SDK error, but no parsed JSON), the correct behavior depends on the stage:

| Stage | Null fallback | Rationale |
|-------|---------------|-----------|
| `manifest_extraction` | **Throw** (retry loop) | Cannot proceed without a manifest |
| `gap_analysis` (RESUME/REPLAN) | **Throw** | Decision is binary; no safe default |
| `verify` | **Treat as not-passed** | Conservative: unknown verification = unsafe to mark complete |
| `learnings` | **No-op** (skip, log warning) | Non-critical; losing one cycle's insights is acceptable |
| `clarification_synthesis` | **Fall back to filesystem probing** | Graceful degradation to existing behavior |

`runStage` always returns `structuredOutput: null` on fallback — the **caller** implements the policy. This keeps `runStage` generic.

## R5: Learnings Deduplication Strategy

**Decision**: Normalized string matching on the `insight` field — case-insensitive, trimmed, whitespace collapsed, leading common verbs stripped.

**Rationale**: Catches the most common rephrasing patterns (capitalization, extra spaces, "Run X" vs "run X") without requiring embeddings or external dependencies. Deterministic and zero-dependency.

**Per-category cap**: 20 entries per category (configurable via `maxLearningsPerCategory`). When exceeded, oldest entries in that category are dropped. Bounds the file to ~120 entries max (6 categories × 20).

**Alternatives considered**:
- Exact match: Too loose — "Use X" and "use X" treated as different.
- Embedding-based similarity: Overkill — requires external model call, adds latency and cost.
- No dedup (append only): Unbounded growth over many cycles.

## R6: Crash Consistency Between Manifest and State

**Decision**: Write both `.dex/feature-manifest.json` and `.dex/state.json` in the same `commitCheckpoint()` call. Add manifest reconciliation to crash recovery.

**Rationale**: A crash between writing one file and the other creates divergence. Writing both in sequence (tmp+rename for each) minimizes the window. If they still disagree after a crash:
- Manifest is source of truth for **selection** (what's next)
- `FeatureArtifacts` is source of truth for **phase progress** (which stage within a feature)

Reconciliation on startup: if manifest says "active" but no `FeatureArtifacts` entry exists, create one with `status: "specifying"`. If manifest says "completed" but `FeatureArtifacts.status` is not "completed", update it.

**Alternatives considered**:
- Single file: Rejected — manifest and state serve different purposes with different update frequencies.
- Transaction log / WAL: Overkill for two JSON files updated at lifecycle transitions.
- Ignore divergence: Rejected — could cause repeated work or skipped features.
