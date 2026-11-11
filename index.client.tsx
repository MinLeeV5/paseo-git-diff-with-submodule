import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ChangesPanel } from "./client/changes-panel";

export default function contribute(client: PluginClientContext) {
  const headerButtons = new Map<string, ReturnType<PluginClientContext["addHeaderButton"]>>();
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
    title: "GitLens · 包含 Submodule",
    icon: "GitCompare",
    keywords: ["GitLens", "Git", "submodule"],
    context: "workspace",
    onSelect({ openPanel, workspace }) {
      if (!headerButtons.has(workspace.id)) {
        const registration = client.addHeaderButton({
          id: "open-gitlens",
          workspaceId: workspace.id,
          button: {
            title: "打开 GitLens",
            label: "打开",
            icon: "GitCompare",
            behavior: { kind: "action", onPress: () => openPanel("changes") },
          },
        });
        headerButtons.set(workspace.id, registration);
      }
      openPanel("changes");
    },
  });
  return () => {
    for (const button of headerButtons.values()) button.remove();
    headerButtons.clear();
    removeCommand();
    removePanel();
  };
}
