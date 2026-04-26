import { ipcRenderer } from "electron";
import type { RunConfig, OrchestratorEvent } from "../../core/types.js";

export const orchestratorApi = {
  startRun: (config: RunConfig) =>
    ipcRenderer.invoke("orchestrator:start", config),
  stopRun: () => ipcRenderer.invoke("orchestrator:stop"),
  answerQuestion: (requestId: string, answers: Record<string, string>) =>
    ipcRenderer.invoke("orchestrator:answer-question", requestId, answers),
  getProjectState: (dir: string) =>
    ipcRenderer.invoke("orchestrator:getProjectState", dir),
  getRunState: () =>
    ipcRenderer.invoke("orchestrator:getRunState") as Promise<{
      runId: string;
      projectDir: string;
      specDir: string;
      mode: string;
      model: string;
      agentRunId: string;
      taskPhaseNumber: number;
      taskPhaseName: string;
      currentCycle?: number;
      currentStep?: string;
      isClarifying?: boolean;
      cyclesCompleted?: number;
    } | null>,

  onOrchestratorEvent: (cb: (event: OrchestratorEvent) => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      data: OrchestratorEvent,
    ) => cb(data);
    ipcRenderer.on("orchestrator:event", handler);
    return () => ipcRenderer.removeListener("orchestrator:event", handler);
  },
};
