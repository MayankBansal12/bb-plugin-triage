import * as React from "react";
import { toast } from "sonner";
import { LabelBadge, LabelPicker, PriorityPicker } from "./task-metadata";
import type { KanbanRpc } from "@/lib/vibe-kanban-store";
import { RenameTaskDialog } from "./rename-task-dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { StatusDot } from "@/components/ui/status-dot";
import {
  agentBrand,
  formatAbsolute,
  formatShortWhen,
  isTaskRunning,
  supportsTaskRead,
  presentRunState,
  providerLabel,
} from "@/lib/vibe-kanban-format";
import type { Label, Priority, Stage, Task } from "@/lib/vibe-kanban-types";

export interface TaskCardProps {
  task: Task;
  labels: Label[];
  rpc: KanbanRpc;
  onRefresh: () => Promise<void>;
  stages: Stage[];
  /** True when the board shows more than one machine's work. */
  showMachine: boolean;
  onOpen: () => void;
  onToggleSidebar: () => void;
  onMove: (stageId: string) => void;
  onRun: () => void;
  onStop: () => void;
  onSetSettled: (settled: boolean) => void;
  onSetRead: (read: boolean) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function TaskCard({
  task,
  labels,
  rpc,
  onRefresh,
  stages,
  showMachine,
  onOpen,
  onToggleSidebar,
  onMove,
  onRun,
  onStop,
  onSetSettled,
  onSetRead,
  onDelete,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const [savingMetadata, setSavingMetadata] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [editingProperties, setEditingProperties] = React.useState(false);
  const taskLabels = task.labels ?? [];
  const childCount = task.threadId ? task.childThreadCount ?? 0 : 0;
  const hasReadState = supportsTaskRead(task);
  const running = isTaskRunning(task);
  const status = presentRunState(task);
  const brand = agentBrand(task.providerId, task.model);
  const stamp = task.runState === "scheduled" && task.scheduledAt ? task.scheduledAt : task.updatedAt;
  const changeMetadata = async (patch: { priority?: Priority; labelIds?: string[] }) => {
    setSavingMetadata(true);
    try { await rpc.call("setTaskMetadata", { number: task.number, ...patch }); await onRefresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setSavingMetadata(false); }
  };

  return (
    <>
      <Card
        className="vibe-kanban-card group"
        data-tone={status.tone}
        data-running={running ? "" : undefined}
        data-unread={hasReadState && task.readAt === null ? "" : undefined}
        data-read={hasReadState && task.readAt !== null && !running ? "" : undefined}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          // Firefox refuses to start a drag without payload on the transfer.
          event.dataTransfer.setData("text/plain", String(task.number));
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <div className="vibe-kanban-card-head">
          <span className="vibe-kanban-card-id">VK-{task.number}</span>
          {task.priority && task.priority !== "none" && <PriorityPicker compact value={task.priority} disabled={savingMetadata} onChange={(priority) => void changeMetadata({ priority })} />}
          <time className="vibe-kanban-card-time ml-auto tabular-nums" dateTime={new Date(stamp).toISOString()} title={formatAbsolute(stamp)}>
            {task.runState === "scheduled" ? `Starts ${formatShortWhen(stamp)}` : formatShortWhen(stamp)}
          </time>
          <div className="vibe-kanban-card-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Actions for Vibe Kanban #${task.number}`}
                >
                  <Icon name="MoreHorizontal" className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  Vibe Kanban #{task.number}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={onOpen}>
                  <Icon name={task.threadId ? "MessageSquare" : "Edit"} aria-hidden="true" />
                  {task.threadId ? "Open thread" : "Edit task"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setRenaming(true))}>
                  <Icon name="Edit" aria-hidden="true" />
                  Edit title
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setEditingProperties(true))}>
                  <Icon name="Layers" aria-hidden="true" />
                  Labels & priority
                </DropdownMenuItem>
                {task.threadId ? (
                  <DropdownMenuItem disabled={task.sidebarVisible == null} onSelect={onToggleSidebar}>
                    <Icon name="MessageSquare" aria-hidden="true" />
                    {task.sidebarVisible ? "Hide session from sidebar" : "Show session in sidebar"}
                  </DropdownMenuItem>
                ) : null}
                {!task.threadId ? (
                  <DropdownMenuItem onSelect={onRun}>
                    <Icon name="Play" aria-hidden="true" />
                    Run now
                  </DropdownMenuItem>
                ) : null}
                {running ? (
                  <DropdownMenuItem onSelect={onStop}>
                    <Icon name="Square" aria-hidden="true" />
                    Stop agent
                  </DropdownMenuItem>
                ) : null}
                {hasReadState ? (
                <DropdownMenuItem onSelect={() => onSetRead(task.readAt === null)}>
                  <Icon name={task.readAt === null ? "Eye" : "MailOpen"} aria-hidden="true" />
                  {task.readAt === null ? "Mark read" : "Mark unread"}
                </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => onSetSettled(!task.settledAt)}>
                  <Icon name={task.settledAt ? "ArchiveRestore" : "Check"} aria-hidden="true" />
                  {task.settledAt ? "Reopen" : "Archive card"}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Icon name="ArrowRight" aria-hidden="true" />
                    Move to
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={task.stageId} onValueChange={onMove}>
                      {stages.map((stage) => (
                        <DropdownMenuRadioItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    // Let the menu finish closing before the dialog takes focus.
                    requestAnimationFrame(() => setConfirmingDelete(true));
                  }}
                >
                  <Icon name="Trash2" aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <button type="button" className="vibe-kanban-card-title" title={task.title} onClick={onOpen}>{task.title}</button>
        <div className="vibe-kanban-card-context" title={`${task.projectName} · ${task.branchName}${showMachine ? ` · ${task.machineName}` : ""}`}>
          <span className="truncate">{task.projectName}</span>
        </div>
        {(taskLabels.length > 0 || childCount > 0) && <div className="vibe-kanban-card-tags">
          {taskLabels.map((label) => <button key={label.id} type="button" className="vibe-kanban-card-label" aria-label={`Edit label ${label.name}`} onClick={() => setEditingProperties(true)}><LabelBadge label={label} /></button>)}
          {childCount > 0 && <span className="vibe-kanban-children" title={`${childCount} child thread${childCount === 1 ? "" : "s"}`}>
            <Icon name="Fork" className="size-3.5" aria-hidden="true" />{childCount} <span>{childCount === 1 ? "child thread" : "child threads"}</span>
          </span>}
        </div>}

        {task.attentionReason ? (
          <p className="vibe-kanban-card-attention-note" title={task.attentionReason}>
            {task.attentionReason}
          </p>
        ) : null}

        <div className="vibe-kanban-card-footer">
          <span className="vibe-kanban-card-agent" title={`${providerLabel(task.providerId)} · ${task.model}`}>
            <Icon name={brand.icon} className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{providerLabel(task.providerId)}</span>
          </span>
          <span className="vibe-kanban-card-status" data-running={running ? "" : undefined}>
            <StatusDot tone={running ? "done" : status.tone} pulse={running} />
            <span className="truncate">{running ? task.agentStatus === "starting" || task.runState === "starting" ? "Agent starting" : "Agent running" : status.label}</span>
          </span>
          {!task.threadId && !running && task.settledAt === null && <Button variant="ghost" size="icon" className="vibe-kanban-run-button size-6" aria-label={`Run VK-${task.number} now`} onClick={onRun}><Icon name="Play" className="size-3.5" /></Button>}
        </div>

      </Card>

      <Dialog open={editingProperties} onOpenChange={setEditingProperties}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Labels & priority</DialogTitle>
            <DialogDescription>VK-{task.number} · {task.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">Priority</p>
              <PriorityPicker value={task.priority ?? "none"} disabled={savingMetadata} onChange={(priority) => void changeMetadata({ priority })} />
            </div>
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">Labels</p>
              <LabelPicker labels={labels} selected={taskLabels.map((label) => label.id)} rpc={rpc} onCreated={onRefresh}
                disabled={savingMetadata} onChange={(labelIds) => void changeMetadata({ labelIds })} />
              {taskLabels.length > 0 && <div className="flex flex-wrap gap-1">{taskLabels.map((label) => <LabelBadge key={label.id} label={label} />)}</div>}
            </div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Done</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
      {renaming ? <RenameTaskDialog task={task} open={renaming} onOpenChange={setRenaming} /> : null}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vibe Kanban #{task.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{task.title}” leaves the board. The linked BB thread is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete card</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { TaskCard };
