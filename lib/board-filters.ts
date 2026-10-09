import type { Task } from "./vibe-kanban-types";

export function matchesBoardFilters(task: Task, filters: { query: string; agent: string; labelIds: string[] }): boolean {
  if (filters.agent !== "all" && task.providerId !== filters.agent) return false;
  if (!filters.labelIds.every((id) => task.labels?.some((label) => label.id === id))) return false;
  const query = filters.query.trim().toLocaleLowerCase();
  return !query || [`VK-${task.number}`, `#${task.number}`, task.title, task.projectName, ...(task.labels ?? []).map((label) => label.name)].some((value) => value.toLocaleLowerCase().includes(query));
}

const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
export function compareTaskPriority(a: Task, b: Task): number {
  return rank[a.priority ?? "none"] - rank[b.priority ?? "none"] || b.updatedAt - a.updatedAt || b.number - a.number;
}
