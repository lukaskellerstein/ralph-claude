import { useCallback, useEffect, useState } from "react";

export function usePauseAfterStage(projectDir: string | null): {
  pauseAfterStage: boolean;
  setPauseAfterStage: (on: boolean) => Promise<void>;
} {
  const [pauseAfterStage, setLocal] = useState(false);

  useEffect(() => {
    if (!projectDir) {
      setLocal(false);
      return;
    }
    window.dexAPI
      .getProjectState(projectDir)
      .then((s) => setLocal(Boolean(s?.ui?.pauseAfterStage)))
      .catch(() => setLocal(false));
  }, [projectDir]);

  const setPauseAfterStage = useCallback(
    async (on: boolean) => {
      if (!projectDir) return;
      await window.dexAPI.checkpoints.setPauseAfterStage(projectDir, on);
      setLocal(on);
    },
    [projectDir],
  );

  return { pauseAfterStage, setPauseAfterStage };
}
