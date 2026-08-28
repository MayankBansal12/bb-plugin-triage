import * as React from "react";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  type NewThreadRequest,
} from "@bb/plugin-sdk/app";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { formatWhen, titleFromPrompt } from "@/lib/triage-format";
import type { TriageRpc } from "@/lib/triage-store";
import type { Stage } from "@/lib/triage-types";

import { StartPicker, type StartMode } from "./start-picker";

function descriptionFromRequest(request: NewThreadRequest): string {
  return request.input
    .filter(
      (part): part is Extract<(typeof request.input)[number], { type: "text" }> =>
        part.type === "text",
    )
    .filter((part) => part.visibility !== "agent-only")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export interface CreateTaskDialogProps {
  stages: Stage[];
  defaultProjectId: string | null;
  rpc: TriageRpc;
  onCreated: () => Promise<void>;
}

function CreateTaskDialog({
  stages,
  defaultProjectId,
  rpc,
  onCreated,
}: CreateTaskDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [runMode, setRunMode] = React.useState<StartMode>("now");
  const [scheduledLocal, setScheduledLocal] = React.useState("");
  const intakeStage = React.useMemo(
    () => stages.find((stage) => stage.systemRole === "intake") ?? stages[0],
    [stages],
  );

  const submit = async (request: NewThreadRequest) => {
    const description = descriptionFromRequest(request);
    const cleanTitle = title.trim() || titleFromPrompt(description);
    if (!cleanTitle) {
      toast.error("Describe the task or add a name");
      throw new Error("A task name is required");
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
        <Button size="sm" className="h-8">
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
            placeholder="Describe the work and what done looks like"
            draftKey="triage-create-task"
            layout="document"
          />
        </div>
        <div className="triage-create-meta">
          <Field>
            <FieldLabel htmlFor="triage-create-name" optional>
              Name
            </FieldLabel>
            <Input
              id="triage-create-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Taken from the prompt when left blank"
            />
          </Field>
          <Field>
            <FieldLabel>Start</FieldLabel>
            <StartPicker
              mode={runMode}
              scheduledLocal={scheduledLocal}
              onModeChange={setRunMode}
              onScheduledLocalChange={setScheduledLocal}
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CreateTaskDialog };
