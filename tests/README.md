# Tests

Standalone diagnostic scripts for verifying Claude Agent SDK behavior. No test framework — each script is run directly with `tsx`.

## Prerequisites

```bash
npm install
```

Ensure `ANTHROPIC_API_KEY` is set in your environment (the Agent SDK needs it to spawn agents).

## Running Tests

### Agent Init Diagnostics

Spawns a Claude Code agent via the SDK and inspects the system init message to verify what tools, skills, plugins, agents, and slash commands are available. Then sends a prompt to confirm the Skill tool can be invoked.

```bash
npx tsx tests/test-agent-init.ts [project-dir]
```

- `project-dir` — the working directory the agent operates in (defaults to `ralph-claude-ecommerce` sibling repo)
- Uses `claude-opus-4-6` model with `bypassPermissions` mode
- Limited to 3 turns max

**What it validates:**

- System init message is received with expected fields (tools, skills, plugins, MCP servers)
- The `Skill` tool is present in the agent's tool list
- The agent successfully invokes the Skill tool when prompted

**Output sections:**

| Section | Description |
|---|---|
| System Init Message | Dumps skills, plugins, agents, slash commands, MCP servers from the init payload |
| Tool usage tracking | Logs every tool the agent calls during its turns |
| Result | Cost, duration, turn count |
| Validation | PASS/FAIL checks for system init receipt and Skill tool invocation |
