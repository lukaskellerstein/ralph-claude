import { ipcMain, dialog } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseTasksFile } from "../../core/parser.js";

export function registerProjectHandlers(): void {
  ipcMain.handle("project:open", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Project Directory",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    "project:list-specs",
    (_event, projectDir: string) => {
      // Look for specs in common locations
      const candidates = [
        path.join(projectDir, "specs"),
        path.join(projectDir, ".specify", "specs"),
      ];

      for (const specsRoot of candidates) {
        if (fs.existsSync(specsRoot)) {
          const entries = fs.readdirSync(specsRoot, { withFileTypes: true });
          return entries
            .filter((e) => e.isDirectory())
            .filter((e) => {
              const tasksPath = path.join(specsRoot, e.name, "tasks.md");
              return fs.existsSync(tasksPath);
            })
            .map((e) => {
              // Return relative path from project root
              return path.relative(projectDir, path.join(specsRoot, e.name));
            })
            .sort();
        }
      }

      return [];
    }
  );

  ipcMain.handle(
    "project:parse-spec",
    (_event, projectDir: string, specDir: string) => {
      return parseTasksFile(projectDir, specDir);
    }
  );
}
