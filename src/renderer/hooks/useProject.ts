import { useState } from "react";
import type { Phase } from "../../core/types.js";
import type { PhaseTraceRow, SpecStats } from "../../core/database.js";

export interface SpecSummary {
  name: string;
  phases: Phase[];
  totalTasks: number;
  doneTasks: number;
  completedPhases: number;
  totalPhases: number;
  stats?: SpecStats;
}

/** Map of phaseNumber → latest PhaseTraceRow (for displaying per-phase stats) */
export type PhaseStatsMap = Map<number, PhaseTraceRow>;

export function useProject() {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [specs, setSpecs] = useState<string[]>([]);
  const [specSummaries, setSpecSummaries] = useState<SpecSummary[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseStats, setPhaseStats] = useState<PhaseStatsMap>(new Map());

  const loadSpecs = async (dir: string) => {
    const specList = await window.ralphAPI.listSpecs(dir);
    setSpecs(specList);

    const summaries: SpecSummary[] = [];
    for (const spec of specList) {
      const [parsed, stats] = await Promise.all([
        window.ralphAPI.parseSpec(dir, spec),
        window.ralphAPI.getSpecAggregateStats(dir, spec).catch(() => undefined),
      ]);
      const totalTasks = parsed.reduce((s, p) => s + p.tasks.length, 0);
      const doneTasks = parsed.reduce(
        (s, p) => s + p.tasks.filter((t) => t.status === "done").length,
        0
      );
      summaries.push({
        name: spec,
        phases: parsed,
        totalTasks,
        doneTasks,
        completedPhases: parsed.filter((p) => p.status === "complete").length,
        totalPhases: parsed.length,
        stats,
      });
    }
    setSpecSummaries(summaries);
    return specList;
  };

  const openProject = async () => {
    const dir = await window.ralphAPI.openProject();
    if (dir) {
      setProjectDir(dir);
      setSelectedSpec(null);
      setPhases([]);
      await loadSpecs(dir);
    }
  };

  const refreshProject = async () => {
    if (!projectDir) return;
    const specList = await loadSpecs(projectDir);
    // If the selected spec no longer exists, deselect it
    if (selectedSpec && !specList.includes(selectedSpec)) {
      setSelectedSpec(null);
      setPhases([]);
    } else if (selectedSpec) {
      // Re-parse the selected spec to pick up task changes
      const parsed = await window.ralphAPI.parseSpec(projectDir, selectedSpec);
      setPhases(parsed);
    }
  };

  const selectSpec = async (specName: string) => {
    if (!projectDir) return;
    setSelectedSpec(specName);
    const [parsed, traceRows] = await Promise.all([
      window.ralphAPI.parseSpec(projectDir, specName),
      window.ralphAPI.getSpecPhaseStats(projectDir, specName).catch(() => [] as PhaseTraceRow[]),
    ]);
    setPhases(parsed);
    const statsMap = new Map<number, PhaseTraceRow>();
    for (const row of traceRows) statsMap.set(row.phase_number, row);
    setPhaseStats(statsMap);
  };

  const deselectSpec = () => {
    setSelectedSpec(null);
    setPhases([]);
    setPhaseStats(new Map());
  };

  const updateSpecSummary = (specDir: string, updatedPhases: Phase[]) => {
    setSpecSummaries((prev) =>
      prev.map((s) => {
        if (s.name !== specDir) return s;
        const totalTasks = updatedPhases.reduce((acc, p) => acc + p.tasks.length, 0);
        const doneTasks = updatedPhases.reduce(
          (acc, p) => acc + p.tasks.filter((t) => t.status === "done").length,
          0
        );
        return {
          ...s,
          phases: updatedPhases,
          totalTasks,
          doneTasks,
          completedPhases: updatedPhases.filter((p) => p.status === "complete").length,
          totalPhases: updatedPhases.length,
        };
      })
    );
  };

  // Aggregate stats across all specs
  const aggregate = {
    totalSpecs: specSummaries.length,
    unfinishedSpecs: specSummaries.filter(
      (s) => s.doneTasks < s.totalTasks
    ).length,
    totalPhases: specSummaries.reduce((s, sp) => s + sp.totalPhases, 0),
    incompletePhases: specSummaries.reduce(
      (s, sp) => s + sp.totalPhases - sp.completedPhases,
      0
    ),
    totalTasks: specSummaries.reduce((s, sp) => s + sp.totalTasks, 0),
    doneTasks: specSummaries.reduce((s, sp) => s + sp.doneTasks, 0),
  };

  return {
    projectDir,
    specs,
    specSummaries,
    selectedSpec,
    phases,
    setPhases,
    phaseStats,
    aggregate,
    openProject,
    refreshProject,
    selectSpec,
    deselectSpec,
    updateSpecSummary,
  };
}
