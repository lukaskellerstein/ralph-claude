import { ipcMain } from "electron";
import {
  listRuns,
  getRun,
  getLatestProjectRun,
  getStepsForPhase,
  getSubagentsForPhase,
  getLatestPhaseTrace,
  getSpecPhaseStats,
  getSpecAggregateStats,
} from "../../core/database.js";

export function registerHistoryHandlers(): void {
  ipcMain.handle("history:list-runs", (_event, limit?: number) => {
    return listRuns(limit);
  });

  ipcMain.handle("history:get-run", (_event, runId: string) => {
    return getRun(runId);
  });

  ipcMain.handle("history:get-latest-project-run", (_event, projectDir: string) => {
    return getLatestProjectRun(projectDir);
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

  ipcMain.handle(
    "history:get-spec-phase-stats",
    (_event, projectDir: string, specDir: string) => {
      return getSpecPhaseStats(projectDir, specDir);
    }
  );

  ipcMain.handle(
    "history:get-spec-aggregate-stats",
    (_event, projectDir: string, specDir: string) => {
      return getSpecAggregateStats(projectDir, specDir);
    }
  );
}
