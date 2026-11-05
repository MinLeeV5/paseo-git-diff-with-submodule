import type { PluginServerContext } from "@getpaseo/plugin/server";
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
import { panelSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const service = new GitChangesService();
  server.registerSettings(panelSettings);
  server.handle(changesRpc, (input) => service.snapshot(input));
  server.handle(fileDiffRpc, (input) => service.diff(input));
  server.handle(fileContentRpc, (input) => service.content(input));
  server.handle(fileCapabilitiesRpc, () => fileCapabilities());
  server.handle(revealFileRpc, (input) => service.reveal(input));
  server.handle(resolveLinkRpc, (input) => service.resolveLink(input));
  server.handle(mermaidRuntimeRpc, () => mermaidRuntime);
  return () => service.close();
}
