# Specification Quality Checklist: Cleanup — Retire Variant-Groups Verbs and Step Candidate Prompt

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-29
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

> Note on "no implementation details": this is a code-deletion feature whose entire user-visible payoff is the removal of specific UI affordances (right-click menu, modal). File paths and symbol names appear in FRs because they *are* the deliverable — there is no separable "what" from "which files". The spec keeps language-agnostic where possible; concrete paths are unavoidable.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

> Note on "technology-agnostic SC": SC-005, SC-006, SC-007 cite specific commands (`grep`, `tsc`, `vitest`, `git branch --list`). They are kept as commands because they are the only verifiable form of the underlying outcome ("removed code stays removed", "build passes", "no new attempt-branches mint"). Wrapping them in prose would make them less testable, not more agnostic.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Two intentional decisions are recorded inline in the spec rather than as clarifications:
  1. **`.gitignore` seed for `.dex/variant-groups/` and `.dex/worktrees/`** — keep as forward-compat reservations. Recorded under Edge Cases and Assumptions.
  2. **`WORKTREE_LOCKED` error code** — drop unless grep surfaces a non-variant caller. Recorded as FR-011 with the exact verification command.
- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`.
