import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8" }).trim();
}

export function getCurrentBranch(projectDir: string): string {
  return exec("git rev-parse --abbrev-ref HEAD", projectDir);
}

export function createBranch(
  projectDir: string,
  mode: "plan" | "build"
): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortId = crypto.randomUUID().slice(0, 6);
  const branchName = `ralph/${mode}/${date}-${shortId}`;

  exec(`git checkout -b ${branchName}`, projectDir);
  return branchName;
}

export function createPullRequest(
  projectDir: string,
  branchName: string,
  baseBranch: string,
  mode: "plan" | "build",
  phasesCompleted: number,
  totalCost: number,
  totalDurationMs: number
): string | null {
  // Push the branch to remote
  try {
    exec(`git push -u origin ${branchName}`, projectDir);
  } catch {
    return null;
  }

  // Gather commit log for the PR body
  const commitLog = exec(
    `git log ${baseBranch}..${branchName} --pretty=format:"- %s" --reverse`,
    projectDir
  );

  const diffStat = exec(
    `git diff --stat ${baseBranch}..${branchName}`,
    projectDir
  );

  const durationMin = (totalDurationMs / 60_000).toFixed(1);
  const costStr = totalCost > 0 ? `$${totalCost.toFixed(2)}` : "n/a";

  const title = `Ralph ${mode}: ${phasesCompleted} phase${phasesCompleted === 1 ? "" : "s"} completed`;

  const body = `## Summary

Automated ${mode} run by Ralph orchestrator.

- **Mode**: ${mode}
- **Phases completed**: ${phasesCompleted}
- **Duration**: ${durationMin} min
- **Cost**: ${costStr}

## Commits

${commitLog || "_No commits were made._"}

## Diff stats

\`\`\`
${diffStat || "No changes."}
\`\`\`
`;

  // Write body to a temp file to avoid shell escaping issues
  const bodyFile = path.join(os.tmpdir(), `ralph-pr-body-${crypto.randomUUID()}.md`);
  try {
    fs.writeFileSync(bodyFile, body, "utf-8");
    const prUrl = exec(
      `gh pr create --base ${baseBranch} --head ${branchName} --title "${title}" --body-file "${bodyFile}"`,
      projectDir
    );
    return prUrl;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(bodyFile); } catch { /* ignore */ }
  }
}
