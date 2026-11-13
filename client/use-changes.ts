import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { mergeChangesView } from "../shared/changes-view";
import {
  type ChangesSnapshot,
  type Comparison,
  changesViewRpc,
  type FileDiff,
  fileDiffViewRpc,
} from "../shared/contracts";
import { DiffCache } from "../shared/diff-cache";
import { useT } from "./i18n";

export function useChanges(
  directory: string,
  comparison: Comparison,
  automatic = true,
  refreshInterval = 2000,
) {
  const call = useRpc(changesViewRpc);
  const t = useT();
  const refresh = useRef<(() => void) | null>(null);
  const policyChanged = useRef<(() => void) | null>(null);
  const automaticRef = useRef(automatic);
  automaticRef.current = automatic;
  const intervalRef = useRef(refreshInterval);
  intervalRef.current = refreshInterval;
  const key = JSON.stringify([directory, comparison]);
  const [state, setState] = useState<{
    key: string;
    data: ChangesSnapshot | null;
    error: string | null;
    loading: boolean;
    refreshing: boolean;
  }>({ key, data: null, error: null, loading: true, refreshing: true });
  useEffect(() => {
    let stopped = false;
    let fetching = false;
    let queuedRefresh = false;
    let failures = 0;
    let incomplete = false;
    let known: Record<string, string> = {};
    let currentSnapshot: ChangesSnapshot | null = null;
    let active = AppState.currentState !== "background" && AppState.currentState !== "inactive";
    let timer: ReturnType<typeof setTimeout> | undefined;
    function cancelTimer() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
    function schedule() {
      cancelTimer();
      if (!stopped && (automaticRef.current || incomplete) && active)
        timer = setTimeout(
          () => {
            void load();
          },
          incomplete && !failures ? 120 : Math.min(30000, intervalRef.current * 2 ** failures),
        );
    }
    async function load(manual = false) {
      if (stopped || (!active && !manual)) return;
      if (fetching) {
        if (manual) queuedRefresh = true;
        return;
      }
      fetching = true;
      cancelTimer();
      if (manual) setState((previous) => ({ ...previous, refreshing: true }));
      try {
        const view = await call({
          directory,
          comparison,
          force: manual,
          progressive: true,
          background: !manual,
          known,
        });
        const snapshot = mergeChangesView(currentSnapshot, view, t);
        known = view.repositoryVersions;
        currentSnapshot = snapshot;
        incomplete = Boolean(snapshot.pending);
        failures = 0;
        if (!stopped)
          setState((previous) => {
            // An unchanged poll must not rebuild thousands of rows or reset editor scrolling.
            const same = previous.key === key && previous.data?.version === snapshot.version;
            const samePending = Boolean(previous.data?.pending) === incomplete;
            if (
              same &&
              samePending &&
              !previous.error &&
              !previous.loading &&
              previous.refreshing === incomplete
            )
              return previous;
            return {
              key,
              data:
                same && previous.data
                  ? samePending
                    ? previous.data
                    : { ...previous.data, pending: snapshot.pending }
                  : snapshot,
              error: null,
              loading: false,
              refreshing: incomplete,
            };
          });
      } catch (error) {
        failures++;
        if (!stopped)
          setState((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            refreshing: false,
          }));
      } finally {
        fetching = false;
        if (queuedRefresh && !stopped) {
          queuedRefresh = false;
          void load(true);
        } else schedule();
      }
    }
    refresh.current = () => {
      void load(true);
    };
    policyChanged.current = () => {
      cancelTimer();
      if ((automaticRef.current || incomplete) && active) void load();
    };
    const subscription = AppState.addEventListener("change", (next) => {
      active = next === "active";
      cancelTimer();
      if (active && (automaticRef.current || incomplete)) void load();
    });
    // A panel opened while the host is inactive still needs its first snapshot,
    // including one-shot readers with automatic refresh disabled.
    void load(true);
    return () => {
      stopped = true;
      refresh.current = null;
      policyChanged.current = null;
      cancelTimer();
      subscription.remove();
    };
  }, [call, directory, comparison, key, t]);
  useEffect(() => {
    if (automatic !== undefined && refreshInterval) policyChanged.current?.();
  }, [automatic, refreshInterval]);
  const refreshNow = useCallback(() => refresh.current?.(), []);
  const current =
    state.key === key ? state : { data: null, error: null, loading: true, refreshing: true };
  return { ...current, refresh: refreshNow };
}

export function useFileDiff(
  input: {
    directory: string;
    repositoryId: string;
    path: string;
    version: string;
    comparison: Comparison;
    context: number;
    ignoreWhitespace: boolean;
  } | null,
) {
  const call = useRpc(fileDiffViewRpc);
  // Each retained Tab owns one current patch. Evicting its pane releases the cache.
  const [cache] = useState(() => new DiffCache(4 * 1024 * 1024, 1));
  const pending = useRef(new Map<string, Promise<FileDiff>>());
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(input);
  const directory = input?.directory;
  const repositoryId = input?.repositoryId;
  const path = input?.path;
  const comparison = input?.comparison ?? "head";
  const context = input?.context ?? 3;
  const ignoreWhitespace = input?.ignoreWhitespace ?? false;
  const identity = JSON.stringify([
    directory,
    repositoryId,
    path,
    comparison,
    context,
    ignoreWhitespace,
  ]);
  const [state, setState] = useState<{
    key: string;
    identity: string;
    data: FileDiff | null;
    error: string | null;
    refreshing: boolean;
  }>({
    key,
    identity,
    data: null,
    error: null,
    refreshing: Boolean(input),
  });
  useEffect(() => {
    if (!directory || !repositoryId || !path) return;
    let stopped = false;
    const cached = cache.get(key);
    if (cached) {
      setState({ key, identity, data: cached, error: null, refreshing: false });
      return;
    }
    setState((previous) => ({
      key,
      identity,
      data: previous.identity === identity ? previous.data : null,
      error: null,
      refreshing: true,
    }));
    const pendingKey = JSON.stringify([key, attempt]);
    let request = pending.current.get(pendingKey);
    if (!request) {
      request = call({ directory, repositoryId, path, comparison, context, ignoreWhitespace });
      pending.current.set(pendingKey, request);
      void request.then(
        (data) => {
          cache.set(key, data);
          pending.current.delete(pendingKey);
        },
        () => {
          pending.current.delete(pendingKey);
        },
      );
    }
    void request.then(
      (data) => {
        if (!stopped) setState({ key, identity, data, error: null, refreshing: false });
      },
      (error: unknown) => {
        if (!stopped)
          setState((previous) => ({
            key,
            identity,
            data: previous.identity === identity ? previous.data : null,
            error: error instanceof Error ? error.message : String(error),
            refreshing: false,
          }));
      },
    );
    return () => {
      stopped = true;
    };
  }, [
    call,
    key,
    identity,
    directory,
    repositoryId,
    path,
    comparison,
    context,
    ignoreWhitespace,
    cache,
    attempt,
  ]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    ...(input
      ? state.key === key
        ? state
        : {
            data: cache.get(key) ?? (state.identity === identity ? state.data : null),
            error: null,
            refreshing: true,
          }
      : { data: null, error: null, refreshing: false }),
    retry,
  };
}
