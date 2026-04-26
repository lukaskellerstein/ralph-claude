import { ipcRenderer } from "electron";
import type { DexJsonShape } from "../../core/agent-profile.js";

export const profilesApi = {
  list: (projectDir: string) => ipcRenderer.invoke("profiles:list", projectDir),
  saveDexJson: (projectDir: string, name: string, dexJson: DexJsonShape) =>
    ipcRenderer.invoke("profiles:saveDexJson", projectDir, name, dexJson),
};
