import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldHint, FieldLabel, FieldRow } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  agentBrand,
  formatReasoningLevel,
  fromDatetimeLocal,
  toDatetimeLocal,
} from "@/lib/triage-format";
import { loadAgentOptions, type TriageRpc } from "@/lib/triage-store";
import type { AgentModelOption, AgentOptions, ReasoningLevel, Stage, Task } from "@/lib/triage-types";

import { StartPicker, type StartMode } from "./start-picker";

const ALL_REASONING: ReasoningLevel[] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "ultracode",
  "max",
  "ultra",
];

/** Stable select value for a provider + model pair. */
function agentKey(providerId: string, model: string): string {
  return `${providerId}|${model}`;
}

/** Split on the first separator only, so a model id may contain one. */
function parseAgentKey(key: string): { providerId: string; model: string } | null {
  const at = key.indexOf("|");
  if (at <= 0 || at === key.length - 1) return null;
  return { providerId: key.slice(0, at), model: key.slice(at + 1) };
}

export interface EditTaskDialogProps {
  task: Task | null;
  stages: Stage[];
  rpc: TriageRpc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}

/**
 * Everything about a card a person can still change: its name, the prompt the
 * agent will read, where it sits, when it starts, and which agent runs it.
 * Agent and schedule lock once a thread exists — that run has already begun.
 */
function EditTaskDialog({
  task,
  stages,
  rpc,
  open,
  onOpenChange,
  onChanged,
}: EditTaskDialogProps) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [startMode, setStartMode] = React.useState<StartMode>("manual");
  const [scheduledLocal, setScheduledLocal] = React.useState("");
  const [agent, setAgent] = React.useState("");
  const [reasoning, setReasoning] = React.useState<ReasoningLevel>("none");
  const [options, setOptions] = React.useState<AgentOptions | null>(null);
  const [saving, setSaving] = React.useState(false);

  const started = Boolean(task?.threadId);

  React.useEffect(() => {
    if (!task || !open) return;
    setTitle(task.title);
    setDescription(task.description);
    setStageId(task.stageId);
    setScheduledLocal(toDatetimeLocal(task.scheduledAt));
    setStartMode(task.scheduledAt === null ? "manual" : "later");
    setAgent(agentKey(task.providerId, task.model));
    setReasoning(task.reasoningLevel);
  }, [open, task?.id]);

  React.useEffect(() => {
    if (!open || started) return;
    let live = true;
    void loadAgentOptions(rpc)
      .then((next) => {
        if (live) setOptions(next);
      })
      .catch(() => {
        // A host that cannot list providers still lets everything else be
        // edited; the picker just stays on the card's current agent.
        if (live) setOptions({ providers: [], models: [] });
      });
    return () => {
      live = false;
    };
  }, [open, rpc, started]);

  const grouped = React.useMemo(() => {
    if (!task) return [];
    const providers = new Map<string, { name: string; models: AgentModelOption[] }>();
    for (const model of options?.models ?? []) {
      const provider = providers.get(model.providerId) ?? {
        name:
          options?.providers.find((entry) => entry.id === model.providerId)?.name ??
          model.providerId,
        models: [],
      };
      provider.models.push(model);
      providers.set(model.providerId, provider);
    }
    // Keep the card's own agent selectable even when its host is offline.
    const current = agentKey(task.providerId, task.model);
    const known = (options?.models ?? []).some(
      (model) => agentKey(model.providerId, model.model) === current,
    );
    if (!known) {
      const provider = providers.get(task.providerId) ?? { name: task.providerId, models: [] };
      provider.models = [
        {
          id: current,
          providerId: task.providerId,
          model: task.model,
          displayName: task.model,
          description: "Currently assigned",
          supportedReasoningEfforts: ALL_REASONING,
          defaultReasoningEffort: task.reasoningLevel,
        },
        ...provider.models,
      ];
      providers.set(task.providerId, provider);
    }
    return [...providers.entries()].map(([id, value]) => ({ id, ...value }));
  }, [options, task]);

  const selectedModel = React.useMemo(
    () =>
      grouped
        .flatMap((provider) => provider.models)
        .find((model) => agentKey(model.providerId, model.model) === agent) ?? null,
    [agent, grouped],
  );

  const reasoningChoices =
    selectedModel && selectedModel.supportedReasoningEfforts.length > 0
      ? selectedModel.supportedReasoningEfforts
      : ALL_REASONING;

  // A model swap can drop the level the card was on; fall back to the model's
  // own default instead of saving an effort the provider will reject.
  React.useEffect(() => {
    if (!selectedModel) return;
    if (reasoningChoices.includes(reasoning)) return;
    setReasoning(selectedModel.defaultReasoningEffort);
  }, [reasoning, reasoningChoices, selectedModel]);

  if (!task) return null;

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Add a name before saving");
      return;
    }
    try {
      setSaving(true);
      const scheduledAt = startMode === "later" ? fromDatetimeLocal(scheduledLocal) : null;
      if (startMode === "later" && (scheduledAt === null || scheduledAt <= Date.now())) {
        toast.error("Choose a future date and time");
        return;
      }
      const picked = parseAgentKey(agent);
      const retargeted =
        !started &&
        picked !== null &&
        (picked.providerId !== task.providerId || picked.model !== task.model);
      await rpc.call("updateTask", {
        number: task.number,
        title: cleanTitle,
        description,
        stageId,
        scheduledAt: started ? task.scheduledAt : scheduledAt,
        ...(retargeted && picked ? { providerId: picked.providerId, model: picked.model } : {}),
        ...(!started && reasoning !== task.reasoningLevel ? { reasoningLevel: reasoning } : {}),
      });
      if (!started && startMode === "now") {
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
      <DialogContent className="triage-edit-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Triage #{task.number}</DialogTitle>
          <DialogDescription>
            {started
              ? "The agent is already running, so its assignment and schedule are fixed."
              : "Rename it, rewrite the prompt, move it, or hand it to a different agent."}
          </DialogDescription>
        </DialogHeader>

        <div className="triage-edit-body">
          <Field>
            <FieldLabel htmlFor="triage-edit-name">Name</FieldLabel>
            <Input
              id="triage-edit-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder="What this card is called on the board"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="triage-edit-prompt">Prompt</FieldLabel>
            <Textarea
              id="triage-edit-prompt"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-28 resize-y"
              maxLength={50_000}
              placeholder="Describe the work and what done looks like"
            />
            <FieldHint>
              {started
                ? "Kept on the card for reference. The running agent keeps its original instructions."
                : "Sent to the agent when this card runs."}
            </FieldHint>
          </Field>

          <FieldRow>
            <Field>
              <FieldLabel>Stage</FieldLabel>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger aria-label="Stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Schedule</FieldLabel>
              {started ? (
                <div className="triage-locked-field">
                  <Icon name="Play" className="size-4 shrink-0" aria-hidden="true" />
                  Already started
                </div>
              ) : (
                <StartPicker
                  mode={startMode}
                  scheduledLocal={scheduledLocal}
                  onModeChange={setStartMode}
                  onScheduledLocalChange={setScheduledLocal}
                />
              )}
            </Field>
          </FieldRow>

          <FieldGroup
            title="Agent"
            description={
              started
                ? "Locked to the thread that is already running."
                : "Who picks this up, and how hard it thinks."
            }
          >
            <FieldRow>
              <Field>
                <FieldLabel>Model</FieldLabel>
                {started ? (
                  <div className="triage-locked-field">
                    <Icon
                      name={agentBrand(task.providerId, task.model).icon}
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {task.providerId} · {task.model}
                    </span>
                  </div>
                ) : options === null ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={agent} onValueChange={setAgent}>
                    <SelectTrigger aria-label="Agent model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {grouped.map((provider) => (
                        <SelectGroup key={provider.id}>
                          <SelectLabel>{provider.name}</SelectLabel>
                          {provider.models.map((model) => (
                            <SelectItem
                              key={agentKey(model.providerId, model.model)}
                              value={agentKey(model.providerId, model.model)}
                            >
                              {model.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field>
                <FieldLabel>Thinking</FieldLabel>
                {started ? (
                  <div className="triage-locked-field">
                    <Icon name="Zap" className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{formatReasoningLevel(task.reasoningLevel)}</span>
                  </div>
                ) : (
                  <Select
                    value={reasoning}
                    onValueChange={(value) => setReasoning(value as ReasoningLevel)}
                  >
                    <SelectTrigger aria-label="Thinking level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reasoningChoices.map((level) => (
                        <SelectItem key={level} value={level}>
                          {formatReasoningLevel(level)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </FieldRow>
          </FieldGroup>
        </div>

        <div className="triage-dialog-footer">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !stageId}>
            {saving ? (
              <Icon name="Spinner" className="animate-spin" aria-hidden="true" />
            ) : (
              <Icon name="Check" aria-hidden="true" />
            )}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { EditTaskDialog };
