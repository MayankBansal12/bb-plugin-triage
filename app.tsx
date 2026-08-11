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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  providerId: string;
  model: string;
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
        <Button variant="outline" size="icon" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative">
          <Icon name="Mail" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
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
  const [stageId, setStageId] = useState(stages.find((stage) => stage.systemRole === "intake")?.id ?? stages[0]?.id ?? "");
  const [runMode, setRunMode] = useState<"board" | "now" | "later">("board");
  const [scheduledLocal, setScheduledLocal] = useState("");

  useEffect(() => {
    if (!stageId && stages[0]) setStageId(stages[0].id);
  }, [stageId, stages]);

  const submit = async (request: NewThreadRequest) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Add a title before creating this card");
      throw new Error("A task title is required");
    }
    if (!stageId) {
      toast.error("Choose a stage");
      throw new Error("A stage is required");
    }
    let scheduledAt: number | null = null;
    if (runMode === "later") {
      scheduledAt = new Date(scheduledLocal).getTime();
      if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
        toast.error("Choose a future date and time");
        throw new Error("A future schedule is required");
      }
    }
    const task = await rpc.call("createTask", {
      title: cleanTitle,
      description: descriptionFromRequest(request),
      stageId,
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
            : "Added to the board.",
      });
    }
    setTitle("");
    setRunMode("board");
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create a Triage task</DialogTitle>
          <DialogDescription>Describe the work, assign its BB agent, and decide when it should start.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 border-b border-border pb-5 md:grid-cols-[minmax(0,1fr)_190px]">
          <label className="grid gap-1.5 text-sm font-medium">
            Title
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to happen?" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Starting stage
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="Choose stage" /></SelectTrigger>
              <SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Start
            <Select value={runMode} onValueChange={(value) => setRunMode(value as typeof runMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="board">Keep on board</SelectItem>
                <SelectItem value="now">Run now</SelectItem>
                <SelectItem value="later">Schedule for later</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {runMode === "later" ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Scheduled time
              <Input type="datetime-local" value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} />
            </label>
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
        <div className="min-h-[360px] pt-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Instructions and assignment</p>
          <NewThreadComposer
            defaultProjectId={defaultProjectId ?? undefined}
            onSubmit={submit}
            placeholder="Describe the task, expected outcome, and anything the agent should verify…"
            draftKey="triage-create-task"
            layout="document"
          />
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
  onMove,
  onDragStart,
}: {
  task: Task;
  stages: Stage[];
  onOpen: () => void;
  onMove: (stageId: string) => Promise<void>;
  onDragStart: () => void;
}) {
  return (
    <article
      className={`triage-card group ${task.runState === "failed" ? "triage-card-attention" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      <button className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">Triage #{task.number}</span>
          <span className={`triage-run-dot triage-run-${task.runState}`} aria-label={runStateLabel(task.runState)} />
        </div>
        <h3 className="mt-1.5 text-sm font-semibold leading-snug text-foreground">{task.title}</h3>
        {task.description ? <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{task.description}</p> : null}
        {task.attentionReason ? <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{task.attentionReason}</p> : null}
      </button>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="max-w-full truncate">{task.projectName}</Badge>
        <Badge variant="outline" className="max-w-full truncate">{task.machineName}</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.scheduledAt ? <><Icon name="Clock" className="size-3.5" aria-hidden="true" />{formatWhen(task.scheduledAt)}</> : runStateLabel(task.runState)}
        </span>
        <Select value={task.stageId} onValueChange={(value) => void onMove(value)}>
          <SelectTrigger className="h-7 w-[120px] border-0 bg-transparent px-2 text-[11px] opacity-0 shadow-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100" aria-label={`Move Triage #${task.number}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </article>
  );
}

function TaskDetailDialog({
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
  const navigate = useBbNavigate();
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
          <div><dt className="text-xs text-muted-foreground">Agent</dt><dd className="mt-0.5 truncate font-medium">{task.providerId} · {task.model}</dd></div>
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
            {!task.threadId ? <Button variant="outline" onClick={() => void action(() => rpc.call("runTask", { number: task.number }), `Started Triage #${task.number}`)}><Icon name="Play" aria-hidden="true" />Run now</Button> : null}
            {task.threadId ? <Button onClick={() => navigate.toThread(task.threadId!)}><Icon name="MessageSquare" aria-hidden="true" />Open agent thread</Button> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TriageBoard() {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId: routeProjectId } = useBbContext();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [draggedNumber, setDraggedNumber] = useState<number | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

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

  if (!snapshot && !error) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Icon name="Spinner" className="mr-2 size-4 animate-spin" aria-hidden="true" />Loading Triage…</div>;
  }
  if (error || !snapshot) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><Icon name="AlertTriangle" className="size-6 text-destructive" aria-hidden="true" /><div><p className="font-semibold">Triage could not load</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>;
  }

  const selectedTask = snapshot.tasks.find((task) => task.number === selectedNumber) ?? null;
  const defaultProjectId = projectFilter !== "all" ? projectFilter : routeProjectId;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 w-[170px]" aria-label="Filter by project"><Icon name="Folder" className="mr-1 size-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All projects</SelectItem>{snapshot.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={machineFilter} onValueChange={setMachineFilter}>
            <SelectTrigger className="h-8 w-[180px]" aria-label="Filter by machine"><Icon name="Laptop" className="mr-1 size-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All machines</SelectItem><SelectItem value="project-default">Project default</SelectItem>{snapshot.machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.name}{machine.status === "disconnected" ? " · offline" : ""}</SelectItem>)}</SelectContent>
          </Select>
          {(projectFilter !== "all" || machineFilter !== "all") ? <Button variant="ghost" size="sm" onClick={() => { setProjectFilter("all"); setMachineFilter("all"); }}>Clear</Button> : null}
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"><span className={`size-1.5 rounded-full ${connection === "connected" ? "bg-success" : "bg-warning"}`} />{connection === "connected" ? "Live" : "Reconnecting"}</span>
        </div>
        <div className="flex items-center gap-2">
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
              <header className="flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{stage.name}</h2><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{cards.length}</span></div>
                {stage.systemRole ? <span className={`size-2 rounded-full ${stage.systemRole === "attention" ? "bg-destructive" : stage.systemRole === "done" ? "bg-success" : "bg-muted-foreground/40"}`} /> : null}
              </header>
              <div className="triage-column-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pb-10">
                {cards.map((task) => (
                  <TaskCard key={task.id} task={task} stages={snapshot.stages} onOpen={() => setSelectedNumber(task.number)} onMove={(stageId) => move(task, stageId)} onDragStart={() => setDraggedNumber(task.number)} />
                ))}
                {cards.length === 0 ? <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">Drop a task here</div> : null}
              </div>
            </section>
          );
        })}
      </div>

      <TaskDetailDialog task={selectedTask} stages={snapshot.stages} open={selectedTask !== null} onOpenChange={(next) => { if (!next) setSelectedNumber(null); }} onChanged={refresh} />
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
