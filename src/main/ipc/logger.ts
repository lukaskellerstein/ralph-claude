export type IpcLogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface IpcLogger {
  run: (level: IpcLogLevel, msg: string, extra?: unknown) => void;
}

/**
 * Minimal run-logger adapter for IPC-triggered operations.
 * Routes WARN/ERROR through console.warn and INFO/DEBUG through console.info,
 * tagged with the given prefix so log lines are greppable.
 */
export function createIpcLogger(prefix: string): IpcLogger {
  return {
    run: (level, msg, extra) => {
      const tag = `[${prefix}]`;
      if (level === "ERROR" || level === "WARN") {
        console.warn(`${tag} ${level} ${msg}`, extra ?? "");
      } else {
        console.info(`${tag} ${level} ${msg}`, extra ?? "");
      }
    },
  };
}
