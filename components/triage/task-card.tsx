import * as React from "react";

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
  presentRunState,
  providerLabel,
} from "@/lib/triage-format";
import type { Stage, Task } from "@/lib/triage-types";

export interface TaskCardProps {
  task: Task;
  stages: Stage[];
  /** True when the board shows more than one machine's work. */
  showMachine: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onMove: (stageId: string) => void;
  onRun: () => void;
  onStop: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function MetaLine({ children }: { children: React.ReactNode }) {
  return <div className="triage-card-meta-line">{children}</div>;
}

function TaskCard({
  task,
  stages,
  showMachine,
  onOpen,
  onEdit,
  onMove,
  onRun,
  onStop,
  onDelete,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const running = isTaskRunning(task);
  const status = presentRunState(task);
  const brand = agentBrand(task.providerId, task.model);
  const stamp = task.scheduledAt ?? task.updatedAt;

  return (
    <>
      <Card
        className="triage-card group"
        data-tone={status.tone}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          // Firefox refuses to start a drag without payload on the transfer.
          event.dataTransfer.setData("text/plain", String(task.number));
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <div className="triage-card-head">
          <button
            type="button"
            className="triage-card-title"
            title={task.title}
            onClick={onOpen}
          >
            {task.title}
          </button>
          <div className="triage-card-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Actions for Triage #${task.number}`}
                >
                  <Icon name="MoreHorizontal" className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  Triage #{task.number}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={onOpen}>
                  <Icon name={task.threadId ? "MessageSquare" : "Eye"} aria-hidden="true" />
                  {task.threadId ? "Open thread" : "Open details"}
                </DropdownMenuItem>
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
                <DropdownMenuItem onSelect={onEdit}>
                  <Icon name="Edit" aria-hidden="true" />
                  Edit
                </DropdownMenuItem>
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

        <div className="triage-card-meta">
          <MetaLine>
            <Icon name="Folder" className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{task.projectName}</span>
            <span className="triage-card-meta-sep" aria-hidden="true" />
            <Icon name="GitBranch" className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate" title={task.branchName}>
              {task.branchName}
            </span>
          </MetaLine>
          <MetaLine>
            {showMachine ? (
              <>
                <Icon name="Laptop" className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{task.machineName}</span>
                <span className="triage-card-meta-sep" aria-hidden="true" />
              </>
            ) : null}
            <Icon
              name={brand.icon}
              className="triage-card-brand size-4 shrink-0"
              aria-label={brand.name}
            />
            <span className="truncate" title={`${task.providerId} · ${task.model}`}>
              {providerLabel(task.providerId)} · {task.model}
            </span>
          </MetaLine>
        </div>

        {task.attentionReason ? (
          <p className="triage-card-attention-note" title={task.attentionReason}>
            {task.attentionReason}
          </p>
        ) : null}

        <div className="triage-card-footer">
          <span className="triage-card-status">
            <StatusDot tone={status.tone} label={status.label} pulse={status.live} />
            <span className="truncate">{status.label}</span>
          </span>
          <time
            className="triage-card-time tabular-nums"
            dateTime={new Date(stamp).toISOString()}
            title={formatAbsolute(stamp)}
          >
            {formatShortWhen(stamp)}
          </time>
        </div>

      </Card>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Triage #{task.number}?</AlertDialogTitle>
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
