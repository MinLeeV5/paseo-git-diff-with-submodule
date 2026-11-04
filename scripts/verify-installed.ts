import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { settingsRpc } from "@getpaseo/plugin";
import {
  changesRpc,
  fileCapabilitiesRpc,
  fileContentRpc,
  fileDiffRpc,
  mermaidRuntimeRpc,
} from "../shared/contracts";
import { panelSettingsSchema } from "../shared/settings";

const directory = process.argv[2];
if (!directory) throw new Error("用法：npm run verify:installed -- /absolute/path/to/repository");
const daemonHome = process.env.PASEO_DIFF_DAEMON_HOME ?? join(homedir(), ".paseo");
const client = new DaemonClient({
  url: process.env.PASEO_DIFF_DAEMON_URL ?? "ws://127.0.0.1:6767/ws",
  clientId: `submodule-diff-check-${randomUUID()}`,
  clientType: "cli",
  appVersion: "0.12.0",
  localCredential: async () =>
    (await readFile(join(daemonHome, "local-credential"), "utf8")).trim(),
  connectTimeoutMs: 10000,
  reconnect: { enabled: false },
});
try {
  await client.connect();
  const stored = (await client.invokePluginRpc(
    "git-diff-with-submodule",
    settingsRpc("git-panel").read.name,
    {},
  )) as { status: string; values?: unknown };
  assert.equal(stored.status, "ready");
  const settings = panelSettingsSchema.parse(stored.values);
  const capabilities = fileCapabilitiesRpc.output.parse(
    await client.invokePluginRpc("git-diff-with-submodule", fileCapabilitiesRpc.name, {}),
  );
  const renderer = mermaidRuntimeRpc.output.parse(
    await client.invokePluginRpc("git-diff-with-submodule", mermaidRuntimeRpc.name, {}),
  );
  const rendererBytes = gunzipSync(Buffer.from(renderer.gzip, "base64"));
  assert(rendererBytes.length > 1000000);
  const snapshot = changesRpc.output.parse(
    await client.invokePluginRpc("git-diff-with-submodule", changesRpc.name, {
      directory,
      comparison: "head",
    }),
  );
  assert(snapshot.repositories.some((repository) => repository.state === "ready"));
  const repositories = [];
  for (const repository of snapshot.repositories) {
    const file = repository.files[0];
    const diff = file
      ? fileDiffRpc.output.parse(
          await client.invokePluginRpc("git-diff-with-submodule", fileDiffRpc.name, {
            directory,
            repositoryId: repository.id,
            path: file.path,
            comparison: "head",
            context: 3,
            ignoreWhitespace: false,
          }),
        )
      : null;
    const content = file
      ? fileContentRpc.output.parse(
          await client.invokePluginRpc("git-diff-with-submodule", fileContentRpc.name, {
            directory,
            repositoryId: repository.id,
            path: file.path,
            comparison: "head",
          }),
        )
      : null;
    repositories.push({
      id: repository.id,
      state: repository.state,
      files: repository.files.length,
      sampledPath: file?.path ?? null,
      sampledDiffState: diff?.state ?? null,
      sampledContentState: content?.state ?? null,
      sampledContentSource: content?.source ?? null,
    });
  }
  const report = {
    checkedAt: new Date().toISOString(),
    transportClientVersion: "0.12.0",
    project: snapshot.directory,
    settings: { status: stored.status, values: settings },
    fileManager: capabilities,
    mermaid: {
      version: renderer.version,
      compressedBase64Bytes: renderer.gzip.length,
      decodedBytes: rendererBytes.length,
    },
    repositories,
  };
  await mkdir("artifacts", { recursive: true });
  const output = resolve("artifacts/runtime.json");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`PASS: installed plugin RPC; ${output}`);
} finally {
  await client.close();
}
