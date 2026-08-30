import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import type { TriageRpc } from "@/lib/triage-store";
import type { MachineOption, ProjectOption, Stage } from "@/lib/triage-types";

import { CreateTaskDialog } from "./create-task-dialog";

export type TaskFilter = "all" | "live" | "pending" | "attention" | "settled";

export interface BoardToolbarProps {
  projects: ProjectOption[];
  machines: MachineOption[];
  stages: Stage[];
  projectFilter: string;
  machineFilter: string;
  taskFilter: TaskFilter;
  counts: Record<TaskFilter, number>;
  defaultProjectId: string | null;
  rpc: TriageRpc;
  onProjectFilterChange: (value: string) => void;
  onMachineFilterChange: (value: string) => void;
  onTaskFilterChange: (value: TaskFilter) => void;
  onCreated: () => Promise<void>;
}

/**
 * Scope on the left, lens and creation on the right. The machine picker is
 * omitted entirely when there is only one machine to choose.
 */
function BoardToolbar({
  projects,
  machines,
  stages,
  projectFilter,
  machineFilter,
  taskFilter,
  counts,
  defaultProjectId,
  rpc,
  onProjectFilterChange,
  onMachineFilterChange,
  onTaskFilterChange,
  onCreated,
}: BoardToolbarProps) {
  const personalProject = projects.find((project) => project.kind === "personal");
  const standardProjects = projects.filter((project) => project.kind === "standard");
  const showMachines = machines.length > 1;

  const filterOptions: SegmentedOption<TaskFilter>[] = [
    { value: "all", label: "All", count: counts.all, hint: "Every card on the board" },
    { value: "live", label: "Running", count: counts.live, hint: "An agent is working right now" },
    { value: "pending", label: "Pending", count: counts.pending, hint: "Queued or scheduled" },
    { value: "attention", label: "Needs you", count: counts.attention, hint: "Waiting on a person" },
    { value: "settled", label: "Settled", count: counts.settled, hint: "Resolved cards kept for reference" },
  ];

  return (
    <div className="triage-toolbar">
      <div className="triage-toolbar-group">
        <Select value={projectFilter} onValueChange={onProjectFilterChange}>
          <SelectTrigger className="h-8 w-[172px] gap-2" aria-label="Filter by project">
            <Icon name="Folder" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {personalProject ? (
              <SelectItem value={personalProject.id}>Home (no project)</SelectItem>
            ) : null}
            {standardProjects.length > 0 ? <SelectSeparator /> : null}
            {standardProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showMachines ? (
          <Select value={machineFilter} onValueChange={onMachineFilterChange}>
            <SelectTrigger className="h-8 w-[168px] gap-2" aria-label="Filter by machine">
              <Icon
                name="Laptop"
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All machines</SelectItem>
              <SelectItem value="project-default">Project default</SelectItem>
              <SelectSeparator />
              {machines.map((machine) => (
                <SelectItem key={machine.id} value={machine.id}>
                  {machine.name}
                  {machine.status === "disconnected" ? " · offline" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="triage-toolbar-group justify-end">
        <Segmented
          aria-label="Filter cards"
          size="sm"
          value={taskFilter}
          options={filterOptions}
          onValueChange={onTaskFilterChange}
        />
        <CreateTaskDialog
          stages={stages}
          defaultProjectId={defaultProjectId}
          rpc={rpc}
          onCreated={onCreated}
        />
      </div>
    </div>
  );
}

export { BoardToolbar };
