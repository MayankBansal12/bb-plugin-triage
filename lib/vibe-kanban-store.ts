import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRpc, type PluginRpcClient } from "@get-bb/plugin-sdk/app";

import type { rpcContract } from "../server";
import type { AgentOptions, Snapshot } from "./vibe-kanban-types";

export type KanbanRpc = PluginRpcClient<typeof rpcContract>;

interface KanbanState {
  snapshot: Snapshot | null;
  error: string | null;
  loading: boolean;
}

/**
 * The board and the title-bar header are separate mount points in the host
 * shell, so they cannot share React state. They share this store instead —
 * one fetch, one realtime refresh, two subscribers.
 */
let state: KanbanState = { snapshot: null, error: null, loading: true };
let inFlight: Promise<void> | null = null;
let restaleWhileInFlight = false;

const listeners = new Set<() => void>();

function setState(next: KanbanState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): KanbanState {
  return state;
}

export async function refreshKanban(rpc: KanbanRpc): Promise<void> {
  // A realtime event during an in-flight fetch would otherwise resolve against
  // the older response; remember it and fetch once more instead.
  if (inFlight) {
    restaleWhileInFlight = true;
    return inFlight;
  }
  const run = (async () => {
    try {
      const snapshot = (await rpc.call("snapshot")) as Snapshot;
      setState({ snapshot, error: null, loading: false });
    } catch (error) {
      setState({
        snapshot: state.snapshot,
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  })();
  inFlight = run;
  await run;
  inFlight = null;
  if (restaleWhileInFlight) {
    restaleWhileInFlight = false;
    await refreshKanban(rpc);
  }
}

/**
 * Move a card in the local snapshot before the server confirms. Dragging must
 * land instantly; the refresh that follows reconciles, and a failed call
 * refreshes back to the truth.
 */
export function patchTaskStage(taskNumber: number, stageId: string): void {
  if (!state.snapshot) return;
  setState({
    ...state,
    snapshot: {
      ...state.snapshot,
      tasks: state.snapshot.tasks.map((task) =>
        task.number === taskNumber ? { ...task, stageId } : task,
      ),
    },
  });
}

export function patchTaskRead(taskNumber: number, read: boolean): void {
  if (!state.snapshot) return;
  setState({ ...state, snapshot: { ...state.snapshot, tasks: state.snapshot.tasks.map((task) =>
    task.number === taskNumber ? { ...task, readAt: read ? Date.now() : null } : task,
  ) } });
}

export interface KanbanData extends KanbanState {
  rpc: KanbanRpc;
  refresh: () => Promise<void>;
}

/** Subscribe to the shared snapshot and make sure it has been loaded once. */
export function useKanban(): KanbanData {
  const rpc = useRpc<typeof rpcContract>();
  const current = useSyncExternalStore(subscribe, getState, getState);
  const refresh = useCallback(() => refreshKanban(rpc), [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...current, rpc, refresh };
}

/**
 * The title-bar header and the board are separate mount points, so a
 * notification click cannot reach the board through props. It asks here, and
 * the board decides whether to open a thread or a detail dialog.
 */
const openTaskListeners = new Set<(taskNumber: number) => void>();

export function requestOpenTask(taskNumber: number): void {
  for (const listener of openTaskListeners) listener(taskNumber);
}

export function useOpenTaskRequests(handler: (taskNumber: number) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (taskNumber: number) => ref.current(taskNumber);
    openTaskListeners.add(listener);
    return () => {
      openTaskListeners.delete(listener);
    };
  }, []);
}

let agentOptions: AgentOptions | null = null;
let agentOptionsInFlight: Promise<AgentOptions> | null = null;

/**
 * Provider and model catalogue for the agent picker. Cached for the session —
 * it changes only when a host gains or loses a provider.
 */
export function loadAgentOptions(rpc: KanbanRpc): Promise<AgentOptions> {
  if (agentOptions) return Promise.resolve(agentOptions);
  agentOptionsInFlight ??= (async () => {
    try {
      const result = (await rpc.call("agentOptions")) as AgentOptions;
      agentOptions = result;
      return result;
    } finally {
      agentOptionsInFlight = null;
    }
  })();
  return agentOptionsInFlight;
}
