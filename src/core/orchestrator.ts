import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  AgentStep,
  EmitFn,
  Phase,
  RunConfig,
  SubagentInfo,
  Task,
} from "./types.js";
import { parseTasksFile, derivePhaseStatus, extractTaskIds, parseGapAnalysisResult, discoverNewSpecDir } from "./parser.js";
import {
  initDatabase,
  createRun,
  completeRun,
  createPhaseTrace,
  completePhaseTrace,
  insertStep,
  insertSubagent,
  completeSubagent,
  insertLoopCycle,
  updateLoopCycle,
  upsertFailureRecord,
  getFailureRecord,
  updateRunLoopsCompleted,
} from "./database.js";
import {
  getCurrentBranch,
  createBranch,
  createPullRequest,
  createLoopPullRequest,
} from "./git.js";
import {
  buildClarificationPrompt,
  buildGapAnalysisPrompt,
  buildConstitutionPrompt,
  buildSpecifyPrompt,
  buildLoopPlanPrompt,
  buildLoopTasksPrompt,
  buildImplementPrompt,
  buildVerifyPrompt,
  buildLearningsPrompt,
} from "./prompts.js";
import type {
  LoopStageType,
  GapAnalysisDecision,
  FailureRecord,
  LoopTermination,
  TerminationReason,
} from "./types.js";

// ── Logging ──

const LOGS_ROOT = path.join(os.homedir(), ".ralph-claude", "logs");

function formatLogLine(level: string, msg: string, data?: unknown): string {
  const ts = new Date().toISOString();
  return data
    ? `[${ts}] [${level}] ${msg} ${JSON.stringify(data, null, 0)}\n`
    : `[${ts}] [${level}] ${msg}\n`;
}

/**
 * Structured per-run logger.
 *
 * Directory layout:
 *   ~/.ralph-claude/logs/<project-name>/<run-id>/
 *     run.log                          — run-level lifecycle events
 *     phase-<N>_<slug>/
 *       agent.log                      — all events for this phase's agent
 *       subagents/
 *         <subagent-id>.log            — per-subagent lifecycle + raw SDK input
 */
class RunLogger {
  private runDir: string;
  private phaseDir: string | null = null;

  constructor(projectName: string, runId: string) {
    this.runDir = path.join(LOGS_ROOT, projectName, runId);
    fs.mkdirSync(this.runDir, { recursive: true });
  }

  /** Log to run.log (run-level events) */
  run(level: "INFO" | "ERROR" | "DEBUG" | "WARN", msg: string, data?: unknown): void {
    fs.appendFileSync(path.join(this.runDir, "run.log"), formatLogLine(level, msg, data));
  }

  /** Set the active phase directory — call at phase start */
  startPhase(phaseNumber: number, phaseName: string, phaseTraceId: string): void {
    const slug = phaseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    this.phaseDir = path.join(this.runDir, `phase-${phaseNumber}_${slug}`);
    fs.mkdirSync(path.join(this.phaseDir, "subagents"), { recursive: true });
    this.run("INFO", `Phase ${phaseNumber} started: ${phaseName}`, { phaseTraceId });
    this.phase("INFO", `Phase ${phaseNumber}: ${phaseName} — phaseTraceId=${phaseTraceId}`);
  }

  /** Log to the current phase's agent.log */
  phase(level: "INFO" | "ERROR" | "DEBUG" | "WARN", msg: string, data?: unknown): void {
    if (!this.phaseDir) {
      this.run(level, msg, data);
      return;
    }
    fs.appendFileSync(path.join(this.phaseDir, "agent.log"), formatLogLine(level, msg, data));
  }

  /** Log to a subagent's dedicated log file within the current phase */
  subagent(subagentId: string, level: "INFO" | "ERROR" | "DEBUG" | "WARN", msg: string, data?: unknown): void {
    if (!this.phaseDir) {
      this.run(level, `[subagent:${subagentId}] ${msg}`, data);
      return;
    }
    const file = path.join(this.phaseDir, "subagents", `${subagentId}.log`);
    fs.appendFileSync(file, formatLogLine(level, msg, data));
  }

  /** Convenience: log to both phase agent.log AND subagent file */
  subagentEvent(subagentId: string, level: "INFO" | "ERROR" | "DEBUG" | "WARN", msg: string, data?: unknown): void {
    this.phase(level, `[subagent:${subagentId}] ${msg}`, data);
    this.subagent(subagentId, level, msg, data);
  }

  get currentRunDir(): string { return this.runDir; }
  get currentPhaseDir(): string | null { return this.phaseDir; }
}

/** Fallback logger used before a run starts (global orchestrator log). */
const FALLBACK_LOG = path.join(os.homedir(), ".ralph-claude", "orchestrator.log");
function log(level: "INFO" | "ERROR" | "DEBUG" | "WARN", msg: string, data?: unknown): void {
  fs.mkdirSync(path.dirname(FALLBACK_LOG), { recursive: true });
  fs.appendFileSync(FALLBACK_LOG, formatLogLine(level, msg, data));
}

let abortController: AbortController | null = null;

// ── Module-level run state (survives renderer reload) ──

interface RunState {
  runId: string;
  projectDir: string;
  specDir: string;
  mode: string;
  model: string;
  phaseTraceId: string;
  phaseNumber: number;
  phaseName: string;
  // Loop-mode fields
  currentCycle?: number;
  currentStage?: LoopStageType;
  isClarifying?: boolean;
  loopsCompleted?: number;
}

let currentRunState: RunState | null = null;

/**
 * Returns the current run state if the orchestrator is actively running.
 * This is the authoritative source — DB rows can be stale from crashes.
 */
export function getRunState(): RunState | null {
  if (!abortController) return null;
  return currentRunState;
}

// ── Pricing (USD per 1M tokens) ──

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250514": { input: 3, output: 15 },
  "claude-sonnet-4-6":          { input: 3, output: 15 },
  "claude-opus-4-5-20250414":   { input: 15, output: 75 },
  "claude-opus-4-6":            { input: 15, output: 75 },
  "claude-haiku-4-5-20251001":  { input: 0.80, output: 4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Match by prefix — e.g. "claude-sonnet-4-5-20250514" matches "claude-sonnet-4-5"
  const pricing = MODEL_PRICING[model]
    ?? Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ── Step Construction Helpers ──

function makeStep(
  type: AgentStep["type"],
  sequenceIndex: number,
  content: string | null,
  metadata: Record<string, unknown> | null = null
): AgentStep {
  return {
    id: crypto.randomUUID(),
    sequenceIndex,
    type,
    content,
    metadata,
    durationMs: null,
    tokenCount: null,
    createdAt: new Date().toISOString(),
  };
}

function toToolCallStep(
  input: Record<string, unknown>,
  idx: number
): AgentStep {
  return makeStep("tool_call", idx, null, {
    toolName: input.tool_name ?? "unknown",
    toolInput: input.tool_input ?? {},
    toolUseId: input.tool_use_id ?? null,
  });
}

function stringifyResponse(response: unknown): string {
  if (typeof response === "string") return response;
  try {
    return JSON.stringify(response, null, 2);
  } catch {
    return String(response);
  }
}

function toToolResultStep(
  input: Record<string, unknown>,
  idx: number
): AgentStep {
  const response = input.tool_response ?? input.tool_result ?? "";
  const text = stringifyResponse(response);
  const isError = typeof response === "string" && response.startsWith("Error");
  return makeStep(
    isError ? "tool_error" : "tool_result",
    idx,
    text,
    {
      toolName: input.tool_name ?? "unknown",
      toolUseId: input.tool_use_id ?? null,
    }
  );
}

function toSubagentInfo(input: Record<string, unknown>): SubagentInfo {
  return {
    id: crypto.randomUUID(),
    subagentId: String(input.subagent_id ?? input.agent_id ?? crypto.randomUUID()),
    subagentType: String(input.subagent_type ?? input.agent_type ?? "unknown"),
    description: input.description ? String(input.description) : null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

// ── Spec Discovery ──

function listSpecDirs(projectDir: string): string[] {
  const candidates = [
    path.join(projectDir, "specs"),
    path.join(projectDir, ".specify", "specs"),
  ];

  for (const specsRoot of candidates) {
    if (fs.existsSync(specsRoot)) {
      const entries = fs.readdirSync(specsRoot, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .filter((e) => fs.existsSync(path.join(specsRoot, e.name, "tasks.md")))
        .map((e) => path.relative(projectDir, path.join(specsRoot, e.name)))
        .sort();
    }
  }

  return [];
}

function isSpecComplete(projectDir: string, specDir: string): boolean {
  const phases = parseTasksFile(projectDir, specDir);
  return phases.length > 0 && phases.every((p) => p.status === "complete");
}

// ── In-Memory Task State ──

const STATUS_RANK: Record<string, number> = {
  not_done: 0,
  code_exists: 1,
  in_progress: 2,
  done: 3,
};

class RunTaskState {
  private phases: Phase[];
  private taskMap: Map<string, Task>;

  constructor(initialPhases: Phase[]) {
    // Deep-clone so mutations don't affect the caller's data
    this.phases = JSON.parse(JSON.stringify(initialPhases));
    this.taskMap = new Map();
    for (const p of this.phases) {
      for (const t of p.tasks) {
        this.taskMap.set(t.id, t);
      }
    }
  }

  /** Apply TodoWrite statuses. Promotes only (never demotes). Returns current phases. */
  updateFromTodoWrite(
    todos: Array<{ content?: string; status?: string }>
  ): Phase[] {
    const updates = new Map<string, "in_progress" | "done">();

    for (const todo of todos) {
      if (!todo.content) continue;
      const ids = extractTaskIds(todo.content);
      const mapped =
        todo.status === "completed" ? "done" : todo.status === "in_progress" ? "in_progress" : null;
      if (!mapped) continue;
      for (const id of ids) {
        updates.set(id, mapped);
      }
    }

    if (updates.size === 0) return this.phases;

    for (const [id, newStatus] of updates) {
      const task = this.taskMap.get(id);
      if (task && STATUS_RANK[newStatus] > STATUS_RANK[task.status]) {
        task.status = newStatus;
      }
    }

    // Re-derive phase statuses
    for (const p of this.phases) {
      p.status = derivePhaseStatus(p.tasks);
    }

    return this.phases;
  }

  /**
   * Re-read tasks.md from disk and reconcile with in-memory state.
   * Promote-only: a task that is "done" on disk but "not_done" in memory
   * gets promoted. A task that is "done" in memory stays "done" even if
   * disk says otherwise (agent may have used TodoWrite earlier).
   */
  reconcileFromDisk(freshPhases: Phase[]): Phase[] {
    for (const freshPhase of freshPhases) {
      for (const freshTask of freshPhase.tasks) {
        const memTask = this.taskMap.get(freshTask.id);
        if (memTask && STATUS_RANK[freshTask.status] > STATUS_RANK[memTask.status]) {
          memTask.status = freshTask.status;
        }
      }
    }

    for (const p of this.phases) {
      p.status = derivePhaseStatus(p.tasks);
    }

    return this.phases;
  }

  getPhases(): Phase[] {
    return this.phases;
  }

  getIncompletePhases(filter: "all" | number[]): Phase[] {
    if (filter === "all") {
      return this.phases.filter((p) => p.status !== "complete");
    }
    return this.phases.filter(
      (p) => filter.includes(p.number) && p.status !== "complete"
    );
  }
}

// ── Prompt Builders ──

function buildPrompt(config: RunConfig, phase: Phase): string {
  // Resolve the spec directory to an absolute path so the agent knows exactly
  // which spec to work on (specDir may be relative like "specs/001-product-catalog").
  const specPath = config.specDir.startsWith("/")
    ? config.specDir
    : `${config.projectDir}/${config.specDir}`;

  const skillName = config.mode === "plan" ? "speckit-plan" : "speckit-implement";

  // The prompt starts with the slash command — the SDK harness expands it
  // as a user invocation (disable-model-invocation only blocks the model
  // from calling the Skill tool on its own, not user-invoked slash commands).
  const afterSteps = config.mode === "plan"
    ? `After analyzing:
- Update ${specPath}/tasks.md with accurate task statuses
- If you learned operational patterns, update CLAUDE.md
- Commit: git add -A && git commit -m "plan: Phase ${phase.number} gap analysis"`
    : `IMPORTANT — update tasks.md incrementally:
- After completing EACH task, immediately mark it [x] in ${specPath}/tasks.md before moving to the next task. This drives a real-time progress UI.

After implementing all tasks:
- Run build/typecheck to verify changes compile
- Run tests if they exist
- Commit: git add -A && git commit -m "Phase ${phase.number}: ${phase.name}"
- If you learned operational patterns, update CLAUDE.md`;

  return `/${skillName} ${specPath} --phase ${phase.number}

${afterSteps}`;
}

// ── Phase Runner ──

async function runPhase(
  config: RunConfig,
  phase: Phase,
  phaseTraceId: string,
  emit: EmitFn,
  rlog: RunLogger,
  runTaskState: RunTaskState
): Promise<{ cost: number; durationMs: number; inputTokens: number; outputTokens: number }> {
  const startTime = Date.now();
  let stepIndex = 0;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const knownSubagentIds = new Set<string>();

  const skillName = config.mode === "plan" ? "speckit-plan" : "speckit-implement";
  const specPath = config.specDir.startsWith("/")
    ? config.specDir
    : `${config.projectDir}/${config.specDir}`;

  const prompt = buildPrompt(config, phase);
  rlog.phase("INFO", `runPhase: spawning agent for Phase ${phase.number}: ${phase.name}`);
  rlog.phase("DEBUG", "runPhase: prompt", { length: prompt.length, prompt });

  // Dual-write helper: emit to UI via IPC + persist to SQLite
  // Attaches running cost/token totals so the renderer can display live stats.
  const emitAndStore = (step: AgentStep) => {
    const enriched: AgentStep = {
      ...step,
      metadata: {
        ...step.metadata,
        costUsd: totalCost || null,
        inputTokens: totalInputTokens || null,
        outputTokens: totalOutputTokens || null,
      },
    };
    rlog.phase("DEBUG", `emitAndStore: step type=${enriched.type}`, { id: enriched.id, seq: enriched.sequenceIndex });
    emit({ type: "agent_step", step: enriched });
    insertStep({ ...enriched, phaseTraceId });
  };

  // Emit the initial prompt as a user_message step
  emitAndStore(makeStep("user_message", stepIndex++, prompt));

  // Emit skill_invoke step to show which skill is being expanded
  emitAndStore(
    makeStep("skill_invoke", stepIndex++, null, {
      skillName,
      skillArgs: `${specPath} --phase ${phase.number}`,
    })
  );

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  rlog.phase("DEBUG", "runPhase: SDK imported, calling query()");

  const isAborted = () => abortController?.signal.aborted ?? false;
  let sessionId: string | null = null;

  for await (const msg of query({
    prompt,
    options: {
      model: config.model,
      cwd: config.projectDir,
      maxTurns: config.maxTurns,
      permissionMode: "bypassPermissions",
      settingSources: ["project"],
      hooks: {
        PreToolUse: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const toolName = String(input.tool_name ?? "unknown");
                rlog.phase("DEBUG", `PreToolUse: ${toolName}`, { toolUseId: input.tool_use_id, toolInput: input.tool_input });

                // Emit skill_invoke for Skill tool calls
                if (toolName === "Skill") {
                  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
                  emitAndStore(
                    makeStep("skill_invoke", stepIndex++, null, {
                      skillName: toolInput.skill ?? "",
                      skillArgs: toolInput.args ?? "",
                      toolUseId: input.tool_use_id ?? null,
                    })
                  );
                } else {
                  emitAndStore(toToolCallStep(input, stepIndex++));
                }

                if (isAborted()) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "deny",
                      permissionDecisionReason: "Run stopped by user",
                    },
                  };
                }
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "allow",
                  },
                };
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const toolName = String(input.tool_name ?? "unknown");
                rlog.phase("DEBUG", `PostToolUse: ${toolName}`, { toolUseId: input.tool_use_id });

                // Emit skill_result for Skill tool results
                if (toolName === "Skill") {
                  const response = input.tool_response ?? input.tool_result ?? "";
                  emitAndStore(
                    makeStep("skill_result", stepIndex++, stringifyResponse(response), {
                      toolUseId: input.tool_use_id ?? null,
                    })
                  );
                } else {
                  emitAndStore(toToolResultStep(input, stepIndex++));
                }

                // Detect TodoWrite — update in-memory task state (sole source of truth during run)
                if (toolName === "TodoWrite") {
                  try {
                    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
                    const todos = (toolInput.todos ?? []) as Array<{
                      content?: string;
                      status?: string;
                    }>;
                    const updatedPhases = runTaskState.updateFromTodoWrite(todos);
                    emit({ type: "tasks_updated", phases: updatedPhases });
                    rlog.phase("DEBUG", "PostToolUse: TodoWrite detected, emitted tasks_updated");
                  } catch (err) {
                    rlog.phase("WARN", "PostToolUse: failed to process TodoWrite", { err: String(err) });
                  }
                }

                return {
                  hookSpecificOutput: { hookEventName: "PostToolUse" },
                };
              },
            ],
          },
        ],
        SubagentStart: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const info = toSubagentInfo(input);
                knownSubagentIds.add(info.subagentId);
                rlog.subagentEvent(info.subagentId, "INFO", "SubagentStart", {
                  subagentType: info.subagentType,
                  description: info.description,
                  rawInput: input,
                });
                emit({ type: "subagent_started", info });
                insertSubagent({ ...info, phaseTraceId });
                emitAndStore(
                  makeStep("subagent_spawn", stepIndex++, null, {
                    subagentId: info.subagentId,
                    subagentType: info.subagentType,
                    description: info.description,
                  })
                );
                return {};
              },
            ],
          },
        ],
        SubagentStop: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const subagentId = String(input.subagent_id ?? input.agent_id ?? "unknown");
                rlog.subagentEvent(subagentId, "INFO", "SubagentStop", { rawInput: input });

                // Skip subagents we never saw start — these are session-init
                // subagents spawned before our hooks were registered.
                if (!knownSubagentIds.has(subagentId)) {
                  rlog.phase("DEBUG", `SubagentStop: ignoring orphan subagent ${subagentId} (no matching start)`);
                  return {};
                }

                emit({ type: "subagent_completed", subagentId });
                completeSubagent(subagentId);
                emitAndStore(
                  makeStep("subagent_result", stepIndex++, null, {
                    subagentId,
                  })
                );
                return {};
              },
            ],
          },
        ],
      },
    },
  })) {
    // Break out of streaming when abort requested
    if (isAborted()) {
      rlog.phase("INFO", "runPhase: abort detected in message loop, breaking");
      break;
    }

    const message = msg as Record<string, unknown>;

    // Log system init message — shows what skills/plugins/tools the agent sees
    if (message.type === "system") {
      const skills = message.skills as unknown[] | undefined;
      const plugins = message.plugins as unknown[] | undefined;
      const tools = message.tools as unknown[] | undefined;
      const agents = message.agents as unknown[] | undefined;
      const slashCommands = message.slash_commands as unknown[] | undefined;
      const model = message.model as string | undefined;
      rlog.phase("INFO", "runPhase: system init", {
        model,
        toolCount: tools?.length ?? 0,
        skillCount: skills?.length ?? 0,
        pluginCount: plugins?.length ?? 0,
        agentCount: agents?.length ?? 0,
        slashCommandCount: slashCommands?.length ?? 0,
      });
      if (skills && skills.length > 0) {
        rlog.phase("INFO", "runPhase: available skills", { skills });
      } else {
        rlog.phase("WARN", "runPhase: NO SKILLS available to agent");
      }
      if (plugins && plugins.length > 0) {
        rlog.phase("INFO", "runPhase: available plugins", { plugins });
      }
      if (slashCommands && slashCommands.length > 0) {
        rlog.phase("INFO", "runPhase: available slash commands", { slashCommands });
      }

      // Extract tool names and separate MCP servers from built-in tools
      const toolNames: string[] = [];
      const mcpServers = new Map<string, string[]>();
      if (tools) {
        for (const t of tools) {
          const name = typeof t === "object" && t !== null
            ? String((t as Record<string, unknown>).name ?? t)
            : String(t);
          toolNames.push(name);
          if (name.startsWith("mcp__")) {
            // Format: mcp__<server>__<tool>
            const parts = name.split("__");
            if (parts.length >= 3) {
              const server = parts[1];
              if (!mcpServers.has(server)) mcpServers.set(server, []);
              mcpServers.get(server)!.push(parts.slice(2).join("__"));
            }
          }
        }
        rlog.phase("DEBUG", "runPhase: available tools", { tools: toolNames });
      }

      // Emit debug step with all agent capabilities
      emitAndStore(
        makeStep("debug", stepIndex++, null, {
          model: model ?? null,
          mcpServers: Object.fromEntries(mcpServers),
          skills: skills ?? [],
          plugins: plugins ?? [],
          agents: agents ?? [],
          slashCommands: slashCommands ?? [],
          toolCount: toolNames.length,
        })
      );
    }

    // Capture session_id from the first message that carries it
    if (!sessionId && typeof message.session_id === "string") {
      sessionId = message.session_id;
      rlog.phase("INFO", `runPhase: session_id=${sessionId}`);
      emitAndStore(
        makeStep("text", stepIndex++, `Session: ${sessionId}`, { sessionId })
      );
    }

    if (message.type === "assistant") {
      // Content blocks live at message.message.content (SDK wraps the API response)
      const innerMsg = message.message as Record<string, unknown> | undefined;
      const content = innerMsg?.content as
        | Array<Record<string, unknown>>
        | undefined;

      // Accumulate per-turn token usage from the API response
      // Try inner message (API response wrapper) first, then outer message
      const usage = (innerMsg?.usage ?? message.usage) as Record<string, unknown> | undefined;
      if (usage) {
        if (typeof usage.input_tokens === "number") totalInputTokens += usage.input_tokens;
        if (typeof usage.output_tokens === "number") totalOutputTokens += usage.output_tokens;
        totalCost = estimateCost(config.model, totalInputTokens, totalOutputTokens);
      }

      rlog.phase("DEBUG", "assistant message", {
        outerKeys: Object.keys(message),
        innerKeys: innerMsg ? Object.keys(innerMsg) : null,
        blockTypes: content?.map((b) => b.type) ?? [],
        usage: usage ?? null,
        runningTokens: { input: totalInputTokens, output: totalOutputTokens },
      });
      if (content) {
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            emitAndStore(makeStep("text", stepIndex++, block.text));
          }
          if (
            block.type === "thinking" &&
            typeof block.thinking === "string"
          ) {
            emitAndStore(makeStep("thinking", stepIndex++, block.thinking));
          }
        }
      }
    }

    if (message.type === "result") {
      const costUsd = message.total_cost_usd;
      if (typeof costUsd === "number") totalCost = costUsd;

      // Extract token totals from result.usage (authoritative final values)
      const resultUsage = message.usage as Record<string, unknown> | undefined;
      if (resultUsage) {
        if (typeof resultUsage.input_tokens === "number") totalInputTokens = resultUsage.input_tokens;
        if (typeof resultUsage.output_tokens === "number") totalOutputTokens = resultUsage.output_tokens;
      }

      rlog.phase("INFO", `runPhase: result received`, {
        cost: costUsd,
        durationMs: message.duration_ms,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        usage: resultUsage ?? null,
        isError: message.is_error,
        subtype: message.subtype,
        result: typeof message.result === "string" ? message.result.slice(0, 500) : message.result,
        numTurns: message.num_turns,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  rlog.phase("INFO", `runPhase: completed, cost=$${totalCost}, duration=${durationMs}ms`);

  // Emit a completed step at the end
  if (!isAborted()) {
    emitAndStore(makeStep("completed", stepIndex++, `Phase ${phase.number}: ${phase.name} completed`, {
      inputTokens: totalInputTokens || null,
      outputTokens: totalOutputTokens || null,
    }));
  }

  return { cost: totalCost, durationMs, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

// ── Stage Runner (lightweight query() wrapper for loop stages) ──

async function runStage(
  config: RunConfig,
  prompt: string,
  emit: EmitFn,
  rlog: RunLogger,
  runId: string,
  cycleNumber: number,
  stageType: import("./types.js").LoopStageType,
  specDir?: string
): Promise<{ result: string; cost: number; durationMs: number; inputTokens: number; outputTokens: number }> {
  const startTime = Date.now();
  let stepIndex = 0;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let resultText = "";
  const knownSubagentIds = new Set<string>();

  // Create a phase trace for this stage so steps are persisted
  const phaseTraceId = crypto.randomUUID();
  createPhaseTrace({
    id: phaseTraceId,
    runId,
    specDir: specDir ?? "",
    phaseNumber: cycleNumber,
    phaseName: `loop:${stageType}`,
  });

  rlog.phase("INFO", `runStage: ${stageType} for cycle ${cycleNumber}`);

  const emitAndStore = (step: AgentStep) => {
    const enriched: AgentStep = {
      ...step,
      metadata: {
        ...step.metadata,
        costUsd: totalCost || null,
        inputTokens: totalInputTokens || null,
        outputTokens: totalOutputTokens || null,
      },
    };
    emit({ type: "agent_step", step: enriched });
    insertStep({ ...enriched, phaseTraceId });
  };

  emitAndStore(makeStep("user_message", stepIndex++, prompt));

  emit({
    type: "stage_started",
    runId,
    cycleNumber,
    stage: stageType,
    specDir,
  });

  const isAborted = () => abortController?.signal.aborted ?? false;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  for await (const msg of query({
    prompt,
    options: {
      model: config.model,
      cwd: config.projectDir,
      maxTurns: config.maxTurns,
      permissionMode: "bypassPermissions",
      settingSources: ["project"],
      hooks: {
        PreToolUse: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const toolName = String(input.tool_name ?? "unknown");
                rlog.phase("DEBUG", `runStage PreToolUse: ${toolName}`);

                if (toolName === "Skill") {
                  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
                  emitAndStore(
                    makeStep("skill_invoke", stepIndex++, null, {
                      skillName: toolInput.skill ?? "",
                      skillArgs: toolInput.args ?? "",
                      toolUseId: input.tool_use_id ?? null,
                    })
                  );
                } else {
                  emitAndStore(toToolCallStep(input, stepIndex++));
                }

                if (isAborted()) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "deny",
                      permissionDecisionReason: "Run stopped by user",
                    },
                  };
                }
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "allow",
                  },
                };
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const toolName = String(input.tool_name ?? "unknown");
                if (toolName === "Skill") {
                  const response = input.tool_response ?? input.tool_result ?? "";
                  emitAndStore(
                    makeStep("skill_result", stepIndex++, stringifyResponse(response), {
                      toolUseId: input.tool_use_id ?? null,
                    })
                  );
                } else {
                  emitAndStore(toToolResultStep(input, stepIndex++));
                }
                return { hookSpecificOutput: { hookEventName: "PostToolUse" } };
              },
            ],
          },
        ],
        SubagentStart: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const info = toSubagentInfo(input);
                knownSubagentIds.add(info.subagentId);
                emit({ type: "subagent_started", info });
                insertSubagent({ ...info, phaseTraceId });
                emitAndStore(
                  makeStep("subagent_spawn", stepIndex++, null, {
                    subagentId: info.subagentId,
                    subagentType: info.subagentType,
                    description: info.description,
                  })
                );
                return {};
              },
            ],
          },
        ],
        SubagentStop: [
          {
            matcher: undefined,
            hooks: [
              async (input: Record<string, unknown>) => {
                const subagentId = String(input.subagent_id ?? input.agent_id ?? "unknown");
                if (!knownSubagentIds.has(subagentId)) return {};
                emit({ type: "subagent_completed", subagentId });
                completeSubagent(subagentId);
                emitAndStore(
                  makeStep("subagent_result", stepIndex++, null, { subagentId })
                );
                return {};
              },
            ],
          },
        ],
      },
    },
  })) {
    if (isAborted()) break;

    const message = msg as Record<string, unknown>;

    if (message.type === "assistant") {
      const innerMsg = message.message as Record<string, unknown> | undefined;
      const content = innerMsg?.content as Array<Record<string, unknown>> | undefined;
      const usage = (innerMsg?.usage ?? message.usage) as Record<string, unknown> | undefined;
      if (usage) {
        if (typeof usage.input_tokens === "number") totalInputTokens += usage.input_tokens;
        if (typeof usage.output_tokens === "number") totalOutputTokens += usage.output_tokens;
        totalCost = estimateCost(config.model, totalInputTokens, totalOutputTokens);
      }
      if (content) {
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            emitAndStore(makeStep("text", stepIndex++, block.text));
          }
          if (block.type === "thinking" && typeof block.thinking === "string") {
            emitAndStore(makeStep("thinking", stepIndex++, block.thinking));
          }
        }
      }
    }

    if (message.type === "result") {
      if (typeof message.total_cost_usd === "number") totalCost = message.total_cost_usd;
      const resultUsage = message.usage as Record<string, unknown> | undefined;
      if (resultUsage) {
        if (typeof resultUsage.input_tokens === "number") totalInputTokens = resultUsage.input_tokens;
        if (typeof resultUsage.output_tokens === "number") totalOutputTokens = resultUsage.output_tokens;
      }
      if (typeof message.result === "string") resultText = message.result;
      rlog.phase("INFO", `runStage: ${stageType} result received`, {
        cost: totalCost,
        resultPreview: resultText.slice(0, 200),
      });
    }
  }

  const durationMs = Date.now() - startTime;

  completePhaseTrace(phaseTraceId, "completed", totalCost, durationMs, totalInputTokens || undefined, totalOutputTokens || undefined);

  emit({
    type: "stage_completed",
    runId,
    cycleNumber,
    stage: stageType,
    costUsd: totalCost,
    durationMs,
  });

  return { result: resultText, cost: totalCost, durationMs, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

// ── Build Mode Runner (extracted from run()) ──

async function runBuild(
  config: RunConfig,
  emit: EmitFn,
  runId: string,
  rlog: RunLogger
): Promise<{ phasesCompleted: number; totalCost: number }> {
  let phasesCompleted = 0;
  let totalCost = 0;
  const runStart = Date.now();

  // Determine which specs to process
  const specDirs = config.runAllSpecs
    ? listSpecDirs(config.projectDir).filter(
        (s) => !isSpecComplete(config.projectDir, s)
      )
    : [config.specDir];

  if (specDirs.length === 0) {
    rlog.run("INFO", "runBuild: no unfinished specs found");
    return { phasesCompleted, totalCost };
  }

  rlog.run("INFO", `runBuild: will process ${specDirs.length} spec(s)`, { specDirs });

  for (const specDir of specDirs) {
    if (abortController?.signal.aborted) break;

    const specConfig = { ...config, specDir };

    emit({ type: "spec_started", specDir });
    if (currentRunState) currentRunState.specDir = specDir;
    rlog.run("INFO", `runBuild: starting spec ${specDir}`);

    const initialPhases = parseTasksFile(config.projectDir, specDir);
    const runTaskState = new RunTaskState(initialPhases);

    let iteration = 0;
    let specFailed = false;

    while (iteration < config.maxIterations) {
      if (abortController?.signal.aborted) break;

      const targetPhases = runTaskState.getIncompletePhases(config.phases);

      const phase = targetPhases[0];
      if (!phase) break;

      const phaseTraceId = crypto.randomUUID();
      createPhaseTrace({
        id: phaseTraceId,
        runId,
        specDir,
        phaseNumber: phase.number,
        phaseName: phase.name,
      });

      rlog.startPhase(phase.number, phase.name, phaseTraceId);
      if (currentRunState) {
        currentRunState.phaseTraceId = phaseTraceId;
        currentRunState.phaseNumber = phase.number;
        currentRunState.phaseName = phase.name;
      }
      emit({ type: "phase_started", phase, iteration, phaseTraceId });
      emit({ type: "tasks_updated", phases: runTaskState.getPhases() });

      try {
        const result = await runPhase(specConfig, phase, phaseTraceId, emit, rlog, runTaskState);

        completePhaseTrace(
          phaseTraceId,
          "completed",
          result.cost,
          result.durationMs,
          result.inputTokens || undefined,
          result.outputTokens || undefined
        );

        phasesCompleted++;
        totalCost += result.cost;

        const freshPhases = parseTasksFile(config.projectDir, specDir);
        const reconciledPhases = runTaskState.reconcileFromDisk(freshPhases);
        emit({ type: "tasks_updated", phases: reconciledPhases });

        emit({
          type: "phase_completed",
          phase: { ...phase, status: "complete" },
          cost: result.cost,
          durationMs: result.durationMs,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        rlog.phase("ERROR", `Phase ${phase.number} failed: ${message}`, { stack });
        rlog.run("ERROR", `Phase ${phase.number} failed: ${message}`);
        completePhaseTrace(phaseTraceId, "failed", 0, Date.now() - runStart);
        emit({
          type: "error",
          message: `Phase ${phase.number} failed: ${message}`,
          phaseNumber: phase.number,
        });
        specFailed = true;
        break;
      }

      iteration++;
    }

    if (!specFailed && !abortController?.signal.aborted) {
      rlog.run("INFO", `runBuild: spec ${specDir} completed`);
      emit({ type: "spec_completed", specDir, phasesCompleted });
    }

    if (specFailed) break;
  }

  return { phasesCompleted, totalCost };
}

// ── Main Entry Point ──

export async function run(config: RunConfig, emit: EmitFn): Promise<void> {
  initDatabase();
  abortController = new AbortController();

  const baseBranch = getCurrentBranch(config.projectDir);
  const branchName = createBranch(config.projectDir, config.mode);

  const runId = crypto.randomUUID();
  const projectName = path.basename(config.projectDir);
  const rlog = new RunLogger(projectName, runId);
  rlog.run("INFO", "run: starting orchestrator", { mode: config.mode, model: config.model, specDir: config.specDir, branch: branchName, baseBranch });

  createRun({
    id: runId,
    projectDir: config.projectDir,
    specDir: config.specDir,
    mode: config.mode,
    model: config.model,
  });

  emit({ type: "run_started", config, runId, branchName });

  currentRunState = {
    runId,
    projectDir: config.projectDir,
    specDir: config.specDir,
    mode: config.mode,
    model: config.model,
    phaseTraceId: "",
    phaseNumber: 0,
    phaseName: "",
  };

  let phasesCompleted = 0;
  let totalCost = 0;
  const runStart = Date.now();

  try {
    if (config.mode === "loop") {
      const result = await runLoop(config, emit, runId, rlog);
      phasesCompleted = result.phasesCompleted;
      totalCost = result.totalCost;
    } else {
      const result = await runBuild(config, emit, runId, rlog);
      phasesCompleted = result.phasesCompleted;
      totalCost = result.totalCost;
    }
  } finally {
    const wasStopped = abortController?.signal.aborted ?? false;
    abortController = null;
    currentRunState = null;

    const totalDuration = Date.now() - runStart;
    const finalStatus = wasStopped ? "stopped" : "completed";
    completeRun(runId, finalStatus, totalCost, totalDuration, phasesCompleted);

    let prUrl: string | null = null;
    if (!wasStopped && phasesCompleted > 0) {
      rlog.run("INFO", `run: creating PR for branch ${branchName}`);
      prUrl = createPullRequest(
        config.projectDir,
        branchName,
        baseBranch,
        config.mode,
        phasesCompleted,
        totalCost,
        totalDuration
      );
      rlog.run("INFO", `run: PR created`, { prUrl });
    }

    emit({
      type: "run_completed",
      totalCost,
      totalDuration,
      phasesCompleted,
      branchName,
      prUrl,
    });
  }
}

// ── Loop Mode Runner ──

async function runLoop(
  config: RunConfig,
  emit: EmitFn,
  runId: string,
  rlog: RunLogger
): Promise<{ phasesCompleted: number; totalCost: number }> {
  // Validate: loop mode requires at least one input source
  if (!config.description && !config.descriptionFile && !config.fullPlanPath) {
    throw new Error("Loop mode requires at least one of: description, descriptionFile, or fullPlanPath");
  }

  let fullPlanPath = config.fullPlanPath ?? "";
  let cumulativeCost = 0;
  let cyclesCompleted = 0;
  const featuresCompleted: string[] = [];
  const featuresSkipped: string[] = [];
  const failureTracker = new Map<string, FailureRecord>();

  // Load existing failure records from SQLite for crash recovery
  const loadFailureRecords = () => {
    for (const [, record] of failureTracker) {
      const dbRecord = getFailureRecord(runId, record.specDir);
      if (dbRecord) {
        record.implFailures = dbRecord.impl_failures;
        record.replanFailures = dbRecord.replan_failures;
      }
    }
  };

  const getOrCreateFailureRecord = (specDir: string): FailureRecord => {
    let record = failureTracker.get(specDir);
    if (!record) {
      record = { specDir, implFailures: 0, replanFailures: 0 };
      failureTracker.set(specDir, record);
    }
    return record;
  };

  const persistFailure = (specDir: string) => {
    const record = getOrCreateFailureRecord(specDir);
    upsertFailureRecord(runId, specDir, record.implFailures, record.replanFailures);
  };

  // ── Phase A: Clarification (T022) ──
  if (!fullPlanPath) {
    const description = config.description
      ?? (config.descriptionFile ? fs.readFileSync(config.descriptionFile, "utf-8") : "");

    emit({ type: "clarification_started", runId });
    rlog.run("INFO", "runLoop: starting clarification (Phase A)");

    if (currentRunState) {
      currentRunState.isClarifying = true;
    }

    const prompt = buildClarificationPrompt(description);
    const result = await runStage(config, prompt, emit, rlog, runId, 0, "clarification");
    cumulativeCost += result.cost;

    // Extract full_plan.md path from the result
    const planPathMatch = result.result.match(/\.specify\/full_plan\.md/);
    fullPlanPath = planPathMatch
      ? path.join(config.projectDir, ".specify/full_plan.md")
      : path.join(config.projectDir, ".specify/full_plan.md");

    if (!fs.existsSync(fullPlanPath)) {
      throw new Error(`Clarification completed but full_plan.md not found at ${fullPlanPath}`);
    }

    emit({ type: "clarification_completed", runId, fullPlanPath });
    rlog.run("INFO", `runLoop: clarification completed, fullPlanPath=${fullPlanPath}`);

    if (currentRunState) {
      currentRunState.isClarifying = false;
    }
  }

  // ── Pre-loop: Constitution check (T028) ──
  const constitutionPath = path.join(config.projectDir, ".specify", "memory", "constitution.md");
  if (!fs.existsSync(constitutionPath)) {
    rlog.run("INFO", "runLoop: constitution not found, generating");
    const prompt = buildConstitutionPrompt(config, fullPlanPath);
    const result = await runStage(config, prompt, emit, rlog, runId, 0, "constitution");
    cumulativeCost += result.cost;
  } else {
    rlog.run("INFO", "runLoop: constitution already exists, skipping");
  }

  // ── Phase B: Autonomous Loop ──
  loadFailureRecords();

  while (true) {
    // Check abort
    if (abortController?.signal.aborted) {
      rlog.run("INFO", "runLoop: abort detected");
      break;
    }

    // Check max cycles
    if (config.maxLoopCycles && cyclesCompleted >= config.maxLoopCycles) {
      rlog.run("INFO", `runLoop: max cycles reached (${config.maxLoopCycles})`);
      break;
    }

    // Check budget
    if (config.maxBudgetUsd && cumulativeCost >= config.maxBudgetUsd) {
      rlog.run("INFO", `runLoop: budget exceeded ($${cumulativeCost.toFixed(2)} >= $${config.maxBudgetUsd})`);
      break;
    }

    const cycleNumber = cyclesCompleted + 1;
    const cycleId = crypto.randomUUID();
    const cycleStart = Date.now();

    emit({ type: "loop_cycle_started", runId, cycleNumber });
    rlog.run("INFO", `runLoop: starting cycle ${cycleNumber}`);

    if (currentRunState) {
      currentRunState.currentCycle = cycleNumber;
    }

    // ── Gap Analysis (T029) ──
    let decision: GapAnalysisDecision;
    try {
      const existingSpecs = listSpecDirs(config.projectDir);
      const prompt = buildGapAnalysisPrompt(config, fullPlanPath, existingSpecs);

      if (currentRunState) {
        currentRunState.currentStage = "gap_analysis";
      }

      const gapResult = await runStage(config, prompt, emit, rlog, runId, cycleNumber, "gap_analysis");
      cumulativeCost += gapResult.cost;
      decision = parseGapAnalysisResult(gapResult.result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rlog.run("ERROR", `runLoop: gap analysis failed: ${msg}`);
      emit({ type: "error", message: `Gap analysis failed: ${msg}` });
      break;
    }

    // Record the cycle
    const decisionType = decision.type;
    const featureName = decision.type === "NEXT_FEATURE" ? decision.name : null;
    let specDir = decision.type === "RESUME_FEATURE" || decision.type === "REPLAN_FEATURE"
      ? decision.specDir
      : null;

    insertLoopCycle({
      id: cycleId,
      runId,
      cycleNumber,
      featureName,
      specDir,
      decision: decisionType,
    });

    // ── GAPS_COMPLETE → terminate ──
    if (decision.type === "GAPS_COMPLETE") {
      rlog.run("INFO", "runLoop: all gaps complete");
      updateLoopCycle(cycleId, "completed", 0, Date.now() - cycleStart);
      emit({
        type: "loop_cycle_completed",
        runId,
        cycleNumber,
        decision: decisionType,
        featureName: null,
        specDir: null,
        costUsd: 0,
      });
      break;
    }

    // ── Failure threshold checks (T038) ──
    if (specDir) {
      const record = getOrCreateFailureRecord(specDir);
      if (record.replanFailures >= 3) {
        rlog.run("WARN", `runLoop: skipping feature at ${specDir} — 3 replan failures`);
        featuresSkipped.push(specDir);
        updateLoopCycle(cycleId, "skipped", 0, Date.now() - cycleStart);
        emit({
          type: "loop_cycle_completed",
          runId,
          cycleNumber,
          decision: "skipped",
          featureName,
          specDir,
          costUsd: 0,
        });
        cyclesCompleted++;
        updateRunLoopsCompleted(runId, cyclesCompleted);
        continue;
      }
      if (record.implFailures >= 3) {
        // Force replan
        decision = { type: "REPLAN_FEATURE", specDir };
        rlog.run("WARN", `runLoop: forcing replan for ${specDir} — 3 impl failures`);
      }
    }

    let cycleCost = 0;

    try {
      // ── NEXT_FEATURE: specify → plan → tasks → implement → verify → learnings ──
      if (decision.type === "NEXT_FEATURE") {
        // Specify (T030)
        if (currentRunState) {
          currentRunState.currentStage = "specify";
        }
        const knownSpecs = listSpecDirs(config.projectDir);
        const specifyPrompt = buildSpecifyPrompt(config, decision.name, decision.description);
        const specifyResult = await runStage(config, specifyPrompt, emit, rlog, runId, cycleNumber, "specify");
        cycleCost += specifyResult.cost;

        // Discover the newly created spec directory
        specDir = discoverNewSpecDir(config.projectDir, knownSpecs);
        if (!specDir) {
          throw new Error("Specify completed but no new spec directory was created");
        }
        rlog.run("INFO", `runLoop: new spec directory: ${specDir}`);
      }

      // Plan (T031) — for NEXT_FEATURE and REPLAN_FEATURE
      if (decision.type === "NEXT_FEATURE" || decision.type === "REPLAN_FEATURE") {
        const targetSpecDir = specDir!;
        const specPath = targetSpecDir.startsWith("/")
          ? targetSpecDir
          : path.join(config.projectDir, targetSpecDir);

        if (currentRunState) {
          currentRunState.currentStage = "plan";
        }
        const planPrompt = buildLoopPlanPrompt(config, specPath);
        const planResult = await runStage(config, planPrompt, emit, rlog, runId, cycleNumber, "plan", targetSpecDir);
        cycleCost += planResult.cost;

        // Tasks (T031)
        if (currentRunState) {
          currentRunState.currentStage = "tasks";
        }
        const tasksPrompt = buildLoopTasksPrompt(config, specPath);
        const tasksResult = await runStage(config, tasksPrompt, emit, rlog, runId, cycleNumber, "tasks", targetSpecDir);
        cycleCost += tasksResult.cost;
      }

      // Implement (T032)
      const implSpecDir = specDir!;
      const implSpecPath = implSpecDir.startsWith("/")
        ? implSpecDir
        : path.join(config.projectDir, implSpecDir);

      if (currentRunState) {
        currentRunState.currentStage = "implement";
        if (currentRunState) currentRunState.specDir = implSpecDir;
      }

      // Parse tasks.md to get phases, then run each phase
      const phases = parseTasksFile(config.projectDir, implSpecDir);
      const implConfig = { ...config, specDir: implSpecDir };

      for (const phase of phases) {
        if (abortController?.signal.aborted) break;
        if (phase.status === "complete") continue;

        const runTaskState = new RunTaskState(phases);
        const phaseTraceId = crypto.randomUUID();
        createPhaseTrace({
          id: phaseTraceId,
          runId,
          specDir: implSpecDir,
          phaseNumber: phase.number,
          phaseName: phase.name,
        });

        if (currentRunState) {
          currentRunState.phaseTraceId = phaseTraceId;
          currentRunState.phaseNumber = phase.number;
          currentRunState.phaseName = phase.name;
        }

        emit({ type: "phase_started", phase, iteration: 0, phaseTraceId });

        const phaseResult = await runPhase(implConfig, phase, phaseTraceId, emit, rlog, runTaskState);
        completePhaseTrace(
          phaseTraceId,
          "completed",
          phaseResult.cost,
          phaseResult.durationMs,
          phaseResult.inputTokens || undefined,
          phaseResult.outputTokens || undefined
        );
        cycleCost += phaseResult.cost;

        // Reconcile task state from disk
        const freshPhases = parseTasksFile(config.projectDir, implSpecDir);
        runTaskState.reconcileFromDisk(freshPhases);
        emit({ type: "tasks_updated", phases: runTaskState.getPhases() });
        emit({
          type: "phase_completed",
          phase: { ...phase, status: "complete" },
          cost: phaseResult.cost,
          durationMs: phaseResult.durationMs,
        });
      }

      // Verify (T033)
      if (currentRunState) {
        currentRunState.currentStage = "verify";
      }
      const verifyPrompt = buildVerifyPrompt(config, implSpecPath, fullPlanPath);
      const verifyResult = await runStage(config, verifyPrompt, emit, rlog, runId, cycleNumber, "verify", implSpecDir);
      cycleCost += verifyResult.cost;

      // Learnings (T034)
      if (currentRunState) {
        currentRunState.currentStage = "learnings";
      }
      const learningsPrompt = buildLearningsPrompt(config, implSpecPath);
      const learningsResult = await runStage(config, learningsPrompt, emit, rlog, runId, cycleNumber, "learnings", implSpecDir);
      cycleCost += learningsResult.cost;

      // Success — reset failure counters
      if (implSpecDir) {
        const record = getOrCreateFailureRecord(implSpecDir);
        record.implFailures = 0;
        record.replanFailures = 0;
        persistFailure(implSpecDir);
      }

      featuresCompleted.push(featureName ?? implSpecDir);

    } catch (err) {
      // ── Stage failure handling (T040) ──
      const msg = err instanceof Error ? err.message : String(err);
      rlog.run("ERROR", `runLoop: cycle ${cycleNumber} failed: ${msg}`);

      if (specDir) {
        const record = getOrCreateFailureRecord(specDir);
        // Determine which counter to increment based on the current stage
        const currentStage = currentRunState?.currentStage;
        if (currentStage === "plan" || currentStage === "tasks") {
          record.replanFailures++;
        } else {
          record.implFailures++;
        }
        persistFailure(specDir);
      }

      emit({ type: "error", message: `Cycle ${cycleNumber} failed: ${msg}` });
    }

    cumulativeCost += cycleCost;
    cyclesCompleted++;

    updateLoopCycle(cycleId, "completed", cycleCost, Date.now() - cycleStart);
    updateRunLoopsCompleted(runId, cyclesCompleted);

    if (currentRunState) {
      currentRunState.loopsCompleted = cyclesCompleted;
    }

    emit({
      type: "loop_cycle_completed",
      runId,
      cycleNumber,
      decision: decisionType,
      featureName,
      specDir,
      costUsd: cycleCost,
    });

    // Check termination conditions after cycle
    if (abortController?.signal.aborted) break;
    if (config.maxBudgetUsd && cumulativeCost >= config.maxBudgetUsd) break;
    if (config.maxLoopCycles && cyclesCompleted >= config.maxLoopCycles) break;
  }

  // ── Termination (T042) ──
  let terminationReason: TerminationReason = "gaps_complete";
  if (abortController?.signal.aborted) {
    terminationReason = "user_abort";
  } else if (config.maxBudgetUsd && cumulativeCost >= config.maxBudgetUsd) {
    terminationReason = "budget_exceeded";
  } else if (config.maxLoopCycles && cyclesCompleted >= config.maxLoopCycles) {
    terminationReason = "max_cycles_reached";
  }

  const termination: LoopTermination = {
    reason: terminationReason,
    cyclesCompleted,
    totalCostUsd: cumulativeCost,
    totalDurationMs: 0, // Will be set by caller
    featuresCompleted,
    featuresSkipped,
  };

  emit({ type: "loop_terminated", runId, termination });
  rlog.run("INFO", `runLoop: terminated — reason=${terminationReason}, cycles=${cyclesCompleted}, features=${featuresCompleted.length}/${featuresSkipped.length}`);

  return { phasesCompleted: cyclesCompleted, totalCost: cumulativeCost };
}

export function stopRun(): void {
  if (abortController) {
    abortController.abort();
  }
}

export function isRunning(): boolean {
  return abortController !== null;
}
