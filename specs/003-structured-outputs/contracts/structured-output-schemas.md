# Structured Output Schemas

Internal contracts for JSON schemas passed to the Agent SDK's `outputFormat` parameter. Each schema constrains the **final response** of a specific stage.

## MANIFEST_SCHEMA

Used by: `manifest_extraction` stage (one-time, after clarification)

```json
{
  "type": "object",
  "properties": {
    "features": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "number", "description": "Feature number from the priority table (1, 2, 3...)" },
          "title": { "type": "string", "description": "Feature name from the priority table" },
          "description": { "type": "string", "description": "Rich description including user stories, acceptance criteria, relevant data model entities, and scope constraints" }
        },
        "required": ["id", "title", "description"],
        "additionalProperties": false
      }
    }
  },
  "required": ["features"],
  "additionalProperties": false
}
```

## GAP_ANALYSIS_SCHEMA

Used by: `gap_analysis` stage (RESUME/REPLAN evaluation only — NEXT_FEATURE is deterministic)

```json
{
  "type": "object",
  "properties": {
    "decision": {
      "type": "string",
      "enum": ["RESUME_FEATURE", "REPLAN_FEATURE"]
    },
    "reason": { "type": "string" }
  },
  "required": ["decision", "reason"],
  "additionalProperties": false
}
```

## VERIFY_SCHEMA

Used by: `verify` stage (after implementation)

```json
{
  "type": "object",
  "properties": {
    "passed": {
      "type": "boolean",
      "description": "true if ALL acceptance criteria pass and build/tests succeed"
    },
    "buildSucceeded": {
      "type": "boolean",
      "description": "true if the project compiles without errors"
    },
    "testsSucceeded": {
      "type": "boolean",
      "description": "true if all tests pass (or no tests exist)"
    },
    "failures": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "criterion": { "type": "string", "description": "The acceptance criterion or check that failed" },
          "description": { "type": "string", "description": "What went wrong and what was expected" },
          "severity": { "type": "string", "enum": ["blocking", "minor"] }
        },
        "required": ["criterion", "description", "severity"],
        "additionalProperties": false
      }
    },
    "summary": {
      "type": "string",
      "description": "One-paragraph summary of verification results"
    }
  },
  "required": ["passed", "buildSucceeded", "testsSucceeded", "failures", "summary"],
  "additionalProperties": false
}
```

## LEARNINGS_SCHEMA

Used by: `learnings` stage (after verification)

```json
{
  "type": "object",
  "properties": {
    "insights": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": {
            "type": "string",
            "enum": ["build", "testing", "api", "architecture", "tooling", "workaround"]
          },
          "insight": { "type": "string", "description": "One-line actionable insight" },
          "context": { "type": "string", "description": "Brief context for when this applies" }
        },
        "required": ["category", "insight", "context"],
        "additionalProperties": false
      }
    }
  },
  "required": ["insights"],
  "additionalProperties": false
}
```

## SYNTHESIS_SCHEMA

Used by: `clarification_synthesis` stage (after clarification)

```json
{
  "type": "object",
  "properties": {
    "filesProduced": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Relative paths of files created or updated during synthesis"
    },
    "goalClarifiedPath": {
      "type": "string",
      "description": "Relative path to the clarified goal file"
    }
  },
  "required": ["filesProduced", "goalClarifiedPath"],
  "additionalProperties": false
}
```

## Null Fallback Contract

When `outputFormat` is provided but `structured_output` is null in the result:

| Schema | Behavior | Owner |
|--------|----------|-------|
| MANIFEST_SCHEMA | Throw (enters retry loop) | Orchestrator manifest extraction block |
| GAP_ANALYSIS_SCHEMA | Throw | Orchestrator gap analysis block |
| VERIFY_SCHEMA | Treat as `{ passed: false, buildSucceeded: false, testsSucceeded: false, failures: [{...}], summary: "..." }` | Orchestrator verify block |
| LEARNINGS_SCHEMA | No-op (skip append, log warning) | Orchestrator learnings block |
| SYNTHESIS_SCHEMA | Fall back to filesystem probing | Orchestrator synthesis block |
