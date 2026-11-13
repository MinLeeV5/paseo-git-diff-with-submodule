import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ChangesPanel } from "./client/changes-panel";

export default function contribute(client: PluginClientContext) {
  type WorkspacePage = Awaited<ReturnType<typeof client.paseo.workspaces.list>>;
  let disposed = false;
  let generation = 0;
  let subscription: WorkspacePage["subscription"];
  let unsubscribe: (() => void) | undefined;
  const headerButtons = new Map<string, ReturnType<PluginClientContext["addHeaderButton"]>>();
  const removedWorkspaces = new Set<string>();
  const addHeader = (workspaceId: string) => {
    if (disposed || headerButtons.has(workspaceId)) return;
    headerButtons.set(
      workspaceId,
      client.addHeaderButton({
        id: "open-gitlens",
        workspaceId,
        button: {
          title: "Open GitLens",
          icon: "GitCompare",
          behavior: {
            kind: "action",
            onPress: () => client.openPanel("changes", { workspaceId }),
          },
        },
      }),
    );
  };
  const removeHeader = (workspaceId: string) => {
    removedWorkspaces.add(workspaceId);
    headerButtons.get(workspaceId)?.remove();
    headerButtons.delete(workspaceId);
  };
  const syncWorkspace = (workspace: WorkspacePage["entries"][number]) => {
    if (workspace.archivingAt) removeHeader(workspace.id);
    else addHeader(workspace.id);
  };
  const reportError = (error: unknown) => {
    if (!disposed) console.error("GitLens workspace header observation failed", error);
  };
  const loadHeaders = async (page: WorkspacePage, run: number) => {
    while (!disposed && run === generation) {
      for (const workspace of page.entries) {
        if (!removedWorkspaces.has(workspace.id)) syncWorkspace(workspace);
      }
      if (!page.pageInfo.hasMore || !page.pageInfo.nextCursor) return;
      page = await client.paseo.workspaces.list({
        page: { cursor: page.pageInfo.nextCursor, limit: 100 },
      });
    }
  };
  const removePanel = client.addWorkspacePanel({
    id: "changes",
    title: "GitLens",
    icon: "GitCompare",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: ChangesPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-changes",
    title: "GitLens · With submodules",
    icon: "GitCompare",
    keywords: ["GitLens", "Git", "submodule"],
    context: "workspace",
    onSelect({ openPanel, workspace }) {
      addHeader(workspace.id);
      openPanel("changes");
    },
  });
  void client.paseo.workspaces
    .list({ subscribe: {}, page: { limit: 100 } })
    .then((result) => {
      if (disposed) {
        void result.subscription.release().catch(reportError);
        return;
      }
      subscription = result.subscription;
      unsubscribe = subscription.subscribe({
        snapshot: (first) => {
          removedWorkspaces.clear();
          void loadHeaders(first, ++generation).catch(reportError);
        },
        update: (message) => {
          if (disposed || message.type !== "workspace_update") return;
          const update = message.payload;
          if (update.kind === "upsert") {
            removedWorkspaces.delete(update.workspace.id);
            syncWorkspace(update.workspace);
          } else if (update.kind === "remove") {
            removeHeader(update.id);
          }
        },
        error: reportError,
      });
    })
    .catch(reportError);
  return () => {
    disposed = true;
    unsubscribe?.();
    void subscription?.release().catch(reportError);
    for (const button of headerButtons.values()) button.remove();
    headerButtons.clear();
    removedWorkspaces.clear();
    removeCommand();
    removePanel();
  };
}
