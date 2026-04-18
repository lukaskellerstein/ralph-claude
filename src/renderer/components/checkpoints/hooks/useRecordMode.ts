import { useCallback, useEffect, useState } from "react";

export function useRecordMode(projectDir: string | null): {
  recordMode: boolean;
  setRecordMode: (on: boolean) => Promise<void>;
} {
  const [recordMode, setLocal] = useState(false);

  useEffect(() => {
    if (!projectDir) {
      setLocal(false);
      return;
    }
    window.dexAPI
      .getProjectState(projectDir)
      .then((s) => setLocal(Boolean(s?.ui?.recordMode)))
      .catch(() => setLocal(false));
  }, [projectDir]);

  const setRecordMode = useCallback(
    async (on: boolean) => {
      if (!projectDir) return;
      await window.dexAPI.checkpoints.setRecordMode(projectDir, on);
      setLocal(on);
    },
    [projectDir],
  );

  return { recordMode, setRecordMode };
}
