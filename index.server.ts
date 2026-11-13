import type { PluginServerContext } from "@getpaseo/plugin/server";
import { CommitMessageJobs } from "./server/commit-message-jobs";
import { fileCapabilities } from "./server/files";
import { mermaidRuntime } from "./server/generated/mermaid";
import { GitChangesService } from "./server/service";
import {
  changesRpc,
  changesViewRpc,
  compactFileDiff,
  fileCapabilitiesRpc,
  fileContentRpc,
  fileDiffRpc,
  fileDiffViewRpc,
  mermaidRuntimeRpc,
  resolveLinkRpc,
  revealFileRpc,
} from "./shared/contracts";
import {
  commitFileDiffRpc,
  commitFileDiffViewRpc,
  commitRpc,
  historyRpc,
} from "./shared/history-contracts";
import { makeT, type Translate } from "./shared/i18n";
import { generateCommitMessageRpc, repositoryActionRpc } from "./shared/repository-contracts";
import { panelSettings, panelSettingsSchema } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const service = new GitChangesService();
  const generations = new CommitMessageJobs();
  const settings = server.registerSettings(panelSettings);
  // Read once per RPC so error messages follow the language setting without
  // caching a stale translator across requests.
  const currentT = async (): Promise<Translate> => {
    const stored = await settings.read();
    return stored.status === "ready"
      ? makeT(panelSettingsSchema.parse(stored.values).language)
      : makeT("en");
  };
  server.handle(changesRpc, (input) => service.snapshot(input));
  server.handle(changesViewRpc, (input) => service.snapshotView(input));
  server.handle(repositoryActionRpc, async (input) =>
    service.repositoryAction(input, await currentT()),
  );
  server.handle(generateCommitMessageRpc, async (input, { paseo }) => {
    const stored = await settings.read();
    const t =
      stored.status === "ready"
        ? makeT(panelSettingsSchema.parse(stored.values).language)
        : makeT("en");
    if (stored.status !== "ready") throw new Error(t("请先在插件设置中修复或恢复默认设置。"));
    return generations.request(
      input,
      () =>
        service.generateCommitMessage(
          input,
          {
            paseo,
            settings: panelSettingsSchema.parse(stored.values),
          },
          t,
        ),
      t,
    );
  });
  server.handle(historyRpc, async (input) => service.history(input, await currentT()));
  server.handle(commitRpc, async (input) => service.commit(input, await currentT()));
  server.handle(commitFileDiffRpc, async (input) => service.commitDiff(input, await currentT()));
  server.handle(commitFileDiffViewRpc, async (input) =>
    compactFileDiff(await service.commitDiff(input, await currentT())),
  );
  server.handle(fileDiffRpc, async (input) => service.diff(input, await currentT()));
  server.handle(fileDiffViewRpc, async (input) =>
    compactFileDiff(await service.diff(input, await currentT())),
  );
  server.handle(fileContentRpc, async (input) => service.content(input, await currentT()));
  server.handle(fileCapabilitiesRpc, async () => fileCapabilities(await currentT()));
  server.handle(revealFileRpc, async (input) => service.reveal(input, await currentT()));
  server.handle(resolveLinkRpc, async (input) => service.resolveLink(input, await currentT()));
  server.handle(mermaidRuntimeRpc, () => mermaidRuntime);
  return () => {
    generations.clear();
    service.close();
  };
}
