import * as React from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { StatusDot } from "@/components/ui/status-dot";
import { stageTone } from "@/lib/triage-format";
import type { TriageRpc } from "@/lib/triage-store";
import type { Stage } from "@/lib/triage-types";

export interface ManageStagesDialogProps {
  stages: Stage[];
  rpc: TriageRpc;
  onChanged: () => Promise<void>;
}

/** Board settings: the columns themselves, their order, and their names. */
function ManageStagesDialog({ stages, rpc, onChanged }: ManageStagesDialogProps) {
  const [newName, setNewName] = React.useState("");
  const [names, setNames] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
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
        <Button variant="ghost" size="icon" className="size-8" aria-label="Board settings">
          <Icon name="Settings" className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Board settings</DialogTitle>
          <DialogDescription>
            Rename and reorder the columns. Core routing stages stay available for scheduling and
            failures.
          </DialogDescription>
        </DialogHeader>
        <div className="triage-stage-list">
          {stages.map((stage, index) => (
            <div key={stage.id} className="triage-stage-row">
              <StatusDot tone={stageTone(stage)} className="shrink-0" />
              <Input
                value={names[stage.id] ?? stage.name}
                onChange={(event) =>
                  setNames((current) => ({ ...current, [stage.id]: event.target.value }))
                }
                onBlur={() => {
                  const next = (names[stage.id] ?? "").trim();
                  if (next && next !== stage.name) {
                    void handle(
                      () => rpc.call("renameStage", { id: stage.id, name: next }),
                      `Renamed stage to ${next}`,
                    );
                  }
                }}
                className="h-8"
                aria-label={`Stage name ${stage.name}`}
              />
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={index === 0}
                  aria-label={`Move ${stage.name} left`}
                  onClick={() =>
                    void handle(() => rpc.call("reorderStage", { id: stage.id, direction: "left" }))
                  }
                >
                  <Icon name="ChevronLeft" className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={index === stages.length - 1}
                  aria-label={`Move ${stage.name} right`}
                  onClick={() =>
                    void handle(() => rpc.call("reorderStage", { id: stage.id, direction: "right" }))
                  }
                >
                  <Icon name="ChevronRight" className="size-4" aria-hidden="true" />
                </Button>
                {stage.systemRole ? (
                  <span className="triage-stage-core" title="Used for automatic routing">
                    Core
                  </span>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-destructive"
                        aria-label={`Remove ${stage.name}`}
                      >
                        <Icon name="Trash2" className="size-4" aria-hidden="true" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {stage.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This works only when the stage has no cards. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            void handle(
                              () => rpc.call("deleteStage", { id: stage.id }),
                              `Removed ${stage.name}`,
                            )
                          }
                        >
                          Remove stage
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          className="triage-dialog-footer"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (!name) return;
            void handle(() => rpc.call("createStage", { name }), `Added ${name}`).then(() =>
              setNewName(""),
            );
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New stage name"
            aria-label="New stage name"
            className="flex-1"
          />
          <Button type="submit" variant="outline">
            <Icon name="Plus" aria-hidden="true" />
            Add stage
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { ManageStagesDialog };
