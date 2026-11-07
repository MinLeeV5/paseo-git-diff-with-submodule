import type { PluginServerContext } from "@getpaseo/plugin/server";
import { CommitMessageJobs } from "./server/commit-message-jobs";
import { fileCapabilities } from "./server/files";
import { mermaidRuntime } from "./server/generated/mermaid";
import { GitChangesService } from "./server/service";
import {
  changesRpc,
  fileCapabilitiesRpc,
  fileContentRpc,
  fileDiffRpc,
  mermaidRuntimeRpc,
  resolveLinkRpc,
  revealFileRpc,
} from "./shared/contracts";
import { commitFileDiffRpc, commitRpc, historyRpc } from "./shared/history-contracts";
import { generateCommitMessageRpc, repositoryActionRpc } from "./shared/repository-contracts";
import { panelSettings, panelSettingsSchema } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const service = new GitChangesService();
  const generations = new CommitMessageJobs();
  const settings = server.registerSettings(panelSettings);
  server.handle(changesRpc, (input) => service.snapshot(input));
  server.handle(repositoryActionRpc, (input) => service.repositoryAction(input));
  server.handle(generateCommitMessageRpc, async (input, { paseo }) => {
    const stored = await settings.read();
    if (stored.status !== "ready") throw new Error("请先在插件设置中修复或恢复默认设置。");
    return generations.request(input, () =>
      service.generateCommitMessage(input, {
        paseo,
        settings: panelSettingsSchema.parse(stored.values),
      }),
    );
  });
  server.handle(historyRpc, (input) => service.history(input));
  server.handle(commitRpc, (input) => service.commit(input));
  server.handle(commitFileDiffRpc, (input) => service.commitDiff(input));
  server.handle(fileDiffRpc, (input) => service.diff(input));
  server.handle(fileContentRpc, (input) => service.content(input));
  server.handle(fileCapabilitiesRpc, () => fileCapabilities());
  server.handle(revealFileRpc, (input) => service.reveal(input));
  server.handle(resolveLinkRpc, (input) => service.resolveLink(input));
  server.handle(mermaidRuntimeRpc, () => mermaidRuntime);
  return () => {
    generations.clear();
    service.close();
  };
}
