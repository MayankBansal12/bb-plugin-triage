import { providerLabel } from "@/lib/vibe-kanban-format";
import { LabelBadge } from "./task-metadata";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KanbanRpc } from "@/lib/vibe-kanban-store";
import type { Label, MachineOption, ProjectOption, Stage } from "@/lib/vibe-kanban-types";

import { TaskComposerDialog } from "./task-composer-dialog";

export type TaskFilter = "all" | "live" | "unread" | "scheduled" | "settled";

export interface BoardToolbarProps {
  projects: ProjectOption[];
  labels: Label[];
  agents: string[];
  labelFilter: string[];
  agentFilter: string;
  query: string;
  sortBy: "updated" | "priority";
  onLabelFilterChange: (value: string[]) => void;
  onAgentFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: "updated" | "priority") => void;
  machines: MachineOption[];
  stages: Stage[];
  projectFilter: string;
  machineFilter: string;
  taskFilter: TaskFilter;
  counts: Record<TaskFilter, number>;
  defaultProjectId: string | null;
  rpc: KanbanRpc;
  onProjectFilterChange: (value: string) => void;
  onMachineFilterChange: (value: string) => void;
  onTaskFilterChange: (value: TaskFilter) => void;
  onCreated: () => Promise<void>;
}

/** Keep navigation and creation visible; disclose secondary filters on demand. */
function BoardToolbar({
  projects, labels, agents, labelFilter, agentFilter, query, sortBy, onLabelFilterChange, onAgentFilterChange, onQueryChange, onSortChange,
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
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const projectOptions = [
    { id: "all", name: "All projects" },
    ...projects.map((project) => ({ id: project.id, name: project.kind === "personal" ? "Personal" : project.name })),
  ];
  const matches = projectOptions.filter((project) => project.name.toLowerCase().includes(projectQuery.trim().toLowerCase()));
  const showMachines = machines.length > 1;

  const filterOptions: { value: TaskFilter; label: string; count: number; hint: string }[] = [
    { value: "all", label: "Board", count: counts.all, hint: "Every card on the board" },
    { value: "live", label: "Running", count: counts.live, hint: "An agent is working right now" },
    { value: "unread", label: "Unread", count: counts.unread, hint: "Cards with updates you have not opened" },
    { value: "scheduled", label: "Scheduled", count: counts.scheduled, hint: "Tasks set to start later" },
    { value: "settled", label: "Archived", count: counts.settled, hint: "Resolved cards kept for reference" },
  ];

  const filterCount = labelFilter.length + Number(agentFilter !== "all") + Number(machineFilter !== "all");
  const hasRefinements = filterCount > 0 || sortBy !== "updated";
  const clearFilters = () => { onLabelFilterChange([]); onAgentFilterChange("all"); onMachineFilterChange("all"); onSortChange("updated"); };

  return (
    <div className="vibe-kanban-toolbar">
      <div className="vibe-kanban-toolbar-main">
        <Popover open={projectPickerOpen} onOpenChange={(open) => { setProjectPickerOpen(open); if (!open) setProjectQuery(""); }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="vibe-kanban-project-picker h-8 justify-between gap-2" aria-label="Filter by project">
              <Icon name="Folder" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{projectOptions.find((project) => project.id === projectFilter)?.name ?? "All projects"}</span>
              <Icon name="ChevronDown" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2" mobileTitle="Projects">
            <Input className="focus-visible:ring-0" placeholder="Search projects…" aria-label="Search projects" value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("[role=option]")?.focus();
                }
              }} />
            <div role="listbox" aria-label="Projects" className="mt-2 max-h-64 overflow-y-auto"
              onKeyDown={(event) => {
                const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]"));
                const index = options.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1)
                  : event.key === "ArrowUp" ? Math.max(index - 1, 0)
                  : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
                if (next !== null) { event.preventDefault(); options[next]?.focus(); }
              }}>
              {matches.map((project) => (
                <button key={project.id} type="button" role="option" aria-selected={project.id === projectFilter}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none"
                  onClick={() => { onProjectFilterChange(project.id); setProjectPickerOpen(false); setProjectQuery(""); }}>
                  <span className="truncate">{project.name}</span>
                  {project.id === projectFilter ? <Icon name="Check" className="size-4 shrink-0" aria-hidden="true" /> : null}
                </button>
              ))}
              {matches.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">No projects found.</p> : null}
            </div>
          </PopoverContent>
        </Popover>
        <Select value={taskFilter} onValueChange={(value) => onTaskFilterChange(value as TaskFilter)}>
          <SelectTrigger className="vibe-kanban-view-picker h-8" aria-label="Board view">
            <span className="flex min-w-0 items-center gap-2"><span className="truncate">{filterOptions.find((option) => option.value === taskFilter)?.label}</span><span className="vibe-kanban-view-count">{counts[taskFilter]}</span></span>
          </SelectTrigger>
          <SelectContent>{filterOptions.map((option) => <SelectItem key={option.value} value={option.value} title={option.hint}>{option.label} · {option.count}</SelectItem>)}</SelectContent>
        </Select>
        <div className="vibe-kanban-search">
          <Icon name="Search" className="size-3.5" aria-hidden="true" />
          <Input aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={(event) => onQueryChange(event.target.value)} />
          {query && <button type="button" aria-label="Clear search" onClick={() => onQueryChange("")}><Icon name="X" className="size-3" /></button>}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="vibe-kanban-filter-button h-8 gap-1.5" data-active={hasRefinements ? "" : undefined} aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"}>
              <Icon name="SlidersHorizontal" className="size-3.5" aria-hidden="true" />Filters
              {filterCount > 0 && <span className="vibe-kanban-view-count">{filterCount}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="vibe-kanban-filter-popover w-72 p-3" mobileTitle="Filters and sorting">
            <div className="flex items-center justify-between"><span className="text-sm font-medium">Filters</span>{hasRefinements && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>Reset</Button>}</div>
            {showMachines && <div className="vibe-kanban-filter-field">
              <span>Machine</span>
              <Select value={machineFilter} onValueChange={onMachineFilterChange}>
                <SelectTrigger className="h-8 w-full" aria-label="Filter by machine"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All machines</SelectItem><SelectSeparator />{machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.name}{machine.status === "disconnected" ? " · offline" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            <div className="vibe-kanban-filter-field">
              <span>Agent</span>
              <Select value={agentFilter} onValueChange={onAgentFilterChange}>
                <SelectTrigger className="h-8 w-full" aria-label="Filter by agent"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All agents</SelectItem>{agents.map((agent) => <SelectItem key={agent} value={agent}>{providerLabel(agent)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="vibe-kanban-filter-labels">
              <span className="text-xs text-muted-foreground">Labels{labelFilter.length > 1 ? " · matches all" : ""}</span>
              {labels.length === 0 ? <p className="text-xs text-muted-foreground">No labels yet. Add them from a card’s menu.</p> : <div className="max-h-40 overflow-auto">
                {labels.map((label) => <label key={label.id} className="vibe-kanban-filter-label">
                  <input type="checkbox" checked={labelFilter.includes(label.id)} onChange={(event) => onLabelFilterChange(event.target.checked ? [...labelFilter, label.id] : labelFilter.filter((id) => id !== label.id))} />
                  <LabelBadge label={label} />
                </label>)}
              </div>}
            </div>
            <div className="vibe-kanban-filter-field border-t border-border pt-3">
              <span>Sort by</span>
              <Select value={sortBy} onValueChange={(value) => onSortChange(value as "updated" | "priority")}>
                <SelectTrigger className="h-8 w-full" aria-label="Sort cards"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="updated">Recent activity</SelectItem><SelectItem value="priority">Priority</SelectItem></SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
        <div className="vibe-kanban-new-task">
          <TaskComposerDialog mode="create" stages={stages} labels={labels} defaultProjectId={defaultProjectId} rpc={rpc} onSaved={onCreated} />
        </div>
      </div>
      {hasRefinements && <div className="vibe-kanban-active-filters" aria-label="Active filters">
        {machineFilter !== "all" && <button type="button" aria-label="Remove machine filter" onClick={() => onMachineFilterChange("all")}><Icon name="Laptop" className="size-3" />{machines.find((machine) => machine.id === machineFilter)?.name ?? machineFilter}<Icon name="X" className="size-3" /></button>}
        {agentFilter !== "all" && <button type="button" aria-label="Remove agent filter" onClick={() => onAgentFilterChange("all")}>{providerLabel(agentFilter)}<Icon name="X" className="size-3" /></button>}
        {labels.filter((label) => labelFilter.includes(label.id)).map((label) => <button key={label.id} type="button" aria-label={`Remove ${label.name} filter`} onClick={() => onLabelFilterChange(labelFilter.filter((id) => id !== label.id))}><i className="vibe-kanban-label-dot" data-color={label.color} />{label.name}<Icon name="X" className="size-3" /></button>)}
        {sortBy === "priority" && <button type="button" aria-label="Reset sort to recent activity" onClick={() => onSortChange("updated")}><Icon name="Sort" className="size-3" />Priority first<Icon name="X" className="size-3" /></button>}
        <button type="button" className="vibe-kanban-clear-filters" onClick={clearFilters}>Clear all</button>
      </div>}
    </div>
  );
}

export { BoardToolbar };
