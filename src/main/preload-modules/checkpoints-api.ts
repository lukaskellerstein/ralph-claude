import { ipcRenderer } from "electron";

export const checkpointsApi = {
  listTimeline: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:listTimeline", projectDir),
  checkIsRepo: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:checkIsRepo", projectDir) as Promise<boolean>,
  checkIdentity: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:checkIdentity", projectDir),
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
  initRepo: (projectDir: string) =>
    ipcRenderer.invoke("checkpoints:initRepo", projectDir),
  setIdentity: (projectDir: string, name: string, email: string) =>
    ipcRenderer.invoke("checkpoints:setIdentity", projectDir, name, email),
};
