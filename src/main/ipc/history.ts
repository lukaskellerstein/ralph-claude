import { ipcMain } from "electron";
import {
  listRuns,
  getRun,
  getStepsForPhase,
  getSubagentsForPhase,
  getLatestPhaseTrace,
} from "../../core/database.js";

export function registerHistoryHandlers(): void {
  ipcMain.handle("history:list-runs", (_event, limit?: number) => {
    return listRuns(limit);
  });

  ipcMain.handle("history:get-run", (_event, runId: string) => {
    return getRun(runId);
  });

  ipcMain.handle(
    "history:get-phase-steps",
    (_event, phaseTraceId: string) => {
      return getStepsForPhase(phaseTraceId);
    }
  );

  ipcMain.handle(
    "history:get-phase-subagents",
    (_event, phaseTraceId: string) => {
      return getSubagentsForPhase(phaseTraceId);
    }
  );

  ipcMain.handle(
    "history:get-latest-phase-trace",
    (_event, projectDir: string, specDir: string, phaseNumber: number) => {
      return getLatestPhaseTrace(projectDir, specDir, phaseNumber);
    }
  );
}
