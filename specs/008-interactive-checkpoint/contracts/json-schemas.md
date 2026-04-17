# Contract: On-disk JSON schemas and commit message format

Authoritative shapes for every file introduced or modified by this feature. Consumers: the core module, IPC handlers, dev CLI scripts, and (for commit messages) any terminal `git log` query.

---

## 1. Variant group state file

**Path**: `<projectDir>/.dex/variant-groups/<groupId>.json`
**Gitignored**: yes (added to `.gitignore` at project init in P3 and by the orchestrator on first write if missing).
**Writer**: single writer per project, guarded by `.dex/state.lock`. Atomic write via `tmp` + `rename`.

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "variant-group.schema.json",
  "type": "object",
  "required": [
    "groupId", "fromCheckpoint", "stage", "parallel", "createdAt",
    "variants", "resolved"
  ],
  "additionalProperties": false,
  "properties": {
    "groupId": {
      "type": "string",
      "description": "UUID; matches filename stem."
    },
    "fromCheckpoint": {
      "type": "string",
      "pattern": "^checkpoint/",
      "description": "Tag name of the fork point."
    },
    "stage": {
      "type": "string",
      "enum": [
        "prerequisites",
        "clarification_product", "clarification_technical", "clarification_synthesis",
        "constitution", "manifest_extraction",
        "gap_analysis", "specify", "plan", "tasks",
        "implement", "implement_fix", "verify", "learnings"
      ]
    },
    "parallel": {
      "type": "boolean",
      "description": "Mirror of isParallelizable(stage) at spawn time."
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "variants": {
      "type": "array",
      "minItems": 2,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["letter", "branch", "worktree", "status", "runId", "candidateSha", "errorMessage"],
        "additionalProperties": false,
        "properties": {
          "letter": { "type": "string", "pattern": "^[a-e]$" },
          "branch": { "type": "string", "pattern": "^attempt-" },
          "worktree": {
            "oneOf": [
              { "type": "null" },
              { "type": "string", "description": "Path relative to projectDir, e.g. .dex/worktrees/attempt-20260417T182301-a" }
            ]
          },
          "status": {
            "type": "string",
            "enum": ["pending", "running", "completed", "failed"]
          },
          "runId": {
            "oneOf": [
              { "type": "null" },
              { "type": "string" }
            ],
            "description": "Filled in when variant begins running."
          },
          "candidateSha": {
            "oneOf": [
              { "type": "null" },
              { "type": "string", "pattern": "^[a-f0-9]{40}$" }
            ],
            "description": "Filled in on variant completion."
          },
          "errorMessage": {
            "oneOf": [
              { "type": "null" },
              { "type": "string" }
            ]
          }
        }
      }
    },
    "resolved": {
      "type": "object",
      "required": ["kind", "pickedLetter", "resolvedAt"],
      "additionalProperties": false,
      "properties": {
        "kind": {
          "oneOf": [
            { "type": "null" },
            { "type": "string", "enum": ["keep", "discard"] }
          ]
        },
        "pickedLetter": {
          "oneOf": [
            { "type": "null" },
            { "type": "string", "pattern": "^[a-e]$" }
          ]
        },
        "resolvedAt": {
          "oneOf": [
            { "type": "null" },
            { "type": "string", "format": "date-time" }
          ]
        }
      }
    }
  }
}
```

### Invariants

- `kind === "keep"` ⇒ `pickedLetter !== null` and `resolvedAt !== null` and the picked variant's `status === "completed"`.
- `kind === "discard"` ⇒ `pickedLetter === null` and `resolvedAt !== null`.
- `kind === null` ⇒ the group is still open (file is live and watched by the resume flow).
- `parallel === true` ⇒ every variant's `worktree !== null`.
- `parallel === false` ⇒ every variant's `worktree === null`.

### Example (3-way parallel `plan` fan-out, mid-run)

```json
{
  "groupId": "3d0f7b62-6b01-4f6e-92e4-63a9e2d6c0b4",
  "fromCheckpoint": "checkpoint/cycle-1-after-tasks",
  "stage": "plan",
  "parallel": true,
  "createdAt": "2026-04-17T18:23:01.000Z",
  "variants": [
    {
      "letter": "a",
      "branch": "attempt-20260417T182301-a",
      "worktree": ".dex/worktrees/attempt-20260417T182301-a",
      "status": "running",
      "runId": "01HX9K2W1PJ3S3F3Q3J3J3J3J3",
      "candidateSha": null,
      "errorMessage": null
    },
    {
      "letter": "b",
      "branch": "attempt-20260417T182301-b",
      "worktree": ".dex/worktrees/attempt-20260417T182301-b",
      "status": "running",
      "runId": "01HX9K2W2TQK7X6X6X6X6X6X6X",
      "candidateSha": null,
      "errorMessage": null
    },
    {
      "letter": "c",
      "branch": "attempt-20260417T182301-c",
      "worktree": ".dex/worktrees/attempt-20260417T182301-c",
      "status": "pending",
      "runId": null,
      "candidateSha": null,
      "errorMessage": null
    }
  ],
  "resolved": {
    "kind": null,
    "pickedLetter": null,
    "resolvedAt": null
  }
}
```

---

## 2. PhaseRecord additions (extends feature 007)

**Path**: `<projectDir>/.dex/runs/<runId>.json` — shape owned by feature 007 (`contracts/json-schemas.md` in that spec). This feature adds two optional fields per phase record.

```ts
interface PhaseRecord {
  // … existing 007 fields

  checkpointTag?: string;      // e.g. "checkpoint/cycle-1-after-plan"
  candidateSha?: string;       // 40-hex SHA
}
```

### JSON Schema delta

Add to the `phases.items.properties` object in the existing 007 `runs.schema.json`:

```json
"checkpointTag": {
  "type": "string",
  "pattern": "^checkpoint/"
},
"candidateSha": {
  "type": "string",
  "pattern": "^[a-f0-9]{40}$"
}
```

Both optional — pre-008 records are valid without them.

### Writer

`completePhase(projectDir, runId, phaseTraceId, { ..., checkpointTag, candidateSha })` in `runs.ts` — single call site in `orchestrator.ts` after `commitCheckpoint`.

### Reader

Used by `checkpoints:estimateVariantCost` — reads `checkpointTag` for historical cross-reference, and by the DEBUG badge / NodeDetailPanel for quick lookups.

---

## 3. Structured commit message

**Every commit made by `commitCheckpoint`** uses this exact two-line format:

```
dex: <stage> completed [cycle:<N>] [feature:<slug>] [cost:$<amount>]
[checkpoint:<stage>:<cycle>]
```

### Field grammar

| Field | Pattern | Example |
|---|---|---|
| `<stage>` | `prerequisites` / `clarification_product` / … (raw LoopStageType, underscores retained) | `plan` |
| `<N>` | non-negative integer | `1` |
| `<slug>` | kebab-case feature slug, or `-` if absent | `cart` or `-` |
| `<amount>` | dollars with two decimal places | `0.42` |
| Second line | fixed prefix `[checkpoint:` + stage + `:` + cycle + `]` | `[checkpoint:plan:1]` |

### Regex (for parsers)

```ts
export const CHECKPOINT_MESSAGE_REGEX =
  /^dex: (\w+) completed \[cycle:(\d+)\] \[feature:([\w-]+|-)\] \[cost:\$(\d+\.\d{2})\]\n\[checkpoint:(\w+):(\d+)\]/;
```

Groups: `[stage, cycle, featureSlug, cost, stage (repeat), cycle (repeat)]`.

### Example

```
dex: plan completed [cycle:1] [feature:cart] [cost:$0.42]
[checkpoint:plan:1]
```

### Exports

```ts
// src/core/git.ts
export const CHECKPOINT_MESSAGE_PREFIX = "[checkpoint:";
```

### Consumers

- `git log --all --grep='^\[checkpoint:'` — power-user terminal workflow (FR-041, SC-010). Documented in `.claude/rules/06-testing.md` § 4c.
- `listTimeline` — uses the regex to parse candidates that are committed but not yet tagged.
- Any future CLI tooling.

---

## 4. `.gitignore` additions (per project on init)

Appended by `checkpoints:initRepo` (first `git init`) and by the orchestrator on first post-upgrade launch for existing repos (P3):

```gitignore
# Dex runtime cache — local only, never committed
.dex/state.json
.dex/state.lock
.dex/variant-groups/
.dex/worktrees/
```

For existing repos with a previously-committed `.dex/state.json`, a silent `git rm --cached .dex/state.json` runs once (P3). No warning shown.

Files explicitly **kept in version control** (no ignore entries):
- `.dex/feature-manifest.json`
- `.dex/learnings.md`
- `.dex/runs/` (default; teams opt-in to ignoring by adding their own entry per `.claude/rules/06-testing.md` § 4f.3).

---

## Test coverage for this contract

| File | Test | Location |
|---|---|---|
| Variant group schema | Write → re-read → deep equal | `src/main/ipc/__tests__/checkpoints.ipc.test.ts` |
| Variant group schema | Invalid `letter` pattern rejected | same |
| Variant group schema | Invalid `worktree` vs `parallel` invariant detected | same |
| PhaseRecord additions | Writing `checkpointTag` + `candidateSha` round-trips through `runs.ts` helpers | `src/core/__tests__/runs.test.ts` (extend existing 007 tests) |
| Commit message | `commitCheckpoint` produces a message matching `CHECKPOINT_MESSAGE_REGEX` | `src/core/__tests__/git.test.ts` |
| Commit message | Message parses back into the exact inputs | same |
| `.gitignore` additions | `initRepo` on fresh dir produces a `.gitignore` with the four lines | `src/main/ipc/__tests__/checkpoints.ipc.test.ts` |
| `.gitignore` additions | Existing repo with committed `state.json` → `git rm --cached` runs once | `src/main/__tests__/index.startup.test.ts` |
