import { ipcRenderer } from "electron";

export const checkpointsApi = {
  listTimeline: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:listTimeline", projectDir),
  checkIsRepo: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:checkIsRepo", projectDir) as Promise<boolean>,
  checkIdentity: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:checkIdentity", projectDir),
  estimateVariantCost: (
    projectDir: string,
    step: string,
    variantCount: number,
  ) =>
    ipcRenderer.invoke(
      "checkpoints:estimateVariantCost",
      projectDir,
      step,
      variantCount,
    ),
  readPendingVariantGroups: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:readPendingVariantGroups", projectDir),
  promote: (projectDir: string, tag: string, sha: string) =>
    ipcRenderer.invoke("checkpoints:promote", projectDir, tag, sha),
  unmark: (projectDir: string, sha: string) =>
    ipcRenderer.invoke("checkpoints:unmark", projectDir, sha),
  unselect: (projectDir: string, branchName: string) =>
    ipcRenderer.invoke("checkpoints:unselect", projectDir, branchName),
  syncStateFromHead: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:syncStateFromHead", projectDir),
  jumpTo: (
    projectDir: string,
    targetSha: string,
    options?: { force?: "save" | "discard" },
  ) =>
    ipcRenderer.invoke("checkpoints:jumpTo", projectDir, targetSha, options),
  spawnVariants: (
    projectDir: string,
    request: {
      fromCheckpoint: string;
      variantLetters: string[];
      step: string;
    },
  ) => ipcRenderer.invoke("checkpoints:spawnVariants", projectDir, request),
  cleanupVariantGroup: (
    projectDir: string,
    groupId: string,
    kind: "keep" | "discard",
    pickedLetter?: string,
  ) =>
    ipcRenderer.invoke(
      "checkpoints:cleanupVariantGroup",
      projectDir,
      groupId,
      kind,
      pickedLetter,
    ),
  initRepo: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:initRepo", projectDir),
  setIdentity: (projectDir: string, name: string, email: string) =>
    ipcRenderer.invoke("checkpoints:setIdentity", projectDir, name, email),
  compareAttempts: (
    projectDir: string,
    branchA: string,
    branchB: string,
    step: string | null,
  ) =>
    ipcRenderer.invoke(
      "checkpoints:compareAttempts",
      projectDir,
      branchA,
      branchB,
      step,
    ),
};
