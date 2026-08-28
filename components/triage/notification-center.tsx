import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import {
  formatShortWhen,
  isPending,
  isTaskRunning,
  needsAttention,
  presentRunState,
} from "@/lib/triage-format";
import type {
  NotificationLevel,
  Task,
  TriageNotification,
} from "@/lib/triage-types";

const LEVEL_TONE: Record<NotificationLevel, StatusTone> = {
  attention: "danger",
  success: "done",
  info: "unread",
};

/** How many history rows survive the fold; past this the feed is archaeology. */
const FEED_LIMIT = 40;

/** Long enough to glance, short enough that the badge clears while open. */
const GLANCE_READ_DELAY_MS = 800;

type LensId = "attention" | "live" | "scheduled";

interface Lens {
  label: string;
  tone: StatusTone;
  hint: string;
  match: (task: Task) => boolean;
}

/** Vocabulary is the board toolbar's, so the two filters mean the same thing. */
const LENSES: Record<LensId, Lens> = {
  attention: {
    label: "Needs you",
    tone: "danger",
    hint: "Cards waiting on a person",
    match: needsAttention,
  },
  live: {
    label: "Running",
    tone: "ongoing",
    hint: "An agent is working right now",
    match: isTaskRunning,
  },
  scheduled: {
    label: "Pending",
    tone: "scheduled",
    hint: "Queued or scheduled",
    match: isPending,
  },
};

const LENS_ORDER: readonly LensId[] = ["attention", "live", "scheduled"];

/** A live card, which is what the top of the panel is actually about. */
interface CardRow {
  task: Task;
  unread: boolean;
  /** Attention events folded into this card. */
  events: number;
  /** Persisted notification rows represented by this live status card. */
  notificationIds: string[];
  reason: string | null;
  stamp: number;
}

/** A run of history collapsed to the one thing it says. */
interface FeedRow {
  id: string;
  notificationIds: string[];
  taskNumber: number | null;
  taskTitle: string | null;
  action: string;
  level: NotificationLevel;
  body: string;
  count: number;
  createdAt: number;
  unread: boolean;
}

/** Today / Yesterday / date, so a long list stays scannable. */
function bucketOf(timestamp: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (timestamp >= start.getTime()) return "Today";
  if (timestamp >= start.getTime() - 86_400_000) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(
    new Date(timestamp),
  );
}

function groupByDay(rows: FeedRow[]): { bucket: string; items: FeedRow[] }[] {
  const groups: { bucket: string; items: FeedRow[] }[] = [];
  for (const row of rows) {
    const bucket = bucketOf(row.createdAt);
    const last = groups.at(-1);
    if (last?.bucket === bucket) last.items.push(row);
    else groups.push({ bucket, items: [row] });
  }
  return groups;
}

/**
 * "Needs attention" three times in a row is one card misbehaving, not three
 * things to read. Consecutive events for the same card and action fold into
 * one row that keeps the newest stamp.
 */
function foldRuns(notifications: TriageNotification[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const notification of notifications) {
    const last = rows.at(-1);
    if (
      last &&
      last.taskNumber === notification.taskNumber &&
      last.action === notification.action
    ) {
      last.count += 1;
      last.createdAt = Math.max(last.createdAt, notification.createdAt);
      last.unread ||= notification.readAt === null;
      last.notificationIds.push(notification.id);
      continue;
    }
    rows.push({
      id: notification.id,
      notificationIds: [notification.id],
      taskNumber: notification.taskNumber,
      taskTitle: notification.taskTitle,
      action: notification.action,
      level: notification.level,
      body: notification.body,
      count: 1,
      createdAt: notification.createdAt,
      unread: notification.readAt === null,
    });
  }
  return rows;
}

function cardStamp(task: Task): number {
  return isPending(task) ? task.scheduledAt ?? task.updatedAt : task.updatedAt;
}

function toCardRow(task: Task): CardRow {
  return {
    task,
    unread: false,
    events: 0,
    notificationIds: [],
    reason: task.attentionReason,
    stamp: cardStamp(task),
  };
}

/** A broken card outranks a merely waiting one; after that, most recent wins. */
function attentionRank(task: Task): number {
  if (task.runState === "failed") return 0;
  if (task.attentionReason !== null) return 1;
  return 2;
}

/**
 * The cards that currently want a person, each carrying its own history. The
 * card is the thing that needs answering, so its events belong to it rather
 * than to the chronological feed, where a fresh failure would sink under a
 * fortnight of routine updates.
 */
function buildAttention(
  tasks: Task[],
  notifications: TriageNotification[],
): { rows: CardRow[]; absorbed: ReadonlySet<string> } {
  const rows = tasks.filter(needsAttention).map(toCardRow);
  const byNumber = new Map(rows.map((row) => [row.task.number, row]));
  const absorbed = new Set<string>();

  for (const notification of notifications) {
    if (notification.level !== "attention" || notification.taskNumber === null) continue;
    const row = byNumber.get(notification.taskNumber);
    if (!row) continue;
    absorbed.add(notification.id);
    row.events += 1;
    row.notificationIds.push(notification.id);
    row.unread ||= notification.readAt === null;
    row.reason ??= notification.body;
  }

  rows.sort((a, b) => attentionRank(a.task) - attentionRank(b.task) || b.stamp - a.stamp);
  return { rows, absorbed };
}

function Tally({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <>
      <span className="triage-notification-tally tabular-nums" aria-hidden="true">
        ×{count}
      </span>
      <span className="sr-only">, {count} times</span>
    </>
  );
}

function BrowserPermissionRow() {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">(
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
  );

  if (permission !== "default") return null;

  return (
    <button
      type="button"
      className="triage-notification-optin"
      onClick={() => {
        void Notification.requestPermission().then((next) => {
          setPermission(next);
          if (next === "granted") toast.success("Browser notifications enabled");
        });
      }}
    >
      <Icon name="MailOpen" className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">Enable browser notifications</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          Get alerted while BB is in the background
        </span>
      </span>
    </button>
  );
}

function NotificationDeleteButton({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = React.useState(false);

  return (
    <button
      type="button"
      className="triage-notification-delete"
      aria-label={label}
      title={label}
      disabled={deleting}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDeleting(true);
        void onDelete()
          .catch((error) => {
            toast.error("Could not delete notification", {
              description: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => setDeleting(false));
      }}
    >
      <Icon name="Trash2" className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function CardRowButton({
  row,
  onOpen,
  onDelete,
}: {
  row: CardRow;
  onOpen: () => void;
  onDelete?: () => Promise<void>;
}) {
  const status = presentRunState(row.task);
  return (
    <div data-unread={row.unread ? "" : undefined} className="triage-notification-row">
      <button
        type="button"
        className="triage-notification-row-main"
        title={row.reason ?? undefined}
        onClick={onOpen}
      >
        <StatusDot tone={status.tone} size="sm" pulse={status.live} />
        <span className="min-w-0">
          <span className="triage-notification-action">
            <span className="triage-notification-action-text">{row.task.title}</span>
            <Tally count={row.events} />
          </span>
          <span className="triage-notification-target">
            <span className="triage-notification-state">{status.label}</span>
            {" · "}
            <span className="tabular-nums">#{row.task.number}</span>
            {" · "}
            {row.task.projectName}
          </span>
          {row.reason ? <span className="triage-notification-reason">{row.reason}</span> : null}
        </span>
      </button>
      <span className="triage-notification-trailing">
        <span className="triage-notification-time tabular-nums">
          {formatShortWhen(row.stamp)}
        </span>
        {onDelete ? (
          <NotificationDeleteButton
            label={`Delete notifications for ${row.task.title}`}
            onDelete={onDelete}
          />
        ) : null}
      </span>
    </div>
  );
}

function FeedRowButton({
  row,
  task,
  onOpen,
  onDelete,
}: {
  row: FeedRow;
  task: Task | null;
  onOpen: (taskNumber: number) => void;
  onDelete: () => Promise<void>;
}) {
  const missing = row.taskNumber !== null && task === null;
  // Only states a person can act on are worth the width; "completed" on a
  // week-old row says nothing the action line has not already said.
  const status = task && (isTaskRunning(task) || needsAttention(task)) ? presentRunState(task) : null;

  return (
    <div data-unread={row.unread ? "" : undefined} className="triage-notification-row">
      <button
        type="button"
        className="triage-notification-row-main"
        title={row.body || undefined}
        disabled={row.taskNumber === null || missing}
        onClick={() => {
          if (row.taskNumber === null || missing) return;
          onOpen(row.taskNumber);
        }}
      >
        <StatusDot
          tone={status ? status.tone : LEVEL_TONE[row.level]}
          size="sm"
          pulse={status?.live ?? false}
        />
        <span className="min-w-0">
          <span className="triage-notification-action">
            <span className="triage-notification-action-text">{row.action}</span>
            <Tally count={row.count} />
          </span>
          <span className="triage-notification-target">
            {row.taskNumber === null ? (
              row.body
            ) : (
              <>
                {status ? (
                  <>
                    <span className="triage-notification-state">{status.label}</span>
                    {" · "}
                  </>
                ) : null}
                <span className="tabular-nums">#{row.taskNumber}</span>
                {missing ? (
                  <>
                    {" · "}
                    <span className="triage-notification-missing">card deleted</span>
                    {row.taskTitle ? <> · {row.taskTitle}</> : null}
                  </>
                ) : task && task.title ? (
                  <> · {task.title}</>
                ) : null}
              </>
            )}
          </span>
          {row.level === "attention" && row.body ? (
            <span className="triage-notification-reason">{row.body}</span>
          ) : null}
        </span>
      </button>
      <span className="triage-notification-trailing">
        <span className="triage-notification-time tabular-nums">
          {formatShortWhen(row.createdAt)}
        </span>
        <NotificationDeleteButton label={`Delete notification: ${row.action}`} onDelete={onDelete} />
      </span>
    </div>
  );
}

export interface NotificationCenterProps {
  notifications: TriageNotification[];
  /**
   * Every card on the board. History alone cannot say what is true now, so
   * rows are joined against live cards by number.
   */
  tasks: Task[];
  unreadCount: number;
  onSelect: (taskNumber: number) => void;
  onMarkRead: (ids: string[] | null) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
}

/**
 * A status surface with a log underneath it, not a log. The digest and the
 * pinned group answer "what needs me" before the feed gets a chance to bury
 * it, and every row is joined to its live card so it can say what is true now
 * rather than only what happened once.
 */
function NotificationCenter({
  notifications,
  tasks,
  unreadCount,
  onSelect,
  onMarkRead,
  onDelete,
}: NotificationCenterProps) {
  const [open, setOpen] = React.useState(false);
  const [lens, setLens] = React.useState<LensId | null>(null);
  const onMarkReadRef = React.useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  React.useEffect(() => {
    if (!open) return;

    // Snapshot once, at open. A realtime notification arriving while the user
    // is reading must stay unread until they actually see a later popover.
    const unreadIds = notifications
      .filter((notification) => notification.readAt === null)
      .map((notification) => notification.id);
    if (unreadIds.length === 0) return;

    const timer = window.setTimeout(() => {
      void onMarkReadRef.current(unreadIds).catch((error) => {
        toast.error("Could not mark notifications read", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
    }, GLANCE_READ_DELAY_MS);

    return () => window.clearTimeout(timer);
    // The open transition deliberately owns the snapshot; notification
    // updates while open must neither replace nor expand it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const taskByNumber = React.useMemo(
    () => new Map(tasks.map((task) => [task.number, task])),
    [tasks],
  );

  const counts = React.useMemo<Record<LensId, number>>(
    () => ({
      attention: tasks.filter(needsAttention).length,
      live: tasks.filter(isTaskRunning).length,
      scheduled: tasks.filter(isPending).length,
    }),
    [tasks],
  );

  // A lens whose count has since drained would strand the panel on an empty
  // list, so emptiness releases it rather than an effect chasing the counts.
  const activeLens = lens !== null && counts[lens] > 0 ? lens : null;

  const attention = React.useMemo(
    () => buildAttention(tasks, notifications),
    [notifications, tasks],
  );

  const cardRows = React.useMemo(() => {
    if (activeLens === null || activeLens === "attention") return attention.rows;
    const rows = tasks.filter(LENSES[activeLens].match).map(toCardRow);
    // Pending cards read forwards — the next one to fire is the useful one.
    return rows.sort((a, b) =>
      activeLens === "scheduled" ? a.stamp - b.stamp : b.stamp - a.stamp,
    );
  }, [activeLens, attention, tasks]);

  const feed = React.useMemo(
    () =>
      groupByDay(
        foldRuns(
          notifications
            .filter((notification) => !attention.absorbed.has(notification.id))
            .slice(0, FEED_LIMIT),
        ),
      ),
    [attention, notifications],
  );

  const openTask = React.useCallback(
    (taskNumber: number) => {
      setOpen(false);
      onSelect(taskNumber);
    },
    [onSelect],
  );

  const showFeed = activeLens === null;
  const groupLabel = activeLens === null ? LENSES.attention.label : LENSES[activeLens].label;
  const groupPinned = activeLens === null || activeLens === "attention";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <span className="triage-notification-icon" aria-hidden="true">
            <Icon name="Mail" className="size-4" />
            {unreadCount > 0 ? (
              <span className="triage-notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
            ) : null}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="triage-notification-panel"
        mobileTitle="Notifications"
      >
        <header className="triage-notification-header">
          <span className="text-[13px] font-semibold">Notifications</span>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                void onMarkRead(null).catch((error) => {
                  toast.error("Could not mark notifications read", {
                    description: error instanceof Error ? error.message : String(error),
                  });
                });
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </header>
        <div className="triage-notification-digest" role="group" aria-label="Board status">
          {LENS_ORDER.map((id) => {
            const active = id === activeLens;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                data-state={active ? "active" : undefined}
                className="triage-notification-lens"
                title={active ? "Show everything" : LENSES[id].hint}
                disabled={counts[id] === 0}
                onClick={() => setLens(active ? null : id)}
              >
                <StatusDot tone={LENSES[id].tone} size="sm" />
                <span className="truncate">{LENSES[id].label}</span>
                <span className="triage-notification-lens-count tabular-nums">{counts[id]}</span>
              </button>
            );
          })}
        </div>
        <BrowserPermissionRow />
        <div className="triage-notification-scroll">
          {cardRows.length === 0 && feed.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              Nothing needs your attention yet.
            </p>
          ) : (
            <>
              {cardRows.length > 0 ? (
                <section>
                  <h4 className="triage-notification-bucket" data-pinned={groupPinned ? "" : undefined}>
                    {groupLabel}
                    <span className="triage-notification-bucket-count tabular-nums">
                      {cardRows.length}
                    </span>
                  </h4>
                  {cardRows.map((row) => (
                    <CardRowButton
                      key={row.task.id}
                      row={row}
                      onOpen={() => openTask(row.task.number)}
                      onDelete={
                        row.notificationIds.length > 0
                          ? () => onDelete(row.notificationIds)
                          : undefined
                      }
                    />
                  ))}
                </section>
              ) : null}
              {showFeed
                ? feed.map((group) => (
                    <section key={group.bucket}>
                      <h4 className="triage-notification-bucket">{group.bucket}</h4>
                      {group.items.map((row) => (
                        <FeedRowButton
                          key={row.id}
                          row={row}
                          task={row.taskNumber === null ? null : taskByNumber.get(row.taskNumber) ?? null}
                          onOpen={openTask}
                          onDelete={() => onDelete(row.notificationIds)}
                        />
                      ))}
                    </section>
                  ))
                : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { NotificationCenter };
