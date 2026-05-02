import { useCallback, useState } from "react";
import { useTimeline } from "./hooks/useTimeline";
import { GoBackConfirm } from "./GoBackConfirm";
import { TimelineGraph } from "./TimelineGraph";
import { checkpointService } from "../../services/checkpointService.js";

interface Props {
  projectDir: string;
  /** Disabled: no git repo / no identity. */
  disabled?: boolean;
  disabledReason?: string;
}

interface DirtyEnvelope {
  /** SHA the user originally wanted to jump to. The save/discard retry uses it. */
  targetSha: string;
  files: string[];
}

/**
 * 010 — full-width Timeline canvas. Single-click on a node calls jumpTo.
 * No side detail panel, no bottom past-attempts list.
 */
export function TimelinePanel({
  projectDir,
  disabled,
  disabledReason,
}: Props) {
  const { snapshot, refresh } = useTimeline(projectDir);
  const [dirty, setDirty] = useState<DirtyEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);

  const handleBranchFocus = useCallback((branch: string) => {
    setFocusedBranch((prev) => (prev === branch ? null : branch));
  }, []);

  const performJump = useCallback(
    async (targetSha: string, force?: "save" | "discard") => {
      setError(null);
      const r = await checkpointService.jumpTo(
        projectDir,
        targetSha,
        force ? { force } : undefined,
      );
      if (r.ok) {
        if (r.action !== "noop") {
          await refresh();
        }
        return true;
      }
      if (r.error === "dirty_working_tree") {
        setDirty({ targetSha, files: (r as { files: string[] }).files });
        return false;
      }
      if (r.error === "locked_by_other_instance") {
        setError("Another Dex instance holds the project lock — try again in a moment.");
        return false;
      }
      const detail =
        "message" in r && typeof (r as { message?: string }).message === "string"
          ? (r as { message: string }).message
          : r.error;
      setError(`Jump failed: ${detail}`);
      return false;
    },
    [projectDir, refresh],
  );

  const handleJump = useCallback((sha: string) => performJump(sha), [performJump]);

  const handleUnselect = useCallback(
    async (branchName: string) => {
      setError(null);
      const r = await checkpointService.unselect(projectDir, branchName);
      if (!("ok" in r) || !r.ok) {
        setError(`Unselect failed: ${("error" in r && r.error) || "unknown"}`);
        return;
      }
      await refresh();
    },
    [projectDir, refresh],
  );

  if (disabled) {
    return (
      <div
        style={{
          padding: 12,
          color: "var(--foreground-muted)",
          fontSize: 12,
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--surface)",
        }}
      >
        {disabledReason ?? "Timeline disabled."}
      </div>
    );
  }

  // headSha — try to derive from the last entry of selectedPath, else from
  // the starting-point if no commits exist yet. The graph uses this to
  // emphasize the current HEAD's node.
  const headSha =
    snapshot.selectedPath.length > 0
      ? snapshot.selectedPath[snapshot.selectedPath.length - 1]
      : (snapshot.startingPoint?.sha ?? null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1 }}>
      {error && (
        <div
          role="alert"
          style={{
            padding: 8,
            color: "var(--status-error)",
            border: "1px solid var(--status-error)",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
      <TimelineGraph
        snapshot={snapshot}
        onJumpTo={handleJump}
        headSha={headSha}
        onUnselect={handleUnselect}
        focusedBranch={focusedBranch}
        onBranchFocus={handleBranchFocus}
      />
      {dirty && (
        <GoBackConfirm
          tag={`commit ${dirty.targetSha.slice(0, 7)}`}
          files={dirty.files}
          onCancel={() => setDirty(null)}
          onChoose={async (action) => {
            const target = dirty.targetSha;
            setDirty(null);
            await performJump(target, action);
          }}
        />
      )}
    </div>
  );
}
