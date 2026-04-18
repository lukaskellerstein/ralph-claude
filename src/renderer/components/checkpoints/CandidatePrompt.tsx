import { CheckpointModal } from "./Modal";
import { StageSummary } from "./StageSummary";
import type { LoopStageType } from "../../../core/types.js";

interface Props {
  stage: LoopStageType;
  cycleNumber: number;
  featureSlug?: string | null;
  checkpointTag: string;
  candidateSha: string;
  onKeep: () => void;
  onTryAgain: () => void;
  onTryNWays?: () => void;
  onDismiss: () => void;
}

/**
 * Opens after a step-mode pause. Shows the stage summary + the three primary
 * actions. Dismiss resumes the run as-is (equivalent to Keep at this stage in
 * the spec, but without writing a new tag — useful for read-through).
 */
export function CandidatePrompt({
  stage,
  cycleNumber,
  featureSlug,
  checkpointTag,
  candidateSha,
  onKeep,
  onTryAgain,
  onTryNWays,
  onDismiss,
}: Props) {
  return (
    <CheckpointModal
      title={`Stage complete: ${stage}`}
      onClose={onDismiss}
      footer={
        <>
          <button className="btn-secondary" onClick={onTryAgain}>
            Try again
          </button>
          {onTryNWays && (
            <button className="btn-secondary" onClick={onTryNWays}>
              Try N ways
            </button>
          )}
          <button className="btn-primary" onClick={onKeep}>
            Keep this
          </button>
        </>
      }
    >
      <StageSummary stage={stage} cycleNumber={cycleNumber} featureSlug={featureSlug} />
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--foreground-dim)", fontFamily: "var(--font-mono)" }}>
        candidate: {checkpointTag}
        <br />
        sha: {candidateSha.slice(0, 7)}
      </div>
    </CheckpointModal>
  );
}
