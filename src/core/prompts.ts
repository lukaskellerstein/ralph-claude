import type { RunConfig, Phase } from "./types.js";

// ── T005: Clarification Prompt (Phase A) ──

export function buildClarificationPrompt(description: string): string {
  return `You are conducting an interactive clarification session for a software project. Your goal is to fully understand what needs to be built, then produce a comprehensive plan document.

## Project Description

${description}

## Your Task

Ask the user clarifying questions using the AskUserQuestion tool until you have enough information to produce a complete plan. Cover these areas:

1. **User Stories**: Who are the users? What are the primary workflows?
2. **Functional Requirements**: What features are needed? What are the acceptance criteria?
3. **Technology Stack**: Languages, frameworks, versions, deployment target
4. **Data Model**: Key entities and relationships
5. **Build/Test/Dev Commands**: How to build, test, and run the project
6. **Testing Strategy**: Unit tests, integration tests, e2e approach
7. **Non-Functional Requirements**: Performance, scalability, security constraints
8. **Scope Boundaries**: What is explicitly out of scope?

## Completeness Checklist

Before writing the plan, verify you have answers for ALL of these:
- [ ] User stories with acceptance criteria per major feature
- [ ] Technology stack with specific versions
- [ ] Build, test, and dev commands
- [ ] Deployment target (local, cloud, platform)
- [ ] Testing strategy (unit, integration, e2e)
- [ ] Data model overview (key entities)

## Output

When you have sufficient information, write the complete plan to \`.specify/full_plan.md\` using the Write tool. The file must include all checklist items as structured markdown sections.

After writing the file, output the absolute path to full_plan.md as the final line of your response.`;
}

// ── T006: Gap Analysis Prompt ──

export function buildGapAnalysisPrompt(
  config: RunConfig,
  fullPlanPath: string,
  existingSpecs: string[]
): string {
  const specList = existingSpecs.length > 0
    ? existingSpecs.map((s) => `  - ${s}`).join("\n")
    : "  (none yet)";

  return `You are a gap analysis agent for the Ralph autonomous loop. Your job is to compare the full project plan against existing feature specifications and determine what to do next.

## Instructions

1. Read the full plan at: ${fullPlanPath}
2. Review each existing spec directory listed below for completeness (check for spec.md, plan.md, tasks.md, and implementation status)
3. Determine the next action

## Existing Spec Directories

${specList}

## Project Directory

${config.projectDir}

## Decision Rules

- If a feature in the full plan has NO corresponding spec directory: output \`NEXT_FEATURE: {feature_name} | {one-line description}\`
- If a feature has a spec directory with tasks.md but incomplete implementation: output \`RESUME_FEATURE: {spec_dir_relative_path}\`
- If a feature's implementation has failed and needs re-planning: output \`REPLAN_FEATURE: {spec_dir_relative_path}\`
- If ALL features in the full plan have been implemented and verified: output \`GAPS_COMPLETE\`

## Scope Constraints

- Only consider features explicitly described in full_plan.md
- Do not invent new features or expand scope
- Process features in the order they appear in the plan

## Output Format

Output EXACTLY ONE of these lines as your final output (no markdown formatting, no code blocks):

NEXT_FEATURE: {name} | {description}
RESUME_FEATURE: {specDir}
REPLAN_FEATURE: {specDir}
GAPS_COMPLETE`;
}

// ── T007: Constitution Prompt ──

export function buildConstitutionPrompt(
  config: RunConfig,
  fullPlanPath: string
): string {
  return `/speckit.constitution

Read the full project plan at ${fullPlanPath} for context about the project being built. The project directory is ${config.projectDir}.`;
}

// ── T008: Specify Prompt ──

export function buildSpecifyPrompt(
  config: RunConfig,
  featureName: string,
  featureDescription: string
): string {
  return `/speckit-specify

Feature name: ${featureName}
Feature description: ${featureDescription}

Project directory: ${config.projectDir}

Read .specify/full_plan.md for the complete project context. Extract the relevant user stories, requirements, and acceptance criteria for this specific feature.`;
}

// ── T009: Loop Plan Prompt ──

export function buildLoopPlanPrompt(
  config: RunConfig,
  specPath: string
): string {
  return `/speckit-plan ${specPath}

Read .specify/full_plan.md for the full project context including testing strategy and technology stack. Derive test requirements from the acceptance criteria in the spec.`;
}

// ── T010: Loop Tasks Prompt ──

export function buildLoopTasksPrompt(
  config: RunConfig,
  specPath: string
): string {
  return `/speckit-tasks ${specPath}`;
}

// ── T011: Verify Prompt ──

export function buildVerifyPrompt(
  config: RunConfig,
  specDir: string,
  fullPlanPath: string
): string {
  return `You are a verification agent. Your job is to verify that the implementation in the project matches the specification.

## Instructions

1. Read the spec at: ${specDir}/spec.md
2. Read the plan at: ${specDir}/plan.md
3. Read the full project plan at: ${fullPlanPath} for testing strategy
4. Run the build command to verify the project compiles
5. Run tests if they exist
6. Check that all acceptance criteria from the spec are met
7. If browser-based verification is needed, use the available MCP tools

## Project Directory

${config.projectDir}

## Output

Report what passed and what failed. If everything passes, confirm verification is complete.
If there are failures, describe each failure clearly so the next cycle can fix them.`;
}

// ── T012: Learnings Prompt ──

export function buildLearningsPrompt(
  config: RunConfig,
  specDir: string
): string {
  return `You are a learnings agent. Review the work done on the spec at ${specDir} and extract operational insights.

## Instructions

1. Read the spec, plan, and implementation files in ${specDir}
2. Identify patterns that worked well or caused problems
3. Update \`.claude/rules/learnings.md\` with operational insights that will help future cycles

## Project Directory

${config.projectDir}

## Guidelines

- Focus on actionable, project-specific insights
- Note any workarounds or gotchas discovered
- Record technology-specific patterns (build quirks, API behaviors)
- Keep entries concise — one line per insight
- Append to existing content, don't overwrite`;
}

// ── T013: Implement Prompt ──

export function buildImplementPrompt(
  config: RunConfig,
  phase: Phase,
  fullPlanPath: string
): string {
  const specPath = config.specDir.startsWith("/")
    ? config.specDir
    : `${config.projectDir}/${config.specDir}`;

  return `/speckit-implement ${specPath} --phase ${phase.number}

## Ralph Loop Guardrails

- Read ${fullPlanPath} for full project context (READ-ONLY — do not modify full_plan.md)
- Orient: You are implementing Phase ${phase.number}: ${phase.name}
- After completing EACH task, immediately mark it [x] in ${specPath}/tasks.md
- Run build/typecheck after each logical group of changes
- If a task fails, log the error and move to the next task
- Do not spawn more than 3 subagents concurrently
- Commit after completing the phase: git add -A && git commit -m "Phase ${phase.number}: ${phase.name}"`;
}
