import { useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";

import { StatusDot } from "@/components/ui/status-dot";
import { requestOpenTask, useKanban } from "@/lib/vibe-kanban-store";

import { ManageLabelsDialog } from "./task-metadata";
import { ManageStagesDialog } from "./manage-stages-dialog";
import { NotificationCenter } from "./notification-center";

/**
 * Rendered by the host in the panel's title bar. The bar was empty space; the
 * board-wide controls that are not about a single card live here, next to
 * a connection light that only speaks up when something is wrong.
 */
function KanbanHeaderActions() {
  const { snapshot, rpc, refresh } = useKanban();
  const connection = useRealtimeConnectionState();
  const connected = connection === "connected";

  if (!snapshot) return null;

  return (
    <div className="vibe-kanban-header-actions">
      {!connected && <span
        className="vibe-kanban-connection"
        data-connected={connected ? "" : undefined}
        title={connected ? "Live updates connected" : "Reconnecting to live updates"}
      >
        <StatusDot
          tone={connected ? "done" : "scheduled"}
          size="sm"
          label={connected ? "Live" : "Reconnecting"}
        />
        <span className="vibe-kanban-connection-label">{connected ? "Live" : "Reconnecting"}</span>
      </span>}
      <NotificationCenter
        notifications={snapshot.notifications}
        tasks={snapshot.tasks}
        unreadCount={snapshot.unreadCount}
        onSelect={requestOpenTask}
        onMarkRead={async (ids) => {
          await rpc.call("markNotificationsRead", { ids });
          await refresh();
        }}
        onDelete={async (ids) => {
          await rpc.call("deleteNotifications", { ids });
          await refresh();
        }}
      />
      <ManageLabelsDialog labels={snapshot.labels} rpc={rpc} onChanged={refresh} />
      <ManageStagesDialog stages={snapshot.stages} rpc={rpc} onChanged={refresh} />
    </div>
  );
}

export { KanbanHeaderActions };
