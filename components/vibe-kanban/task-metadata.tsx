import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import type { KanbanRpc } from "@/lib/vibe-kanban-store";
import type { Label, LabelColor, Priority } from "@/lib/vibe-kanban-types";

export const PRIORITIES: { value: Priority; label: string; bars: number }[] = [
  { value: "none", label: "No priority", bars: 0 },
  { value: "urgent", label: "Urgent", bars: 4 },
  { value: "high", label: "High", bars: 3 },
  { value: "medium", label: "Medium", bars: 2 },
  { value: "low", label: "Low", bars: 1 },
];
const COLORS: LabelColor[] = ["gray", "blue", "green", "amber", "red", "purple"];

export function PriorityMark({ value = "none" }: { value?: Priority }) {
  const priority = PRIORITIES.find((item) => item.value === value)!;
  return <span className="vibe-kanban-priority-mark" data-priority={value} aria-hidden="true">
    {value === "urgent" ? "!" : value === "none" ? <span>−</span> : [1, 2, 3].map((bar) =>
      <i key={bar} data-filled={bar <= priority.bars ? "" : undefined} style={{ height: 3 + bar * 3 }} />)}
  </span>;
}

export function PriorityPicker({ value, onChange, compact, disabled }: { value: Priority; onChange: (value: Priority) => void; compact?: boolean; disabled?: boolean }) {
  return <Select value={value} onValueChange={(next) => onChange(next as Priority)} disabled={disabled}>
    <SelectTrigger className={compact ? "vibe-kanban-priority-trigger" : "h-9 w-full"} aria-label={`Priority: ${PRIORITIES.find((item) => item.value === value)?.label}`}>
      <span className="flex items-center gap-2"><PriorityMark value={value} />{!compact && PRIORITIES.find((item) => item.value === value)?.label}</span>
    </SelectTrigger>
    <SelectContent>{PRIORITIES.map((item) => <SelectItem key={item.value} value={item.value}>
      <span className="flex items-center gap-2"><PriorityMark value={item.value} />{item.label}</span>
    </SelectItem>)}</SelectContent>
  </Select>;
}

export function LabelBadge({ label }: { label: Label }) {
  return <span className="vibe-kanban-label" title={label.name}><i className="vibe-kanban-label-dot" data-color={label.color} /><span>{label.name}</span></span>;
}

function ColorPicker({ value, onChange }: { value: LabelColor; onChange: (color: LabelColor) => void }) {
  return <div className="vibe-kanban-color-picker" role="group" aria-label="Label color">
    {COLORS.map((color) => <button key={color} type="button" aria-label={color} aria-pressed={value === color} onClick={() => onChange(color)}>
      <i className="vibe-kanban-label-dot" data-color={color} />
    </button>)}
  </div>;
}

export function LabelPicker({ labels, selected, onChange, rpc, onCreated, compact, disabled }: {
  labels: Label[]; selected: string[]; onChange: (ids: string[]) => void;
  rpc: KanbanRpc; onCreated: () => Promise<void>; compact?: boolean; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [busy, setBusy] = useState(false);
  const filtered = labels.filter((label) => label.name.toLowerCase().includes(query.trim().toLowerCase()));
  const canCreate = query.trim() && !labels.some((label) => label.name.toLowerCase() === query.trim().toLowerCase());
  return <Popover onOpenChange={() => setQuery("")}>
    <PopoverTrigger asChild>
      <Button variant="outline" disabled={disabled} className={compact ? "vibe-kanban-label-trigger" : "h-9 w-full justify-start font-normal"} aria-label="Edit task labels">
        <Icon name="Layers" className="size-3.5" aria-hidden="true" />
        {compact ? <span className="sr-only">Labels</span> : selected.length ? `${selected.length} label${selected.length === 1 ? "" : "s"}` : "Add labels"}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-2" mobileTitle="Task labels">
      <Input aria-label="Find or create a label" placeholder="Find or create a label…" value={query} maxLength={40} onChange={(event) => setQuery(event.target.value)} />
      <div className="my-2 max-h-52 overflow-auto">
        {filtered.map((label) => <button key={label.id} type="button" role="checkbox" aria-checked={selected.includes(label.id)} disabled={busy || disabled || (selected.length >= 20 && !selected.includes(label.id))}
          className="vibe-kanban-label-option" onClick={() => onChange(selected.includes(label.id) ? selected.filter((id) => id !== label.id) : [...selected, label.id])}>
          <LabelBadge label={label} />{selected.includes(label.id) && <Icon name="Check" className="size-4" aria-hidden="true" />}
        </button>)}
        {!labels.length && !query && <p className="px-2 py-3 text-xs text-muted-foreground">Type a name to create your first label.</p>}
      </div>
      {canCreate && <div className="grid gap-2 border-t border-border pt-2">
        <ColorPicker value={color} onChange={setColor} />
        <Button size="sm" variant="outline" disabled={busy || disabled} onClick={async () => {
          setBusy(true);
          try {
            const label = await rpc.call("createLabel", { name: query.trim(), color });
            await onCreated();
            onChange([...selected, label.id]);
            setQuery("");
          } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
          finally { setBusy(false); }
        }}>{busy ? "Creating…" : `Create “${query.trim()}”`}</Button>
      </div>}
    </PopoverContent>
  </Popover>;
}

function LabelEditor({ label, rpc, onChanged }: { label: Label; rpc: KanbanRpc; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [busy, setBusy] = useState(false);
  const mutate = async (remove: boolean) => {
    setBusy(true);
    try {
      if (remove) await rpc.call("deleteLabel", { id: label.id });
      else await rpc.call("updateLabel", { id: label.id, name: name.trim(), color });
      await onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="vibe-kanban-label-editor">
    <Input aria-label={`Label name: ${label.name}`} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
    <ColorPicker value={color} onChange={setColor} />
    <Button size="sm" variant="outline" disabled={busy || !name.trim() || (name === label.name && color === label.color)} onClick={() => void mutate(false)}>Save</Button>
    <Button variant="ghost" size="icon" disabled={busy} aria-label={`Delete label ${label.name}`} onClick={() => void mutate(true)}><Icon name="Trash2" className="size-4" /></Button>
  </div>;
}

export function ManageLabelsDialog({ labels, rpc, onChanged }: { labels: Label[]; rpc: KanbanRpc; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [busy, setBusy] = useState(false);
  return <Dialog>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8" aria-label="Manage labels"><Icon name="Layers" className="size-4" /><span className="vibe-kanban-header-label">Labels</span></Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle>Labels</DialogTitle><DialogDescription>Rename or recolor labels across the board. Deleting a label removes it from every card.</DialogDescription></DialogHeader>
      <div className="grid max-h-[55vh] gap-3 overflow-auto">{labels.map((label) => <LabelEditor key={`${label.id}:${label.name}:${label.color}`} label={label} rpc={rpc} onChanged={onChanged} />)}</div>
      <form className="vibe-kanban-label-editor border-t border-border pt-4" onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !name.trim()) return;
        setBusy(true);
        try { await rpc.call("createLabel", { name: name.trim(), color }); await onChanged(); setName(""); }
        catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
      }}>
        <Input aria-label="New label name" placeholder="New label name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create label"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
