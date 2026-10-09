import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";
import { matchesBoardFilters, compareTaskPriority } from "../lib/board-filters.ts";
import { isTaskRunning, presentRunState } from "../lib/vibe-kanban-format.ts";
import type { Label, Snapshot, Task } from "../lib/vibe-kanban-types.ts";

const request = {
  projectId: "project-1", providerId: "codex", model: "test-model", reasoningLevel: "none",
  permissionMode: "auto", executionInputSources: {},
  environment: { type: "reuse", environmentId: "environment-1" },
  input: [{ type: "text", text: "Do the work" }],
};
async function setup() {
  const thread = makeThreadResponse({ id: "parent-1", projectId: "project-1", status: "active" });
  const host = createFakePluginHost({ pluginId: "vibe-kanban", sdk: {
    projects: { list: async () => [], get: async () => ({ id: "project-1", name: "App" }) },
    hosts: { list: async () => [] },
    environments: { get: async () => { throw new Error("Offline"); } },
    threads: {
      get: async () => thread,
      childSummary: async () => ({ nonDeletedChildCount: 1200 }),
      defaultExecutionOptions: async () => null,
      update: async () => thread,
    },
  } });
  await plugin(host.bb);
  return { ...host, thread };
}

test("labels and user priorities persist across reload without starting work or altering schedules", async () => {
  let { harness } = await setup();
  try {
    const label = await harness.behavior.callRpc("createLabel", { name: "  API  ", color: "blue" }) as Label;
    assert.equal(label.name, "API");
    await assert.rejects(harness.behavior.callRpc("createLabel", { name: "api", color: "red" }), /already exists/);
    const scheduledAt = Date.now() + 3_600_000;
    const task = await harness.behavior.callRpc("createTask", { title: "API work", description: "Do work", stageId: "stage-backlog", scheduledAt, runNow: false, request, priority: "high", labelIds: [label.id, label.id] }) as Task;
    assert.equal(task.priority, "high");
    assert.equal(task.labels?.length, 1);
    const changed = await harness.behavior.callRpc("setTaskMetadata", { number: task.number, priority: "urgent" }) as Task;
    assert.equal(changed.stageId, "stage-backlog");
    assert.equal(changed.runState, "scheduled");
    assert.equal(changed.scheduledAt, scheduledAt);
    assert.equal(changed.labels?.[0]?.name, "API");
    assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
    ({ harness } = await harness.lifecycle.reload(plugin));
    const snapshot = await harness.behavior.callRpc("snapshot", null) as Snapshot;
    assert.equal(snapshot.tasks[0]?.priority, "urgent");
    assert.equal(snapshot.tasks[0]?.labels?.[0]?.name, "API");
    assert.equal(snapshot.tasks[0]?.scheduledAt, scheduledAt);
    await harness.behavior.callRpc("updateLabel", { id: label.id, name: "Backend", color: "purple" });
    assert.equal((await harness.behavior.callRpc("snapshot", null) as Snapshot).tasks[0]?.labels?.[0]?.name, "Backend");
    await harness.behavior.callRpc("deleteLabel", { id: label.id });
    const cleared = await harness.behavior.callRpc("snapshot", null) as Snapshot;
    assert.deepEqual(cleared.labels, []);
    assert.deepEqual(cleared.tasks[0]?.labels, []);
    assert.equal(cleared.tasks[0]?.priority, "urgent");
  } finally { await harness.lifecycle.dispose(); }
});

test("invalid labels roll back metadata and task creation, and priorities are validated", async () => {
  const { harness } = await setup();
  try {
    const input = { title: "Task", description: "Prompt", stageId: "stage-todo", scheduledAt: null, runNow: false, request };
    await assert.rejects(harness.behavior.callRpc("createTask", { ...input, labelIds: ["missing"] }), /no longer exists/);
    assert.equal((await harness.behavior.callRpc("snapshot", null) as Snapshot).tasks.length, 0);
    const task = await harness.behavior.callRpc("createTask", input) as Task;
    assert.equal(task.priority, "none");
    await assert.rejects(harness.behavior.callRpc("setTaskMetadata", { number: task.number, priority: "high", labelIds: ["missing"] }), /no longer exists/);
    await assert.rejects(harness.behavior.callRpc("setTaskMetadata", { number: task.number, priority: "automatic" }));
    const snapshot = await harness.behavior.callRpc("snapshot", null) as Snapshot;
    assert.equal(snapshot.tasks[0]?.priority, "none");
    await assert.rejects(harness.behavior.callRpc("createTask", { ...input, scheduledAt: Date.now() - 1 }), /future/);
    await assert.rejects(harness.behavior.callRpc("createTask", { ...input, scheduledAt: Date.now() + 60_000, runNow: true }), /either/);
  } finally { await harness.lifecycle.dispose(); }
});

test("child count uses BB's full summary and live status survives completion and unavailable counts", async () => {
  const { harness, thread } = await setup();
  try {
    const task = await harness.behavior.callRpc("importThread", { threadId: thread.id }) as Task;
    await harness.behavior.callRpc("setTaskMetadata", { number: task.number, priority: "low" });
    await harness.behavior.callRpc("moveTask", { number: task.number, stageId: "stage-completed" });
    const snapshot = await harness.behavior.callRpc("snapshot", null) as Snapshot;
    const card = snapshot.tasks[0]!;
    assert.equal(card.childThreadCount, 1200);
    assert.equal(card.priority, "low");
    assert.equal(card.runState, "completed");
    assert.equal(isTaskRunning(card), true);
    thread.status = "idle";
    harness.inspection.sdk.stub("threads.childSummary", async () => { throw new Error("Temporarily unavailable"); });
    const unavailable = (await harness.behavior.callRpc("snapshot", null) as Snapshot).tasks[0]!;
    assert.equal(unavailable.childThreadCount, null);
    assert.equal(isTaskRunning(unavailable), false);
    assert.equal(presentRunState({ ...unavailable, runState: "working" }).live, false);
    const before = harness.realtimeSignals.length;
    await harness.behavior.emitThreadEvent("thread.active", { thread: makeThreadResponse({ id: "child-1", parentThreadId: thread.id }) });
    assert.ok(harness.realtimeSignals.length > before);
    assert.equal((await harness.behavior.callRpc("snapshot", null) as Snapshot).tasks[0]?.stageId, "stage-completed");
  } finally { await harness.lifecycle.dispose(); }
});

test("stop follows live BB status even after the agent reports its card complete", async () => {
  const { harness, thread } = await setup();
  try {
    const task = await harness.behavior.callRpc("importThread", { threadId: thread.id }) as Task;
    await harness.behavior.callRpc("moveTask", { number: task.number, stageId: "stage-completed" });
    harness.inspection.sdk.stub("threads.stop", async () => ({}));
    await harness.behavior.callRpc("stopTask", { number: task.number });
    assert.equal(harness.inspection.sdk.callsTo("threads.stop").length, 1);
    thread.status = "idle";
    await assert.rejects(harness.behavior.callRpc("stopTask", { number: task.number }), /not currently running/);
  } finally { await harness.lifecycle.dispose(); }
});

test("labels, agents and search intersect; priority sorting is deterministic", () => {
  const task = { number: 12, title: "Fix upload", projectName: "App", providerId: "codex", labels: [{ id: "api", name: "API", color: "blue" }, { id: "bug", name: "Bug", color: "red" }], priority: "low", updatedAt: 20 } as Task;
  assert.equal(matchesBoardFilters(task, { query: "vk-12", agent: "codex", labelIds: ["api", "bug"] }), true);
  assert.equal(matchesBoardFilters(task, { query: "upload", agent: "claude-code", labelIds: ["api"] }), false);
  assert.equal(matchesBoardFilters(task, { query: "", agent: "all", labelIds: ["missing"] }), false);
  const ordered = [task, { ...task, number: 13, priority: "urgent", updatedAt: 1 }, { ...task, number: 14, priority: "none", updatedAt: 100 }] as Task[];
  assert.deepEqual(ordered.sort(compareTaskPriority).map((item) => item.number), [13, 12, 14]);
});
