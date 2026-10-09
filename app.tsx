import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useRealtime,
  useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { matchesBoardFilters, compareTaskPriority } from "@/lib/board-filters";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { BoardSkeleton, ToolbarSkeleton } from "@/components/vibe-kanban/board-skeleton";
import { BoardToolbar, type TaskFilter } from "@/components/vibe-kanban/board-toolbar";
import { TaskComposerDialog } from "@/components/vibe-kanban/task-composer-dialog";
import { KanbanHeaderActions } from "@/components/vibe-kanban/header-actions";
import { ThreadKanbanAction } from "@/components/vibe-kanban/thread-vibe-kanban-action";
import { SidebarThreadList } from "@/components/vibe-kanban/sidebar-thread-list";
import { TaskCard } from "@/components/vibe-kanban/task-card";
import {
  isTaskRunning,
  supportsTaskRead,
} from "@/lib/vibe-kanban-format";
import { claimKanbanRefresh, usePendingOpenTaskDetail } from "@/lib/vibe-kanban-mounts";
import { patchTaskRead, patchTaskStage, useOpenTaskRequests, useKanban } from "@/lib/vibe-kanban-store";
import type { NotificationLevel, Task } from "@/lib/vibe-kanban-types";
import "./app.css";

interface RealtimePayload {
  kind?: string;
  notification?: {
    taskNumber: number | null;
    action: string;
    taskTitle: string | null;
    title: string;
    body: string;
    level: NotificationLevel;
  };
}

/** Toast plus, when BB is in the background, a browser notification. */
function showNotification(payload: RealtimePayload["notification"]): void {
  if (!payload) return;
  const subject =
    payload.taskNumber === null
      ? payload.body
      : `#${payload.taskNumber}${payload.taskTitle ? ` · ${payload.taskTitle}` : ""}`;
  const options = { description: subject };
  if (payload.level === "attention") toast.error(payload.action, options);
  else if (payload.level === "success") toast.success(payload.action, options);
  else toast.info(payload.action, options);

  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    document.visibilityState !== "visible"
  ) {
    new Notification(payload.action, {
      body: subject,
      tag: `vibe-kanban-${payload.taskNumber ?? "general"}`,
    });
  }
}

function matchesFilter(task: Task, filter: TaskFilter): boolean {
  switch (filter) {
    case "live":
      return task.settledAt === null && isTaskRunning(task);
    case "scheduled":
      return task.settledAt === null && task.runState === "scheduled";
    case "unread":
      return task.settledAt === null && supportsTaskRead(task) && task.readAt === null;
    case "settled":
      return task.settledAt !== null;
    default:
      return task.settledAt === null;
  }
}

function KanbanBoard() {
  const { snapshot, error, loading, rpc, refresh } = useKanban();
  const { projectId: routeProjectId } = useBbContext();
  const navigate = useBbNavigate();
  const connection = useRealtimeConnectionState();
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"updated" | "priority">("updated");
  const [projectFilter, setProjectFilter] = useState("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [draggedNumber, setDraggedNumber] = useState<number | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [editingNumber, setEditingNumber] = useState<number | null>(null);

  useRealtime("vibe-kanban", (payload) => {
    showNotification((payload as RealtimePayload).notification);
    // The sidebar list hears the same signal; only one of them needs to fetch.
    if (claimKanbanRefresh(payload)) void refresh();
  });

  // Reconcile child creation and missed signals without polling in the background.
  useEffect(() => {
    const reconcile = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(reconcile, 15_000);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => { clearInterval(timer); window.removeEventListener("focus", reconcile); document.removeEventListener("visibilitychange", reconcile); };
  }, [refresh]);
  useEffect(() => { if (connection === "connected") void refresh(); }, [connection, refresh]);
  useEffect(() => {
    if (snapshot) setLabelFilter((current) => {
      const next = current.filter((id) => snapshot.labels.some((label) => label.id === id));
      return next.length === current.length ? current : next;
    });
  }, [snapshot]);

  const openTask = useCallback(
    (taskNumber: number) => {
      const task = snapshot?.tasks.find((item) => item.number === taskNumber);
      if (!task) return;
      if (supportsTaskRead(task) && task.readAt === null) {
        patchTaskRead(task.number, true);
        void rpc.call("setTaskRead", { number: task.number, read: true }).then(refresh, refresh);
      }
      if (task.threadId) navigate.toThread(task.threadId);
      else setEditingNumber(task.number);
    },
    [navigate, refresh, rpc, snapshot],
  );

  useOpenTaskRequests(openTask);
  // Notification rows ask to open a card by number. Existing threads win;
  // cards without one fall back to the shared editor.
  usePendingOpenTaskDetail(setEditingNumber);

  /** Cards inside the current project and machine scope, before the lens. */
  const scopedTasks = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.tasks.filter(
      (task) =>
        matchesBoardFilters(task, { query, agent: agentFilter, labelIds: labelFilter }) &&
        (projectFilter === "all" || task.projectId === projectFilter) &&
        (machineFilter === "all" ||
          (task.machineId ?? snapshot.projects.find((project) => project.id === task.projectId)?.defaultMachineId) === machineFilter),
    );
  }, [machineFilter, projectFilter, snapshot, query, agentFilter, labelFilter]);

  const counts = useMemo(
    () => ({
      all: scopedTasks.filter((task) => task.settledAt === null).length,
      live: scopedTasks.filter((task) => task.settledAt === null && isTaskRunning(task)).length,
      unread: scopedTasks.filter((task) => task.settledAt === null && supportsTaskRead(task) && task.readAt === null).length,
      scheduled: scopedTasks.filter((task) => task.settledAt === null && task.runState === "scheduled").length,
      settled: scopedTasks.filter((task) => task.settledAt !== null).length,
    }),
    [scopedTasks],
  );

  const visibleTasks = useMemo(
    () => scopedTasks.filter((task) => matchesFilter(task, taskFilter)).sort(sortBy === "priority" ? compareTaskPriority : (a, b) => b.updatedAt - a.updatedAt || b.number - a.number),
    [scopedTasks, taskFilter, sortBy],
  );

  const taskAction = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      toast.success(message);
      await refresh();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : String(actionError));
    }
  };

  const move = async (task: Task, stageId: string) => {
    if (task.stageId === stageId) return;
    patchTaskStage(task.number, stageId);
    try {
      await rpc.call("moveTask", { number: task.number, stageId });
      await refresh();
    } catch (moveError) {
      toast.error(moveError instanceof Error ? moveError.message : String(moveError));
      await refresh();
    }
  };

  if (!snapshot && loading) {
    return (
      <div className="vibe-kanban-shell">
        <ToolbarSkeleton />
        <div className="vibe-kanban-board-viewport">
          <BoardSkeleton />
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="vibe-kanban-error">
        <Icon name="AlertTriangle" className="size-6 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-semibold">Vibe Kanban could not load</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  const editingTask = snapshot.tasks.find((task) => task.number === editingNumber) ?? null;
  const defaultProjectId = projectFilter !== "all" ? projectFilter : routeProjectId;

  return (
    <div className="vibe-kanban-shell">
      <BoardToolbar
        labels={snapshot.labels}
        agents={[...new Set(snapshot.tasks.map((task) => task.providerId))].sort()}
        labelFilter={labelFilter} agentFilter={agentFilter} query={query} sortBy={sortBy}
        onLabelFilterChange={setLabelFilter} onAgentFilterChange={setAgentFilter} onQueryChange={setQuery} onSortChange={setSortBy}
        projects={snapshot.projects}
        machines={snapshot.machines}
        stages={snapshot.stages}
        projectFilter={projectFilter}
        machineFilter={machineFilter}
        taskFilter={taskFilter}
        counts={counts}
        defaultProjectId={defaultProjectId}
        rpc={rpc}
        onProjectFilterChange={(value) => {
          setProjectFilter(value);
          const defaultMachineId = snapshot.projects.find((project) => project.id === value)?.defaultMachineId;
          setMachineFilter(defaultMachineId && snapshot.machines.some((machine) => machine.id === defaultMachineId) ? defaultMachineId : "all");
        }}
        onMachineFilterChange={setMachineFilter}
        onTaskFilterChange={setTaskFilter}
        onCreated={refresh}
      />

      {error && <div className="vibe-kanban-refresh-error" role="status">Updates paused: {error}<Button size="sm" variant="ghost" onClick={() => void refresh()}>Retry</Button></div>}
      <div className="vibe-kanban-board-viewport">
        <div className="vibe-kanban-board">
          {snapshot.stages.map((stage) => {
            const cards = visibleTasks.filter((task) => task.stageId === stage.id);
            const dragging = draggedNumber !== null;
            return (
              <section
                key={stage.id}
                className="vibe-kanban-column"
                data-dropping={dropStageId === stage.id ? "" : undefined}
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dropStageId !== stage.id) setDropStageId(stage.id);
                }}
                onDragLeave={(event) => {
                  // Ignore the events fired while crossing this column's children.
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDropStageId((current) => (current === stage.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const task = scopedTasks.find((item) => item.number === draggedNumber);
                  setDraggedNumber(null);
                  setDropStageId(null);
                  if (task) void move(task, stage.id);
                }}
              >
                <header className="vibe-kanban-column-header">
                  <span className="vibe-kanban-stage-icon" data-role={stage.systemRole ?? "backlog"}><Icon name={stage.systemRole === "done" ? "CircleCheck" : stage.systemRole === "attention" ? "Eye" : stage.systemRole === "active" ? "Circle" : stage.systemRole === "intake" ? "Circle" : "Spinner"} className="size-4" /></span>
                  <h2 className="vibe-kanban-column-name">{stage.name}</h2>
                  <span className="vibe-kanban-column-count tabular-nums">{cards.length}</span>
                  <div className="ml-auto"><TaskComposerDialog mode="create" compact defaultStageId={stage.id} defaultProjectId={defaultProjectId} stages={snapshot.stages} labels={snapshot.labels} rpc={rpc} onSaved={refresh} /></div>
                </header>
                <div className="vibe-kanban-column-scroll">
                  {cards.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      labels={snapshot.labels} rpc={rpc} onRefresh={refresh}
                      stages={snapshot.stages}
                      showMachine={snapshot.machines.length > 1}
                      onOpen={() => openTask(task.number)}
                      onToggleSidebar={() => void taskAction(
                        () => rpc.call("setThreadSidebar", { number: task.number, visible: !task.sidebarVisible }),
                        task.sidebarVisible ? "Session hidden from sidebar" : "Session shown in sidebar",
                      )}
                      onMove={(stageId) => void move(task, stageId)}
                      onRun={() =>
                        void taskAction(
                          () => rpc.call("runTask", { number: task.number }),
                          `Started Vibe Kanban #${task.number}`,
                        )
                      }
                      onStop={() =>
                        void taskAction(
                          () => rpc.call("stopTask", { number: task.number }),
                          `Stopped Vibe Kanban #${task.number}`,
                        )
                      }
                      onSetSettled={(settled) =>
                        void taskAction(
                          () => rpc.call("setTaskSettled", { number: task.number, settled }),
                          settled ? `Archived Vibe Kanban #${task.number}` : `Reopened Vibe Kanban #${task.number}`,
                        )
                      }
                      onSetRead={(read) => {
                        patchTaskRead(task.number, read);
                        void rpc.call("setTaskRead", { number: task.number, read }).then(refresh, refresh);
                      }}
                      onDelete={() =>
                        void taskAction(
                          () => rpc.call("deleteTask", { number: task.number }),
                          `Deleted Vibe Kanban #${task.number}`,
                        )
                      }
                      onDragStart={() => setDraggedNumber(task.number)}
                      onDragEnd={() => {
                        setDraggedNumber(null);
                        setDropStageId(null);
                      }}
                    />
                  ))}
                  {cards.length === 0 ? (
                    <p className="vibe-kanban-column-empty" data-dragging={dragging ? "" : undefined}>
                      {dragging
                        ? `Drop in ${stage.name}`
                        : taskFilter === "all" && !query && !labelFilter.length && agentFilter === "all" && projectFilter === "all" && machineFilter === "all"
                          ? "No cards yet"
                          : "Nothing matches this filter"}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <TaskComposerDialog
        mode="edit"
        task={editingTask}
        stages={snapshot.stages}
        labels={snapshot.labels}
        rpc={rpc}
        open={editingTask !== null}
        onOpenChange={(next) => {
          if (!next) setEditingNumber(null);
        }}
        onSaved={refresh}
      />
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "vibe-kanban-thread-action",
    title: "Vibe Kanban",
    component: ThreadKanbanAction,
  });
  app.slots.navPanel({
    id: "vibe-kanban-board",
    title: "Vibe Kanban",
    icon: "Columns2",
    path: "vibe-kanban",
    component: KanbanBoard,
    headerContent: KanbanHeaderActions,
  });

  app.slots.experimental_threadList({
    id: "vibe-kanban-sidebar",
    title: "Vibe Kanban above threads",
    description:
      "BB's thread list with your Vibe Kanban cards above it, once the plugin's sidebar setting is on.",
    component: SidebarThreadList,
  });
});
