import type { PluginClientContext, PluginHeaderButtonContribution } from "@getpaseo/plugin/client";
import { expect, it, vi } from "vitest";
import contribute from "../index.client";

vi.mock("../client/changes-panel", () => ({ ChangesPanel: () => null }));

type Page = Awaited<ReturnType<PluginClientContext["paseo"]["workspaces"]["list"]>>;
type Subscription = NonNullable<Page["subscription"]>;
type Observer = Parameters<Subscription["subscribe"]>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function workspace(id: string, archivingAt: string | null = null) {
  return { id, archivingAt } as Page["entries"][number];
}

function page(ids: string[], nextCursor: string | null = null): Page {
  return {
    requestId: "workspaces",
    entries: ids.map((id) => workspace(id)),
    pageInfo: { hasMore: nextCursor !== null, nextCursor },
  } as Page;
}

function host(first = page(["workspace-a", "workspace-b"])) {
  let observer: Observer;
  let command: Parameters<PluginClientContext["addCommandCenterItem"]>[0];
  const headers: {
    contribution: PluginHeaderButtonContribution;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  const unsubscribe = vi.fn();
  const release = vi.fn().mockResolvedValue(undefined);
  const removePanel = vi.fn();
  const removeCommand = vi.fn();
  const openPanel = vi.fn();
  const subscription = {
    release,
    subscribe(listener: Observer) {
      observer = listener;
      listener.snapshot({ ...first, subscriptionId: "workspaces" });
      return unsubscribe;
    },
  } as unknown as Subscription;
  const list = vi.fn<(options?: object) => Promise<Page>>().mockResolvedValue({
    ...first,
    subscription,
  });
  const client = {
    paseo: { workspaces: { list } },
    openPanel,
    addWorkspacePanel: () => removePanel,
    addCommandCenterItem(value: typeof command) {
      command = value;
      return removeCommand;
    },
    addHeaderButton(contribution: PluginHeaderButtonContribution) {
      const remove = vi.fn();
      headers.push({ contribution, remove });
      return { remove, update: vi.fn() };
    },
  } as unknown as PluginClientContext;
  return {
    client,
    headers,
    list,
    subscription,
    release,
    unsubscribe,
    openPanel,
    removePanel,
    removeCommand,
    snapshot(value: Page) {
      observer.snapshot({ ...value, subscriptionId: "workspaces" });
    },
    upsert(id: string, archivingAt: string | null = null) {
      observer.update({
        type: "workspace_update",
        payload: { kind: "upsert", workspace: workspace(id, archivingAt) },
      });
    },
    remove(id: string) {
      observer.update({ type: "workspace_update", payload: { kind: "remove", id } });
    },
    selectCommand() {
      if (command.context !== "workspace") throw new Error("Expected a workspace command");
      const open = vi.fn();
      command.onSelect({
        workspace: { id: "workspace-a" },
        openPanel: open,
      } as unknown as Parameters<typeof command.onSelect>[0]);
      return open;
    },
  };
}

it("shows icon-only shortcuts on load without selecting the command and opens each workspace", async () => {
  const app = host();
  const cleanup = contribute(app.client);
  await Promise.resolve();

  expect(app.list).toHaveBeenCalledWith({ subscribe: {}, page: { limit: 100 } });
  expect(app.headers.map(({ contribution }) => contribution.workspaceId)).toEqual([
    "workspace-a",
    "workspace-b",
  ]);
  for (const { contribution } of app.headers) {
    expect(contribution.button).toMatchObject({ title: "Open GitLens", icon: "GitCompare" });
    expect(contribution.button.label).toBeUndefined();
    if (contribution.button.behavior.kind !== "action") throw new Error("Expected an action");
    contribution.button.behavior.onPress();
    expect(app.openPanel).toHaveBeenLastCalledWith("changes", {
      workspaceId: contribution.workspaceId,
    });
  }
  expect(app.selectCommand()).toHaveBeenCalledWith("changes");
  expect(app.headers).toHaveLength(2);
  cleanup();
});

it("includes older pages and new empty workspaces without duplicate buttons", async () => {
  const app = host(page(["workspace-a"], "older"));
  app.list.mockResolvedValueOnce({
    ...page(["workspace-a"], "older"),
    subscription: app.subscription,
  });
  app.list.mockResolvedValueOnce(page(["workspace-b"]));
  const cleanup = contribute(app.client);
  await Promise.resolve();
  await Promise.resolve();

  expect(app.list).toHaveBeenLastCalledWith({ page: { cursor: "older", limit: 100 } });
  app.upsert("workspace-c");
  app.upsert("workspace-c");
  expect(app.headers.map(({ contribution }) => contribution.workspaceId)).toEqual([
    "workspace-a",
    "workspace-b",
    "workspace-c",
  ]);
  cleanup();
});

it("removes archived workspaces even when an older page finishes afterwards", async () => {
  const app = host(page(["workspace-a"], "older"));
  const older = deferred<Page>();
  app.list.mockResolvedValueOnce({
    ...page(["workspace-a"], "older"),
    subscription: app.subscription,
  });
  app.list.mockReturnValueOnce(older.promise);
  const cleanup = contribute(app.client);
  await Promise.resolve();

  app.remove("workspace-b");
  app.upsert("workspace-a", "2026-11-11T14:00:00Z");
  older.resolve(page(["workspace-a", "workspace-b", "workspace-c"]));
  await Promise.resolve();
  expect(app.headers.map(({ contribution }) => contribution.workspaceId)).toEqual([
    "workspace-a",
    "workspace-c",
  ]);
  expect(app.headers[0].remove).toHaveBeenCalledOnce();
  cleanup();
});

it("uses reconnect snapshots and ignores pages from an older connection", async () => {
  const app = host(page(["workspace-a"], "older"));
  const older = deferred<Page>();
  app.list.mockResolvedValueOnce({
    ...page(["workspace-a"], "older"),
    subscription: app.subscription,
  });
  app.list.mockReturnValueOnce(older.promise);
  const cleanup = contribute(app.client);
  await Promise.resolve();

  app.snapshot(page(["workspace-a", "workspace-c"]));
  older.resolve(page(["stale-workspace"]));
  await Promise.resolve();
  expect(app.headers.map(({ contribution }) => contribution.workspaceId)).toEqual([
    "workspace-a",
    "workspace-c",
  ]);
  cleanup();
});

it("releases observations on unload and never registers late workspace results", async () => {
  const app = host(page(["workspace-a"], "older"));
  const older = deferred<Page>();
  app.list.mockResolvedValueOnce({
    ...page(["workspace-a"], "older"),
    subscription: app.subscription,
  });
  app.list.mockReturnValueOnce(older.promise);
  const cleanup = contribute(app.client);
  await Promise.resolve();
  cleanup();
  older.resolve(page(["workspace-b"]));
  app.upsert("workspace-c");
  await Promise.resolve();

  expect(app.headers).toHaveLength(1);
  expect(app.headers[0].remove).toHaveBeenCalledOnce();
  for (const remove of [app.unsubscribe, app.release, app.removeCommand, app.removePanel]) {
    expect(remove).toHaveBeenCalledOnce();
  }
});

it("releases a subscription that becomes ready after the plugin unloads", async () => {
  const app = host();
  const initial = deferred<Page>();
  app.list.mockReturnValueOnce(initial.promise);
  contribute(app.client)();
  initial.resolve({ ...page(["workspace-a"]), subscription: app.subscription });
  await Promise.resolve();

  expect(app.release).toHaveBeenCalledOnce();
  expect(app.headers).toHaveLength(0);
});
