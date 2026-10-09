import * as React from "react";
import {
  experimental_useSidebarThreadActions,
  useBbNavigate,
  useRealtime,
  useSettings,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { ThreadKanbanAction } from "./thread-vibe-kanban-action";
import { Icon } from "@/components/ui/icon";
import { StatusDot } from "@/components/ui/status-dot";
import {
  formatAbsolute,
  formatShortWhen,
  isPending,
  isTaskRunning,
  needsAttention,
  presentRunState,
} from "@/lib/vibe-kanban-format";
import { claimKanbanRefresh, requestOpenTaskDetail } from "@/lib/vibe-kanban-mounts";
import { useKanban } from "@/lib/vibe-kanban-store";
import type { Task } from "@/lib/vibe-kanban-types";

/** The sidebar belongs to the thread list; Vibe Kanban borrows the top of it, not more. */
const ROW_CAP = 10;

/** Kept out of component state so the disclosure survives a route change. */
let sectionCollapsed = false;

/** Attention first, then work in flight, then work with a clock on it. */
function urgency(task: Task): number {
  if (needsAttention(task)) return 0;
  if (isTaskRunning(task)) return 1;
  if (isPending(task)) return 2;
  return 3;
}

function matchesQuery(task: Task, query: string): boolean {
  return task.title.toLowerCase().includes(query) || `#${task.number}`.includes(query);
}

function KanbanSidebarSection({
  activeThreadId,
  activeProjectId,
  isCompactViewport,
  onNavigate,
  searchQuery,
}: Omit<PluginThreadListProps, "Original" | "experimental_Original">) {
  const { snapshot, refresh } = useKanban();
  const navigate = useBbNavigate();
  const threads = experimental_useSidebarThreadActions();
  const [collapsed, setCollapsed] = React.useState(sectionCollapsed);

  // The board's subscription only runs while the board is mounted, so the
  // sidebar carries its own to stay live on a thread route.
  useRealtime("vibe-kanban", (payload) => {
    if (claimKanbanRefresh(payload)) void refresh();
  });

  const query = searchQuery.trim().toLowerCase();

  // Scoped to the selected project, because the list underneath is: an
  // unscoped Vibe Kanban section would read as noise against it.
  const rows = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.tasks
      .filter(
        (task) =>
          (activeProjectId === null || task.projectId === activeProjectId) &&
          (query === "" || matchesQuery(task, query)),
      )
      .sort((left, right) => urgency(left) - urgency(right) || right.updatedAt - left.updatedAt);
  }, [activeProjectId, query, snapshot]);

  if (rows.length === 0) return null;

  const openTask = (task: Task) => {
    if (task.threadId) threads.open(task.threadId);
    else {
      requestOpenTaskDetail(task.number);
      navigate.toPluginPanel("vibe-kanban");
    }
    onNavigate();
  };

  const showBoard = () => {
    navigate.toPluginPanel("vibe-kanban");
    onNavigate();
  };

  const visible = rows.slice(0, ROW_CAP);

  return (
    <section
      className="vibe-kanban-sidebar"
      aria-label="Vibe Kanban"
      data-compact={isCompactViewport ? "" : undefined}
    >
      <h2 className="vibe-kanban-sidebar-heading">
        <button
          type="button"
          className="vibe-kanban-sidebar-toggle"
          aria-expanded={!collapsed}
          onClick={() => {
            sectionCollapsed = !collapsed;
            setCollapsed(sectionCollapsed);
          }}
        >
          <Icon name="ChevronDown" className="vibe-kanban-sidebar-chevron size-3.5" aria-hidden="true" />
          <span className="vibe-kanban-sidebar-title">Vibe Kanban</span>
          <span className="vibe-kanban-sidebar-count tabular-nums">{rows.length}</span>
        </button>
      </h2>

      {collapsed ? null : (
        <>
          <ul className="vibe-kanban-sidebar-list">
            {visible.map((task) => {
              const status = presentRunState(task);
              const stamp = task.scheduledAt ?? task.updatedAt;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className="vibe-kanban-sidebar-row"
                    data-active={
                      task.threadId !== null && task.threadId === activeThreadId ? "" : undefined
                    }
                    title={`#${task.number} · ${task.title} · ${status.label}`}
                    onClick={() => openTask(task)}
                  >
                    <StatusDot
                      tone={status.tone}
                      label={status.label}
                      size="sm"
                      pulse={status.live}
                    />
                    <span className="vibe-kanban-sidebar-number tabular-nums">#{task.number}</span>
                    <span className="vibe-kanban-sidebar-label">{task.title}</span>
                    <time
                      className="vibe-kanban-sidebar-time tabular-nums"
                      dateTime={new Date(stamp).toISOString()}
                      title={formatAbsolute(stamp)}
                    >
                      {formatShortWhen(stamp)}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>

          {rows.length > visible.length ? (
            <button
              type="button"
              className="vibe-kanban-sidebar-more"
              aria-label={`Show all ${rows.length} Vibe Kanban cards on the board`}
              onClick={showBoard}
            >
              <span className="vibe-kanban-sidebar-label">Show all {rows.length}</span>
              <Icon name="ChevronRight" className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The thread-list slot is exclusive: registering it replaces BB's whole list.
 * So this renders BB's list unconditionally and only adds Vibe Kanban above it once
 * the user opts in — while the setting loads, the sidebar is untouched.
 */
function SidebarThreadList({
  Original,
  ...props
}: PluginThreadListProps) {
  const { values } = useSettings();

  return (
    <>
      {values?.showInSidebar === true ? <KanbanSidebarSection {...props} /> : null}
      {props.activeThreadId ? <ThreadKanbanAction key={props.activeThreadId} threadId={props.activeThreadId} sidebar /> : null}
      <Original />
    </>
  );
}

export { SidebarThreadList };
