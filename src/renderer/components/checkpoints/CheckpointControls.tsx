import { useEffect, useState } from "react";
import { TimelinePanel } from "./TimelinePanel";
import { RecBadge } from "./RecBadge";
import { useRecordMode } from "./hooks/useRecordMode";
import { usePauseAfterStage } from "./hooks/usePauseAfterStage";
import { TryNWaysModal } from "./TryNWaysModal";
import { AttemptCompareModal } from "./AttemptCompareModal";
import type { LoopStageType } from "../../../core/types.js";
import { STAGE_ORDER_RENDERER } from "./stageOrder";

interface Props {
  projectDir: string;
}

/**
 * Panel mounted under LoopDashboard that contains:
 *   - Record + Pause-after-stage toggles (plus visible REC badge)
 *   - Collapsible Timeline (graph + list + detail + go-back flow)
 *   - Variant spawn flow triggered from NodeDetailPanel
 *   - Attempt compare flow triggered from NodeDetailPanel
 */
export function CheckpointControls({ projectDir }: Props) {
  const { recordMode, setRecordMode } = useRecordMode(projectDir);
  const { pauseAfterStage, setPauseAfterStage } = usePauseAfterStage(projectDir);

  const [repoReady, setRepoReady] = useState(true);
  const [tryNWaysTag, setTryNWaysTag] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] = useState<null | {
    a: string;
    b: string;
    stage: LoopStageType | null;
  }>(null);
  const [compareSourceA, setCompareSourceA] = useState<string | null>(null);

  useEffect(() => {
    window.dexAPI.checkpoints
      .checkIsRepo(projectDir)
      .then(setRepoReady)
      .catch(() => setRepoReady(false));
  }, [projectDir]);

  const handleTryNWays = (tag: string) => setTryNWaysTag(tag);

  const handleConfirmSpawn = async (n: number) => {
    if (!tryNWaysTag) return;
    // Parse stage from tag to infer the next stage
    const m = tryNWaysTag.match(/^checkpoint\/(?:cycle-(\d+)-)?after-(.+)$/);
    const parsedStage = (m ? (m[2] as string).replaceAll("-", "_") : "plan") as LoopStageType;
    const nextStage = nextStageOf(parsedStage);
    const letters = ["a", "b", "c", "d", "e"].slice(0, n);
    const r = await window.dexAPI.checkpoints.spawnVariants(projectDir, {
      fromCheckpoint: tryNWaysTag,
      variantLetters: letters,
      stage: nextStage,
    });
    setTryNWaysTag(null);
    if (!r.ok) {
      console.warn("[checkpoint-controls] spawnVariants failed", r.error);
    }
  };

  // Two-step compare: click Compare on an attempt → remember as A →
  // next click Compare on another attempt → open modal
  const handleCompareStart = (branch: string) => {
    if (!compareSourceA) {
      setCompareSourceA(branch);
      return;
    }
    setCompareTarget({ a: compareSourceA, b: branch, stage: null });
    setCompareSourceA(null);
  };

  return (
    <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={recordMode}
            onChange={(e) => setRecordMode(e.target.checked)}
          />
          Record mode
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={pauseAfterStage}
            onChange={(e) => setPauseAfterStage(e.target.checked)}
          />
          Pause after each stage
        </label>
        <RecBadge recordMode={recordMode} />
        {compareSourceA && (
          <div style={{ fontSize: 11, color: "var(--foreground-muted)" }}>
            Comparing from <code>{compareSourceA}</code> — click Compare on another attempt…
            <button
              onClick={() => setCompareSourceA(null)}
              style={{
                marginLeft: 6,
                background: "transparent",
                border: "none",
                color: "var(--foreground-dim)",
                cursor: "pointer",
              }}
            >
              cancel
            </button>
          </div>
        )}
      </div>
      <TimelinePanel
        projectDir={projectDir}
        disabled={!repoReady}
        disabledReason={!repoReady ? "Initialize version control to enable the timeline." : undefined}
        onTryNWays={handleTryNWays}
        onCompareStart={handleCompareStart}
        canTryNWays
      />
      {tryNWaysTag && (
        <TryNWaysModal
          projectDir={projectDir}
          tag={tryNWaysTag}
          nextStage={nextStageOf(parseStageFromTag(tryNWaysTag))}
          onCancel={() => setTryNWaysTag(null)}
          onConfirm={handleConfirmSpawn}
        />
      )}
      {compareTarget && (
        <AttemptCompareModal
          projectDir={projectDir}
          branchA={compareTarget.a}
          branchB={compareTarget.b}
          stage={compareTarget.stage}
          onClose={() => setCompareTarget(null)}
        />
      )}
    </div>
  );
}

function parseStageFromTag(tag: string): LoopStageType {
  const m = tag.match(/^checkpoint\/(?:cycle-\d+-)?after-(.+)$/);
  if (!m) return "plan";
  return m[1].replaceAll("-", "_") as LoopStageType;
}

function nextStageOf(stage: LoopStageType): LoopStageType {
  const idx = STAGE_ORDER_RENDERER.indexOf(stage);
  if (idx < 0 || idx >= STAGE_ORDER_RENDERER.length - 1) return stage;
  return STAGE_ORDER_RENDERER[idx + 1];
}
