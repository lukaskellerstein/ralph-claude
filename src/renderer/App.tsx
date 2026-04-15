import { useCallback, useEffect, useState } from "react";
import type { Phase, Task, RunConfig } from "../core/types.js";
import { AgentStepList } from "./components/agent-trace/AgentStepList.js";
import { SubagentList } from "./components/agent-trace/SubagentList.js";
import { AppShell } from "./components/layout/AppShell.js";
import { ProjectOverview } from "./components/project-overview/ProjectOverview.js";
import { PhaseView } from "./components/task-board/PhaseView.js";
import { ProgressBar } from "./components/task-board/ProgressBar.js";
import { useOrchestrator } from "./hooks/useOrchestrator.js";
import { useProject } from "./hooks/useProject.js";

type View = "overview" | "tasks" | "trace";

export default function App() {
  const project = useProject();
  const orchestrator = useOrchestrator();
  const [currentView, setCurrentView] = useState<View>("overview");

  // Auto-refresh phases when a phase completes or tasks change mid-phase
  useEffect(() => {
    orchestrator.onPhaseCompleted(() => project.refreshProject());
    orchestrator.onTasksUpdated((phases) => {
      project.setPhases(phases);
      if (orchestrator.activeSpecDir) {
        project.updateSpecSummary(orchestrator.activeSpecDir, phases);
      }
    });
  });

  const handleSelectSpec = (spec: string) => {
    project.selectSpec(spec);
    setCurrentView("tasks");
  };

  const handleDeselectSpec = () => {
    project.deselectSpec();
    setCurrentView("overview");
  };

  const handleStart = (partial: Partial<RunConfig>) => {
    const projectDir = partial.projectDir ?? project.projectDir!;

    // Default: run all unfinished specs
    const firstUnfinished = project.specSummaries.find(
      (s) => s.doneTasks < s.totalTasks
    );
    if (!firstUnfinished) return;

    const config: RunConfig = {
      projectDir,
      specDir: firstUnfinished.name,
      mode: "build",
      model: "claude-opus-4-6",
      maxIterations: 20,
      maxTurns: 75,
      phases: "all",
      runAllSpecs: true,
    };
    window.ralphAPI.startRun(config);
  };

  const handleStartSpec = (specName: string) => {
    if (!project.projectDir || orchestrator.isRunning) return;

    const config: RunConfig = {
      projectDir: project.projectDir,
      specDir: specName,
      mode: "build",
      model: "claude-opus-4-6",
      maxIterations: 20,
      maxTurns: 75,
      phases: "all",
    };
    window.ralphAPI.startRun(config);
  };

  const handleViewPhaseTrace = useCallback(
    async (phase: Phase) => {
      // If this is the actively running phase, just switch to trace view
      // — liveSteps already has the streaming data
      if (orchestrator.isRunning && orchestrator.currentPhase?.number === phase.number) {
        setCurrentView("trace");
        return;
      }
      if (!project.projectDir || !project.selectedSpec) return;
      const found = await orchestrator.loadPhaseTrace(
        project.projectDir,
        project.selectedSpec,
        phase
      );
      if (found) {
        setCurrentView("trace");
      }
    },
    [project.projectDir, project.selectedSpec, orchestrator.loadPhaseTrace, orchestrator.isRunning, orchestrator.currentPhase]
  );

  let content;

  if (!project.projectDir) {
    content = (
      <div
        style={{
          textAlign: "center",
          paddingTop: 80,
          color: "var(--foreground-dim)",
        }}
      >
        Open a project to get started
      </div>
    );
  } else if (currentView === "trace") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <AgentStepList
          steps={orchestrator.liveSteps}
          isRunning={orchestrator.isRunning}
          runId={orchestrator.currentRunId ?? undefined}
          phaseTraceId={orchestrator.currentPhaseTraceId ?? undefined}
          phaseLabel={
            orchestrator.currentPhase
              ? `Phase ${orchestrator.currentPhase.number}: ${orchestrator.currentPhase.name}`
              : undefined
          }
        />
        <SubagentList subagents={orchestrator.subagents} />
      </div>
    );
  } else if (currentView === "overview" || !project.selectedSpec) {
    content = (
      <ProjectOverview
        specSummaries={project.specSummaries}
        onSelectSpec={handleSelectSpec}
        onStartSpec={handleStartSpec}
        isRunning={orchestrator.isRunning}
        activeSpecDir={orchestrator.activeSpecDir}
        activePhase={orchestrator.currentPhase}
        activeTask={orchestrator.activeTask}
      />
    );
  } else {
    content = (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {project.phases.length > 0 ? (
            project.phases.map((phase) => (
              <PhaseView
                key={phase.number}
                phase={phase}
                isRunning={orchestrator.isRunning && !orchestrator.viewingHistorical && orchestrator.currentPhase?.number === phase.number && orchestrator.activeSpecDir === project.selectedSpec}
                isSelected={!orchestrator.isRunning && orchestrator.currentPhase?.number === phase.number && orchestrator.activeSpecDir === project.selectedSpec}
                onViewTrace={handleViewPhaseTrace}
              />
            ))
          ) : (
            <div
              style={{
                textAlign: "center",
                paddingTop: 80,
                color: "var(--foreground-dim)",
              }}
            >
              No phases found in tasks.md
            </div>
          )}
        </div>

        {project.phases.length > 0 && (
          <ProgressBar
            phases={project.phases}
            totalCost={orchestrator.totalCost}
            totalDuration={orchestrator.totalDuration}
          />
        )}
      </div>
    );
  }

  return (
    <AppShell
      projectDir={project.projectDir}
      aggregate={project.aggregate}
      isRunning={orchestrator.isRunning}
      onOpenProject={project.openProject}
      onRefreshProject={project.refreshProject}
      onDeselectSpec={handleDeselectSpec}
      onStart={handleStart}
      onStop={() => window.ralphAPI.stopRun()}
      content={content}
    />
  );
}
