import { acquireStateLock } from "../../core/state.js";

export type LockedError = { ok: false; error: "locked_by_other_instance" };

export async function withLock<T>(
  projectDir: string,
  fn: () => Promise<T> | T,
): Promise<T | LockedError> {
  let release: (() => void) | null = null;
  try {
    release = await acquireStateLock(projectDir);
  } catch {
    return { ok: false, error: "locked_by_other_instance" } as const;
  }
  try {
    return await fn();
  } finally {
    release();
  }
}
