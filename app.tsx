import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  experimental_NewThreadComposer as NewThreadComposer,
  useBbContext,
  useBbNavigate,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type NewThreadRequest,
} from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./app.css";

interface Stage {
  id: string;
  name: string;
  position: number;
  systemRole: "intake" | "active" | "attention" | "done" | null;
}

interface Task {
  id: string;
  number: number;
  title: string;
  description: string;
  stageId: string;
  projectId: string;
  projectName: string;
  machineId: string | null;
  machineName: string;
  branchName: string;
  providerId: string;
  model: string;
  reasoningLevel: "none" | "low" | "medium" | "high" | "xhigh" | "ultracode" | "max" | "ultra";
  scheduledAt: number | null;
  threadId: string | null;
  runState:
    | "queued"
    | "scheduled"
    | "dispatching"
    | "starting"
    | "working"
    | "idle"
    | "failed"
    | "completed"
    | "stopped";
  attentionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ProjectOption {
  id: string;
  kind: "personal" | "standard";
  name: string;
}

interface MachineOption {
  id: string;
  name: string;
  status: "connected" | "disconnected";
}

interface TriageNotification {
  id: string;
  taskNumber: number | null;
  title: string;
  body: string;
  level: "info" | "success" | "attention";
  readAt: number | null;
  createdAt: number;
}

interface Snapshot {
  stages: Stage[];
  tasks: Task[];
  projects: ProjectOption[];
  machines: MachineOption[];
  notifications: TriageNotification[];
  unreadCount: number;
}

interface RealtimePayload {
  kind?: string;
  notification?: {
    taskNumber: number | null;
    title: string;
    body: string;
    level: "info" | "success" | "attention";
  };
}

function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const delta = timestamp - now;
  const absolute = Math.abs(delta);
  if (absolute < 60_000) return delta > 0 ? "in under a minute" : "just now";
  if (absolute < 3_600_000) {
    const minutes = Math.round(absolute / 60_000);
    return delta > 0 ? `in ${minutes}m` : `${minutes}m ago`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function descriptionFromRequest(request: NewThreadRequest): string {
  return request.input
    .filter((part): part is Extract<(typeof request.input)[number], { type: "text" }> => part.type === "text")
    .filter((part) => part.visibility !== "agent-only")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function showNotification(payload: RealtimePayload["notification"]): void {
  if (!payload) return;
  const message = payload.taskNumber === null ? payload.body : `Triage #${payload.taskNumber} · ${payload.body}`;
  if (payload.level === "attention") toast.error(payload.title, { description: message });
  else if (payload.level === "success") toast.success(payload.title, { description: message });
  else toast.info(payload.title, { description: message });

  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    document.visibilityState !== "visible"
  ) {
    new Notification(payload.title, { body: message, tag: `triage-${payload.taskNumber ?? "general"}` });
  }
}

function runStateLabel(state: Task["runState"]): string {
  const labels: Record<Task["runState"], string> = {
    queued: "Ready",
    scheduled: "Scheduled",
    dispatching: "Dispatching",
    starting: "Starting",
    working: "Agent active",
    idle: "Agent idle",
    failed: "Failed",
    completed: "Completed",
    stopped: "Stopped",
  };
  return labels[state];
}

function providerLabel(providerId: string): string {
  return providerId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isTaskRunning(task: Task): boolean {
  return ["dispatching", "starting", "working"].includes(task.runState);
}

function toDatetimeLocal(timestamp: number | null): string {
  if (timestamp === null) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Choose a valid date and time");
  return timestamp;
}

function formatReasoningLevel(level: Task["reasoningLevel"]): string {
  const labels: Record<Task["reasoningLevel"], string> = {
    none: "No thinking",
    low: "Low thinking",
    medium: "Medium thinking",
    high: "High thinking",
    xhigh: "Extra-high thinking",
    ultracode: "Ultracode thinking",
    max: "Max thinking",
    ultra: "Ultra thinking",
  };
  return labels[level];
}

function NotificationCenter({
  notifications,
  unreadCount,
  onRead,
}: {
  notifications: TriageNotification[];
  unreadCount: number;
  onRead: () => Promise<void>;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === "granted") toast.success("Browser notifications enabled");
    else toast.info("Browser notifications remain off");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
          <span className="triage-notification-icon" aria-hidden="true">
            <Icon name="Mail" />
            {unreadCount > 0 ? (
              <span className="triage-notification-badge">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">Agent handoffs and tasks needing you</p>
          </div>
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => void onRead()}>
              Mark read
            </Button>
          ) : null}
        </div>
        {permission === "default" ? (
          <button
            className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left text-sm transition-colors hover:bg-state-hover"
            onClick={() => void requestPermission()}
          >
            <Icon name="MailOpen" className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <span>
              <span className="block font-medium">Enable browser notifications</span>
              <span className="block text-xs text-muted-foreground">Get alerted when BB is in the background.</span>
            </span>
          </button>
        ) : null}
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing needs your attention yet.</div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`border-b border-border px-4 py-3 last:border-0 ${notification.readAt === null ? "bg-primary/[0.04]" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      notification.level === "attention"
                        ? "bg-destructive"
                        : notification.level === "success"
                          ? "bg-success"
                          : "bg-primary"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{notification.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{formatWhen(notification.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function titleFromPrompt(prompt: string): string {
  const line = prompt.split("\n").map((part) => part.trim()).find(Boolean);
  return line ? line.slice(0, 160) : "";
}

function formatLocalScheduled(value: string): string {
  if (!value) return "Pick a time";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function nextScheduleTime(): number {
  const date = new Date(Date.now() + 3_600_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date.getTime();
}

function localDateAt(hour: number, minute: number, dayOffset: number): number {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date.getTime();
}

type StartMode = "now" | "later" | "manual";

function formatStartDistance(mode: StartMode, scheduledLocal: string): string {
  if (mode === "now") return "Starts immediately";
  if (mode === "manual") return "Stays on the board until you run it";
  const timestamp = new Date(scheduledLocal).getTime();
  if (!Number.isFinite(timestamp)) return "Choose a date and time";
  const minutes = Math.max(1, Math.round((timestamp - Date.now()) / 60_000));
  if (minutes < 120) return `Starts in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Starts in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `Starts in ${days} ${days === 1 ? "day" : "days"}`;
}

function StartPicker({
  mode,
  scheduledLocal,
  onModeChange,
  onScheduledLocalChange,
}: {
  mode: StartMode;
  scheduledLocal: string;
  onModeChange: (mode: StartMode) => void;
  onScheduledLocalChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const scheduledDate = scheduledLocal ? new Date(scheduledLocal) : undefined;
  const scheduledTime = scheduledDate
    ? `${String(scheduledDate.getHours()).padStart(2, "0")}:${String(scheduledDate.getMinutes()).padStart(2, "0")}`
    : "09:00";

  const selectMode = (nextMode: StartMode) => {
    onModeChange(nextMode);
    if (nextMode === "later" && !scheduledLocal) {
      onScheduledLocalChange(toDatetimeLocal(nextScheduleTime()));
    }
    if (nextMode !== "later") setOpen(false);
  };

  const selectScheduledDay = (day: Date | undefined) => {
    if (!day) return;
    const next = scheduledDate ?? new Date(nextScheduleTime());
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    onScheduledLocalChange(toDatetimeLocal(next.getTime()));
  };

  const selectScheduledTime = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const next = scheduledDate ?? new Date(nextScheduleTime());
    next.setHours(hours, minutes, 0, 0);
    onScheduledLocalChange(toDatetimeLocal(next.getTime()));
  };

  const option = (nextMode: StartMode, label: string, icon: "Clock" | "Calendar" | "Pause") => (
    <button
      type="button"
      className="triage-schedule-option"
      aria-pressed={mode === nextMode}
      onClick={() => selectMode(nextMode)}
    >
      <Icon name={icon} className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="grid min-w-0 gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 px-3 font-normal"
            aria-label="Choose when this task starts"
          >
            <Icon
              name={mode === "manual" ? "Pause" : mode === "later" ? "Calendar" : "Clock"}
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {mode === "now" ? (
              <span>Run now</span>
            ) : mode === "manual" ? (
              <span>Keep on board</span>
            ) : (
              <span className="truncate">{formatLocalScheduled(scheduledLocal)}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="triage-schedule-popover w-[360px] p-3"
          mobileTitle="Choose a start time"
        >
          <div className="triage-schedule-options" aria-label="Start behavior">
            {option("now", "Run now", "Clock")}
            {option("later", "Later", "Calendar")}
            {option("manual", "On board", "Pause")}
          </div>
          {mode === "later" ? (
            <div className="triage-schedule-panel">
              <Calendar
                mode="single"
                selected={scheduledDate}
                onSelect={selectScheduledDay}
                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                className="triage-schedule-calendar mx-auto p-0"
                classNames={{
                  month: "flex w-full flex-col gap-3",
                  month_grid: "w-full border-collapse",
                  weekdays: "grid grid-cols-7",
                  weekday: "flex h-8 items-center justify-center text-[11px] font-medium text-muted-foreground",
                  week: "grid grid-cols-7",
                  day: "relative flex size-10 items-center justify-center p-0 text-center",
                  outside: "text-muted-foreground/45",
                  disabled: "text-muted-foreground/30",
                  today: "text-foreground",
                }}
              />
              <div className="triage-schedule-time">
                <Icon name="Clock" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => selectScheduledTime(event.target.value)}
                  aria-label="Scheduled time"
                  className="h-9"
                />
              </div>
              <div className="triage-schedule-presets">
                {[
                  { label: "+1 hour", at: Date.now() + 3_600_000 },
                  { label: "Tonight", at: localDateAt(20, 0, 0) },
                  { label: "Tomorrow", at: localDateAt(9, 0, 1) },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 px-2 text-xs"
                    onClick={() => onScheduledLocalChange(toDatetimeLocal(preset.at))}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      <span className="text-xs font-normal text-muted-foreground">
        {formatStartDistance(mode, scheduledLocal)}
      </span>
    </div>
  );
}

function CreateTaskDialog({
  stages,
  defaultProjectId,
  onCreated,
}: {
  stages: Stage[];
  defaultProjectId: string | null;
  onCreated: () => Promise<void>;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [runMode, setRunMode] = useState<StartMode>("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const intakeStage = useMemo(
    () => stages.find((stage) => stage.systemRole === "intake") ?? stages[0],
    [stages],
  );

  const submit = async (request: NewThreadRequest) => {
    const description = descriptionFromRequest(request);
    const cleanTitle = title.trim() || titleFromPrompt(description);
    if (!cleanTitle) {
      toast.error("Describe the task or add a title");
      throw new Error("A task title is required");
    }
    if (!intakeStage) {
      toast.error("No starting stage is configured");
      throw new Error("A stage is required");
    }
    let scheduledAt: number | null = null;
    if (runMode === "later") {
      if (!scheduledLocal) {
        toast.error("Pick a date and time to schedule this task");
        throw new Error("A schedule is required");
      }
      scheduledAt = new Date(scheduledLocal).getTime();
      if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
        toast.error("Choose a future date and time");
        throw new Error("A future schedule is required");
      }
    }
    const task = await rpc.call("createTask", {
      title: cleanTitle,
      description,
      stageId: intakeStage.id,
      scheduledAt,
      runNow: runMode === "now",
      request,
    });
    // A run-now task emits its own lifecycle notification from the backend.
    // Avoid showing two success toasts for the same action.
    if (runMode !== "now") {
      toast.success(`Created Triage #${task.number}`, {
        description:
          runMode === "later" && scheduledAt
            ? `Scheduled ${formatWhen(scheduledAt)}.`
            : "Added to the board. Run it when ready.",
      });
    }
    setTitle("");
    setRunMode("now");
    setScheduledLocal("");
    setOpen(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Icon name="Plus" aria-hidden="true" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent className="triage-create-dialog max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New triage task</DialogTitle>
        </DialogHeader>
        <div className="triage-composer-shell">
          <NewThreadComposer
            defaultProjectId={defaultProjectId ?? undefined}
            onSubmit={submit}
            placeholder="Describe the work and what done looks like…"
            draftKey="triage-create-task"
            layout="document"
          />
        </div>
        <div className="triage-create-meta">
          <label className="triage-create-field">
            <span>Title <span className="font-normal text-muted-foreground">(optional)</span></span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Optional card title"
            />
          </label>
          <div className="triage-create-field triage-create-start">
            <span>Start</span>
            <StartPicker
              mode={runMode}
              scheduledLocal={scheduledLocal}
              onModeChange={setRunMode}
              onScheduledLocalChange={setScheduledLocal}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageStagesDialog({ stages, onChanged }: { stages: Stage[]; onChanged: () => Promise<void> }) {
  const rpc = useRpc<typeof rpcContract>();
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setNames(Object.fromEntries(stages.map((stage) => [stage.id, stage.name])));
  }, [stages]);

  const handle = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Icon name="Settings" aria-hidden="true" />
          Stages
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage stages</DialogTitle>
          <DialogDescription>Rename and reorder the workflow. Core routing stages stay available for scheduling and failures.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <Icon name="DragDropVertical" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Input
                value={names[stage.id] ?? stage.name}
                onChange={(event) => setNames((current) => ({ ...current, [stage.id]: event.target.value }))}
                onBlur={() => {
                  const next = (names[stage.id] ?? "").trim();
                  if (next && next !== stage.name) void handle(() => rpc.call("renameStage", { id: stage.id, name: next }), `Renamed stage to ${next}`);
                }}
                aria-label={`Stage name ${stage.name}`}
              />
              {stage.systemRole ? <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">Core</Badge> : null}
              <Button variant="ghost" size="icon" disabled={index === 0} aria-label={`Move ${stage.name} left`} onClick={() => void handle(() => rpc.call("reorderStage", { id: stage.id, direction: "left" }))}>
                <Icon name="ChevronLeft" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" disabled={index === stages.length - 1} aria-label={`Move ${stage.name} right`} onClick={() => void handle(() => rpc.call("reorderStage", { id: stage.id, direction: "right" }))}>
                <Icon name="ChevronRight" aria-hidden="true" />
              </Button>
              {!stage.systemRole ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${stage.name}`}><Icon name="Trash2" aria-hidden="true" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove “{stage.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>This works only when the stage has no cards. This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handle(() => rpc.call("deleteStage", { id: stage.id }), `Removed ${stage.name}`)}>Remove stage</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (!name) return;
            void handle(() => rpc.call("createStage", { name }), `Added ${name}`).then(() => setNewName(""));
          }}
        >
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New stage name" aria-label="New stage name" />
          <Button type="submit" variant="outline"><Icon name="Plus" aria-hidden="true" />Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskCard({
  task,
  stages,
  onOpen,
  onEdit,
  onMove,
  onRun,
  onStop,
  onDelete,
  onDragStart,
}: {
  task: Task;
  stages: Stage[];
  onOpen: () => void;
  onEdit: () => void;
  onMove: (stageId: string) => Promise<void>;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
}) {
  const running = isTaskRunning(task);
  return (
    <Card
      className={`triage-card group relative ${task.runState === "failed" ? "triage-card-attention" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      <button className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">Triage #{task.number}</span>
          <span className={`triage-run-dot triage-run-${task.runState} ${running ? "mr-14" : "mr-7"}`} aria-label={runStateLabel(task.runState)} />
        </div>
        <h3 className="mt-1.5 text-sm font-semibold leading-snug text-foreground">{task.title}</h3>
        {task.attentionReason ? <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{task.attentionReason}</p> : null}
      </button>
      <div className="triage-card-actions absolute right-1.5 top-1.5 flex items-center rounded-md border border-border bg-card p-0.5 shadow-sm">
        {!task.threadId ? (
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Run Triage #${task.number}`} onClick={() => void onRun()}>
            <Icon name="Play" className="size-3.5" aria-hidden="true" />
          </Button>
        ) : running ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Cancel Triage #${task.number}`}
            onClick={() => void onStop()}
          >
            <Icon name="Square" className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Edit Triage #${task.number}`} onClick={onEdit}>
          <Icon name="Edit" className="size-3.5" aria-hidden="true" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Delete Triage #${task.number}`}>
              <Icon name="Trash2" className="size-3.5" aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete Triage #{task.number}?</AlertDialogTitle><AlertDialogDescription>The linked BB thread is kept. The card and its event history will be removed.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void onDelete()}>Delete card</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5"><Icon name="Folder" className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{task.projectName}</span><span className="text-border">/</span><Icon name="GitBranch" className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate" title={task.branchName}>{task.branchName}</span></div>
        <div className="flex min-w-0 items-center gap-1.5"><Icon name="Laptop" className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{task.machineName}</span></div>
        <div className="flex min-w-0 items-center gap-1.5" title={`${task.providerId} · ${task.model} · ${formatReasoningLevel(task.reasoningLevel)}`}><span className="triage-agent-mark"><Icon name="AiContentGenerator01" className="size-3.5" aria-hidden="true" /></span><span className="truncate text-[10px] font-medium">{providerLabel(task.providerId)} · {task.model}</span></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {task.scheduledAt ? <><Icon name="Clock" className="size-3.5" aria-hidden="true" />{formatWhen(task.scheduledAt)}</> : runStateLabel(task.runState)}
        </span>
        <Select value={task.stageId} onValueChange={(value) => void onMove(value)}>
          <SelectTrigger className="h-7 w-[104px] shrink-0 border-0 bg-transparent px-2 text-[11px] opacity-0 shadow-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100" aria-label={`Move Triage #${task.number}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </Card>
  );
}

function EditTaskDialog({
  task,
  stages,
  open,
  onOpenChange,
  onChanged,
}: {
  task: Task | null;
  stages: Stage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stageId, setStageId] = useState("");
  const [startMode, setStartMode] = useState<StartMode>("manual");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task || !open) return;
    setTitle(task.title);
    setDescription(task.description);
    setStageId(task.stageId);
    setScheduledLocal(toDatetimeLocal(task.scheduledAt));
    setStartMode(task.scheduledAt === null ? "manual" : "later");
  }, [open, task?.id]);

  if (!task) return null;

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Add a title before saving");
      return;
    }
    try {
      setSaving(true);
      const scheduledAt = startMode === "later" ? fromDatetimeLocal(scheduledLocal) : null;
      if (startMode === "later" && (scheduledAt === null || scheduledAt <= Date.now())) {
        toast.error("Choose a future date and time");
        return;
      }
      await rpc.call("updateTask", {
        number: task.number,
        title: cleanTitle,
        description,
        stageId,
        scheduledAt: task.threadId ? task.scheduledAt : scheduledAt,
      });
      if (!task.threadId && startMode === "now") {
        await rpc.call("runTask", { number: task.number });
      }
      toast.success(`Updated Triage #${task.number}`);
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Triage #{task.number}</DialogTitle>
          <DialogDescription>
            Update the card details{task.threadId ? ". Existing agent instructions are not rewritten." : " and its future agent instructions."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Title
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Instructions
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-40 resize-y" maxLength={50_000} />
          </label>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Stage
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            {task.threadId ? (
              <div className="grid gap-1.5 text-sm font-medium">
                Start
                <div className="flex h-9 items-center rounded-md border border-border px-3 font-normal text-muted-foreground">
                  Already started
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5 text-sm font-medium">
                <span>Start</span>
                <StartPicker
                  mode={startMode}
                  scheduledLocal={scheduledLocal}
                  onModeChange={setStartMode}
                  onScheduledLocalChange={setScheduledLocal}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !stageId}>
            {saving ? <Icon name="Spinner" className="animate-spin" aria-hidden="true" /> : <Icon name="Check" aria-hidden="true" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function TaskDetailDialog({
  task,
  stages,
  open,
  onOpenChange,
  onEdit,
  onChanged,
}: {
  task: Task | null;
  stages: Stage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const rpc = useRpc<typeof rpcContract>();
  if (!task) return null;

  const action = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      toast.success(message);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Triage #{task.number}</span>
            <span>·</span>
            <span>{runStateLabel(task.runState)}</span>
          </div>
          <DialogTitle className="pr-8 text-xl">{task.title}</DialogTitle>
          <DialogDescription className="sr-only">Triage task details and actions</DialogDescription>
        </DialogHeader>
        {task.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{task.description}</p> : <p className="text-sm text-muted-foreground">No description was provided.</p>}
        {task.attentionReason ? (
          <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <Icon name="AlertTriangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div><p className="font-semibold">Needs attention</p><p className="mt-0.5 text-xs leading-relaxed">{task.attentionReason}</p></div>
          </div>
        ) : null}
        <dl className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Project</dt><dd className="mt-0.5 font-medium">{task.projectName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Machine</dt><dd className="mt-0.5 font-medium">{task.machineName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Agent</dt><dd className="mt-0.5 truncate font-medium">{task.providerId} · {task.model} · {formatReasoningLevel(task.reasoningLevel)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Stage</dt><dd className="mt-1"><Select value={task.stageId} onValueChange={(stageId) => void action(() => rpc.call("moveTask", { number: task.number, stageId }), `Moved Triage #${task.number}`)}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select></dd></div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive"><Icon name="Trash2" aria-hidden="true" />Delete</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Delete Triage #{task.number}?</AlertDialogTitle><AlertDialogDescription>The linked BB thread is kept. The card and its event history will be removed.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void action(() => rpc.call("deleteTask", { number: task.number }), `Deleted Triage #${task.number}`).then(() => onOpenChange(false))}>Delete card</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onEdit}><Icon name="Edit" aria-hidden="true" />Edit</Button>
            {!task.threadId ? <Button variant="outline" onClick={() => void action(() => rpc.call("runTask", { number: task.number }), `Started Triage #${task.number}`)}><Icon name="Play" aria-hidden="true" />Run now</Button> : null}
            {isTaskRunning(task) ? <Button variant="outline" onClick={() => void action(() => rpc.call("stopTask", { number: task.number }), `Stopped Triage #${task.number}`)}><Icon name="Square" aria-hidden="true" />Stop agent</Button> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TriageBoard() {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId: routeProjectId } = useBbContext();
  const navigate = useBbNavigate();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [draggedNumber, setDraggedNumber] = useState<number | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [editingNumber, setEditingNumber] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = (await rpc.call("snapshot")) as Snapshot;
      setSnapshot(next);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime("triage", (payload) => {
    const signal = payload as RealtimePayload;
    showNotification(signal.notification);
    void refresh();
  });

  useEffect(() => {
    if (connection === "connected") void refresh();
  }, [connection, refresh]);

  const filteredTasks = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.tasks.filter(
      (task) =>
        (projectFilter === "all" || task.projectId === projectFilter) &&
        (machineFilter === "all" ||
          (machineFilter === "project-default" ? task.machineId === null : task.machineId === machineFilter)),
    );
  }, [machineFilter, projectFilter, snapshot]);

  const move = async (task: Task, stageId: string) => {
    if (task.stageId === stageId) return;
    const previous = snapshot;
    setSnapshot((current) =>
      current
        ? { ...current, tasks: current.tasks.map((item) => (item.number === task.number ? { ...item, stageId } : item)) }
        : current,
    );
    try {
      await rpc.call("moveTask", { number: task.number, stageId });
      await refresh();
    } catch (moveError) {
      setSnapshot(previous);
      toast.error(moveError instanceof Error ? moveError.message : String(moveError));
    }
  };

  const taskAction = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      toast.success(message);
      await refresh();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : String(actionError));
    }
  };

  if (!snapshot && !error) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Icon name="Spinner" className="mr-2 size-4 animate-spin" aria-hidden="true" />Loading Triage…</div>;
  }
  if (error || !snapshot) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><Icon name="AlertTriangle" className="size-6 text-destructive" aria-hidden="true" /><div><p className="font-semibold">Triage could not load</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>;
  }

  const selectedTask = snapshot.tasks.find((task) => task.number === selectedNumber) ?? null;
  const editingTask = snapshot.tasks.find((task) => task.number === editingNumber) ?? null;
  const defaultProjectId = projectFilter !== "all" ? projectFilter : routeProjectId;
  const personalProject = snapshot.projects.find((project) => project.kind === "personal");
  const standardProjects = snapshot.projects.filter((project) => project.kind === "standard");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 w-[170px]" aria-label="Filter by project"><Icon name="Folder" className="mr-1 size-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
            <SelectContent>
              {personalProject ? <SelectItem value={personalProject.id}>Home (no project)</SelectItem> : null}
              <SelectItem value="all">All projects</SelectItem>
              {standardProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={machineFilter} onValueChange={setMachineFilter}>
            <SelectTrigger className="h-8 w-[180px]" aria-label="Filter by machine"><Icon name="Laptop" className="mr-1 size-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All machines</SelectItem><SelectItem value="project-default">Project default</SelectItem>{snapshot.machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.name}{machine.status === "disconnected" ? " · offline" : ""}</SelectItem>)}</SelectContent>
          </Select>
          {(projectFilter !== "all" || machineFilter !== "all") ? <Button variant="ghost" size="sm" onClick={() => { setProjectFilter("all"); setMachineFilter("all"); }}>Clear</Button> : null}
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"><span className={`size-1.5 rounded-full ${connection === "connected" ? "bg-success" : "bg-warning"}`} />{connection === "connected" ? "Live" : "Reconnecting"}</span>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <NotificationCenter notifications={snapshot.notifications} unreadCount={snapshot.unreadCount} onRead={async () => { await rpc.call("markNotificationsRead"); await refresh(); }} />
          <ManageStagesDialog stages={snapshot.stages} onChanged={refresh} />
          <CreateTaskDialog stages={snapshot.stages} defaultProjectId={defaultProjectId} onCreated={refresh} />
        </div>
      </div>

      <div className="triage-board min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-5">
        {snapshot.stages.map((stage) => {
          const cards = filteredTasks.filter((task) => task.stageId === stage.id);
          return (
            <section
              key={stage.id}
              className={`triage-column ${stage.systemRole === "attention" ? "triage-column-attention" : ""}`}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
              onDrop={(event) => {
                event.preventDefault();
                const task = filteredTasks.find((item) => item.number === draggedNumber);
                setDraggedNumber(null);
                if (task) void move(task, stage.id);
              }}
            >
              <header className="flex items-center justify-between gap-2 px-1 pb-3">
                <div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-sm font-semibold">{stage.name}</h2><span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{cards.length}</span></div>
                {stage.systemRole ? <span className={`size-2 rounded-full ${stage.systemRole === "attention" ? "bg-destructive" : stage.systemRole === "done" ? "bg-success" : "bg-muted-foreground/40"}`} /> : null}
              </header>
              <div className="triage-column-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pb-10">
                {cards.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    stages={snapshot.stages}
                    onOpen={() => {
                      if (task.threadId) navigate.toThread(task.threadId);
                      else setSelectedNumber(task.number);
                    }}
                    onEdit={() => { setSelectedNumber(null); setEditingNumber(task.number); }}
                    onMove={(stageId) => move(task, stageId)}
                    onRun={() => taskAction(() => rpc.call("runTask", { number: task.number }), `Started Triage #${task.number}`)}
                    onStop={() => taskAction(() => rpc.call("stopTask", { number: task.number }), `Stopped Triage #${task.number}`)}
                    onDelete={() => taskAction(() => rpc.call("deleteTask", { number: task.number }), `Deleted Triage #${task.number}`)}
                    onDragStart={() => setDraggedNumber(task.number)}
                  />
                ))}
                {cards.length === 0 ? <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">Drop a task here</div> : null}
              </div>
            </section>
          );
        })}
      </div>

      <TaskDetailDialog
        task={selectedTask}
        stages={snapshot.stages}
        open={selectedTask !== null}
        onOpenChange={(next) => { if (!next) setSelectedNumber(null); }}
        onEdit={() => { setSelectedNumber(null); if (selectedTask) setEditingNumber(selectedTask.number); }}
        onChanged={refresh}
      />
      <EditTaskDialog
        task={editingTask}
        stages={snapshot.stages}
        open={editingTask !== null}
        onOpenChange={(next) => { if (!next) setEditingNumber(null); }}
        onChanged={refresh}
      />
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "triage-board",
    title: "Triage",
    icon: "ListTodo",
    path: "triage",
    component: TriageBoard,
  });
});
