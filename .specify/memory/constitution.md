<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: N/A (initial ratification)
- Added sections: Core Principles (5), Technology Constraints,
  Development Workflow, Governance
- Removed sections: N/A
- Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ aligned
    (Constitution Check section present, gates derived from principles)
  - .specify/templates/spec-template.md — ✅ aligned
    (user stories, requirements, success criteria match workflow)
  - .specify/templates/tasks-template.md — ✅ aligned
    (phased structure, parallel markers, checkpoint gates)
- Follow-up TODOs: none
-->

# Ralph Claude Constitution

## Core Principles

### I. Clean-Context Orchestration

Ralph Claude spawns a fresh Claude Code instance for each phase
of spec-kit work. Every agent starts with a clean context window
to prevent token bloat and context drift.

- Each orchestrator phase MUST run in its own `query()` call
  via `@anthropic-ai/claude-agent-sdk`.
- No agent instance may carry conversational state from a
  previous phase — context is provided solely through spec-kit
  artifacts on disk.
- Hook callbacks (PreToolUse, PostToolUse, SubagentStart,
  SubagentStop) MUST capture step data for the UI trace without
  leaking into subsequent agent contexts.

### II. Platform-Agnostic Core

The orchestration engine (`src/core/`) MUST remain free of
Electron or renderer imports. It is pure Node.js and can be
tested standalone.

- `src/core/` MUST NOT import from `electron`, `src/main/`,
  or `src/renderer/`.
- All Electron integration flows through IPC handlers in
  `src/main/ipc/` and the preload bridge.
- This boundary enables unit-testing the orchestrator without
  an Electron harness and keeps the engine portable.

### III. Test Before Report (NON-NEGOTIABLE)

Every code change MUST be verified before completion is
reported. No exceptions.

- Define a Definition of Done checklist before testing.
- UI/renderer changes: verify via MCP chrome-devtools tools.
- Core engine changes: `npx tsc --noEmit` + unit tests +
  UI verification if behavior-affecting.
- IPC/main process changes: verify app starts, test IPC
  round-trips via `window.ralphAPI.*`.
- If a test fails: fix, retest, repeat. Escalate to the user
  only after investigation.

### IV. Simplicity First

Write the simplest code that satisfies the requirement.
Complexity MUST be justified.

- KISS, DRY, YAGNI, SOLID as governing heuristics.
- Functions < 20 lines ideally, < 100 lines max.
- No speculative abstractions, feature flags, or
  backwards-compatibility shims.
- No commented-out code, no TODO comments, no dead imports.
- Prefer composition over inheritance.
- Three similar lines are better than a premature abstraction.

### V. Mandatory Workflow

All work that produces code changes MUST follow this sequence:
Understand → Plan → Implement → Test → Report.

- **Understand**: read relevant code, reproduce bugs,
  identify impacted areas before acting.
- **Plan**: present approach for non-trivial changes, iterate
  with the user, proceed only after approval.
- **Implement**: write clean code from the start; refactor
  continuously; remove dead code immediately.
- **Test**: execute the verification protocol from Principle III.
- **Report**: short summary of what was done, what was tested,
  and what was observed.
- Trivial changes (typo, one-line fix, config tweak) may skip
  the Plan step but MUST still test.

## Technology Constraints

- **Runtime**: Electron (frameless BrowserWindow, custom title
  bar) with Vite for renderer bundling.
- **Language**: TypeScript with strict mode throughout.
- **Frontend**: React 18, local state only (useState/useEffect),
  CSS Custom Properties (Catppuccin dark theme), GSAP for
  animations, Lucide React for icons. No Tailwind, no CSS
  frameworks, no Redux/Zustand, no React Router.
- **Orchestration**: `@anthropic-ai/claude-agent-sdk` —
  `query()` async generator with hook callbacks.
- **IPC**: `ipcMain.handle` for request-response,
  `webContents.send` for event streaming,
  `contextBridge.exposeInMainWorld("ralphAPI", ...)` in preload.
- **Scripts**: TypeScript/Node.js by default; shell scripts
  only for trivial one-liners.
- No git commits unless the user explicitly requests them.

## Development Workflow

1. The user runs `dev-setup.sh` manually — agents MUST NOT
   start the dev server.
2. Process logs are at `/tmp/ralph-claude-logs/` (`vite.log`,
   `electron.log`). Read these when debugging.
3. MCP server `electron-chrome` on CDP port 9333 is the
   primary verification tool for UI changes.
4. Communication assumes 20+ years of engineering experience:
   be direct, technical, focus on "why" over "what", highlight
   tradeoffs.

## Governance

This constitution is the highest-authority document for
Ralph Claude development. Where it conflicts with other
guidance, the constitution prevails.

- **Amendments** require: (1) a documented rationale,
  (2) user approval, (3) a version bump per semver rules
  (MAJOR for principle removals/redefinitions, MINOR for
  additions/expansions, PATCH for clarifications).
- **Compliance review**: every plan and spec MUST include a
  Constitution Check gate verifying alignment with the
  principles above.
- Runtime development guidance lives in `.claude/CLAUDE.md`
  and `.claude/rules/`. These files elaborate on the
  principles here but MUST NOT contradict them.

**Version**: 1.0.0 | **Ratified**: 2026-04-15 | **Last Amended**: 2026-04-15
