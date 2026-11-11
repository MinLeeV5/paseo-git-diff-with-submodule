import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { cpus, devNull, loadavg, platform, release, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { buildDiffRows } from "../client/diff-model";
import { diffSyntaxStates, tokenizeLine } from "../client/syntax";
import { mapLimit } from "../server/concurrency";
import {
  type ChangesSnapshot,
  type FileDiff,
  fileDiffSchema,
  snapshotSchema,
} from "../shared/contracts";
import { command, fixture } from "../tests/fixtures";
import { createPerformanceCorpora } from "./benchmark-fixtures";

// Install the pinned official packages in an isolated prefix; see the report for the command.
// This script launches and stops its own daemon. It never connects to the user's normal daemon.
const output = resolve(process.env.PASEO_BENCH_OUTPUT ?? "artifacts/benchmark-comparison");
const runtime = resolve(process.env.PASEO_BENCH_RUNTIME ?? join(output, "runtime"));
const rounds = Number(process.env.PASEO_BENCH_ROUNDS ?? 7);
assert(Number.isInteger(rounds) && rounds > 0);
const version = "0.16.0-beta.1";
const packageRoot = join(runtime, "node_modules");
const moduleAt = (path: string) => import(pathToFileURL(join(packageRoot, path)).href);
const { DaemonClient } = await moduleAt("@getpaseo/client/dist/daemon-client.js");
const { WebSocket } = await moduleAt("ws/wrapper.mjs");
assert.equal(
  JSON.parse(await readFile(join(packageRoot, "@getpaseo/server/package.json"), "utf8")).version,
  version,
);
await mkdir(output, { recursive: true });

type NativeFile = {
  path: string;
  additions: number;
  deletions: number;
  status?: string;
  hunks: { lines: { type: string; content: string }[] }[];
};
type NativeState = {
  phase: "loading" | "ready" | "error";
  entries?: { path: string }[];
  files?: NativeFile[];
  error?: { message: string };
  diffTooLarge?: boolean;
};
type Mode = "gitlens" | "paseo-highlight" | "paseo-plain";
type Traffic = { bytes: number; binaryBytes: number; messages: number; binaryMessages: number };
type Corpus = {
  name: string;
  label: string;
  directory: string;
  repositories: string[];
  paths: string[];
  nativePaths: string[];
  additions: number;
  deletions: number;
  nativeAdditions: number;
  nativeDeletions: number;
  allFiles: boolean;
};
type Sample = {
  scenario: string;
  round: number;
  mode: Mode;
  listMs: number;
  firstFileMs: number;
  allFilesMs: number | null;
  cacheMs: number;
  expiredSnapshotFileMs: number | null;
  visibleHighlightMs: number | null;
  listBytes: number;
  firstFileBytes: number;
  allFilesBytes: number | null;
  binaryFrames: number;
  files: number;
  repositories: number | null;
  contentDigest: string;
  load: number[];
};
const modes: Mode[] = ["gitlens", "paseo-highlight", "paseo-plain"];
const samples: Sample[] = [];
const traffic = (): Traffic => ({ bytes: 0, binaryBytes: 0, messages: 0, binaryMessages: 0 });
let meter = traffic();
function byteLength(data: unknown): number {
  if (typeof data === "string") return Buffer.byteLength(data);
  if (Buffer.isBuffer(data)) return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (Array.isArray(data)) return data.reduce((sum, part) => sum + byteLength(part), 0);
  throw new Error("Unexpected WebSocket payload");
}
function digest(edits: [string, string, string][]) {
  edits.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(edits)).digest("hex");
}
const elapsed = (start: number) => performance.now() - start;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function nativeEdits(files: NativeFile[]): [string, string, string][] {
  return files.flatMap((file) =>
    file.hunks.flatMap((hunk) =>
      hunk.lines.flatMap((line) =>
        line.type === "add" || line.type === "remove"
          ? [[file.path, line.type, line.content] as [string, string, string]]
          : [],
      ),
    ),
  );
}
function pluginEdits(path: string, diff: FileDiff): [string, string, string][] {
  assert.equal(diff.state, "text");
  return diff.hunks.flatMap((hunk) =>
    hunk.lines.flatMap((line) =>
      line.kind === "added" || line.kind === "removed"
        ? [
            [path, line.kind === "added" ? "add" : "remove", line.content] as [
              string,
              string,
              string,
            ],
          ]
        : [],
    ),
  );
}
async function deadline<T>(promise: Promise<T>, milliseconds = 120000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Benchmark operation timed out")), milliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const f = await fixture();
const daemonHome = await mkdtemp(join(tmpdir(), "gitlens-benchmark-daemon-"));
const gitlensRef = process.env.PASEO_BENCH_GITLENS_REF ?? "v0.6.0";
const gitlensCommit = (await command(process.cwd(), "rev-parse", `${gitlensRef}^{commit}`)).trim();
const pluginDirectory = join(daemonHome, "gitlens");
await mkdir(pluginDirectory);
const archive = spawn(
  "git",
  [
    "archive",
    gitlensCommit,
    "index.server.ts",
    "index.client.tsx",
    "paseo-plugin.json",
    "package.json",
    "server",
    "shared",
    "client",
    "assets",
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
const extract = spawn("tar", ["-x", "-C", pluginDirectory], {
  stdio: ["pipe", "ignore", "inherit"],
});
archive.stdout.pipe(extract.stdin);
const archived = await Promise.all([once(archive, "exit"), once(extract, "exit")]);
assert(archived.every(([code]) => code === 0));
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const address = listener.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((accept) => listener.close(() => accept()));
await writeFile(
  join(daemonHome, "config.json"),
  JSON.stringify({
    version: 1,
    daemon: {
      listen: `127.0.0.1:${port}`,
      relay: { enabled: false },
      mcp: { enabled: false, injectIntoAgents: false },
      usage: { enabled: false },
      browserTools: { enabled: false },
    },
    features: { dictation: { enabled: false }, voiceMode: { enabled: false } },
    pluginsEnabled: true,
    plugins: {
      "git-diff-with-submodule": { source: "directory", path: pluginDirectory, enabled: true },
    },
  }),
);
const log = createWriteStream(join(output, "benchmark-daemon.log"));
const daemonEnvironment = { ...process.env };
// Keep inherited tuning from silently changing either implementation's defaults.
for (const key of [
  "PASEO_GIT_MAX_PROCESSES_PER_SECOND",
  "PASEO_GIT_MAX_PROCESS_CONCURRENCY",
  "PASEO_GIT_CONCURRENCY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_COMMON_DIR",
])
  delete daemonEnvironment[key];
const daemon = spawn(
  process.execPath,
  [join(packageRoot, "@getpaseo/cli/bin/paseo"), "daemon", "run", "--home", daemonHome],
  {
    env: {
      ...daemonEnvironment,
      PASEO_RELAY_ENABLED: "false",
      PASEO_DICTATION_ENABLED: "false",
      PASEO_VOICE_MODE_ENABLED: "false",
      PASEO_LOG_LEVEL: "warn",
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: "1",
      ESBUILD_BINARY_PATH: join(
        packageRoot,
        "@esbuild",
        `${process.platform}-${process.arch}`,
        "bin/esbuild",
      ),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  },
);
daemon.stdout.pipe(log);
daemon.stderr.pipe(log);
const client = new DaemonClient({
  url: `ws://127.0.0.1:${port}/ws`,
  clientId: `gitlens-benchmark-${randomUUID()}`,
  clientType: "cli",
  appVersion: version,
  localCredential: async () =>
    (await readFile(join(daemonHome, "local-credential"), "utf8")).trim(),
  reconnect: { enabled: false },
  webSocketFactory: (
    url: string,
    options?: { protocols?: string[]; headers?: Record<string, string> },
  ) => {
    const socket = new WebSocket(url, options?.protocols ?? [], { headers: options?.headers });
    socket.on("message", (data: unknown, binary: boolean) => {
      const bytes = byteLength(data);
      meter.bytes += bytes;
      meter.messages++;
      if (binary) {
        meter.binaryBytes += bytes;
        meter.binaryMessages++;
      }
    });
    return socket;
  },
});

async function connect() {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (daemon.exitCode !== null)
      throw new Error("Isolated daemon exited; inspect benchmark-daemon.log");
    const status = await readFile(join(output, "benchmark-daemon.log"), "utf8").catch(() => "");
    if (status.includes(`Listening on 127.0.0.1:${port}`)) break;
    if (attempt === 199) throw new Error("Isolated daemon did not become ready");
    await delay(100);
  }
  await client.connect();
  // Verify the plugin's real host compilation before any samples are collected.
  for (let attempt = 0; ; attempt++) {
    try {
      await client.invokePluginRpc("git-diff-with-submodule", "git.changes", {
        directory: process.cwd(),
        comparison: "head",
        force: true,
      });
      break;
    } catch (error) {
      if (attempt >= 100) throw error;
      await delay(100);
    }
  }
}
async function plugin(corpus: Corpus, directory: string, round: number): Promise<Sample> {
  meter = traffic();
  const started = performance.now();
  const snapshot: ChangesSnapshot = snapshotSchema.parse(
    await client.invokePluginRpc("git-diff-with-submodule", "git.changes", {
      directory,
      comparison: "head",
      force: true,
    }),
  );
  const listMs = elapsed(started);
  const listBytes = meter.bytes;
  assert.equal(snapshot.repositories.length, corpus.repositories.length);
  assert(snapshot.repositories.every((repo) => repo.state === "ready"));
  const files = snapshot.repositories
    .flatMap((repo) =>
      repo.files.map((file) => ({
        repositoryId: repo.id,
        path: file.path,
        qualified: repo.id === "." ? file.path : `${repo.id}/${file.path}`,
      })),
    )
    .sort((a, b) => a.qualified.localeCompare(b.qualified));
  assert.deepEqual(files.map((file) => file.qualified).sort(), corpus.paths);
  const read = async (file: (typeof files)[number]) =>
    fileDiffSchema.parse(
      await client.invokePluginRpc("git-diff-with-submodule", "git.file-diff", {
        directory,
        repositoryId: file.repositoryId,
        path: file.path,
        comparison: "head",
        context: 3,
        ignoreWhitespace: false,
      }),
    );
  const first = await read(files[0]);
  const firstFileMs = elapsed(started);
  const firstFileBytes = meter.bytes;
  let last = files[0];
  const edits = pluginEdits(files[0].qualified, first);
  if (corpus.allFiles) {
    await mapLimit(files.slice(1), 6, async (file) => {
      const diff = await read(file);
      last = file;
      edits.push(...pluginEdits(file.qualified, diff));
    });
  }
  const allFilesMs = corpus.allFiles ? elapsed(started) : null;
  const allFilesBytes = corpus.allFiles ? meter.bytes : null;
  const cacheTimes: number[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const time = performance.now();
    await read(last);
    cacheTimes.push(elapsed(time));
  }
  const highlightStart = performance.now();
  const states = diffSyntaxStates(first.hunks, "typescript");
  buildDiffRows(first.hunks, true);
  for (const line of first.hunks.flatMap((hunk) => hunk.lines).slice(0, 40))
    tokenizeLine(line.content, "typescript", states.get(line));
  const visibleHighlightMs = elapsed(highlightStart);
  // Outside the measured interval: expire the 1 s snapshot, then reopen an already cached patch.
  await delay(1100);
  const staleStart = performance.now();
  await read(last);
  const expiredSnapshotFileMs = elapsed(staleStart);
  if (corpus.allFiles) {
    assert.equal(edits.filter((edit) => edit[1] === "add").length, corpus.additions);
    assert.equal(edits.filter((edit) => edit[1] === "remove").length, corpus.deletions);
  }
  return {
    scenario: corpus.name,
    round,
    mode: "gitlens",
    listMs,
    firstFileMs,
    allFilesMs,
    cacheMs: median(cacheTimes),
    expiredSnapshotFileMs,
    visibleHighlightMs,
    listBytes,
    firstFileBytes,
    allFilesBytes,
    binaryFrames: 0,
    files: files.length,
    repositories: snapshot.repositories.length,
    contentDigest: digest(edits),
    load: loadavg(),
  };
}
async function native(
  corpus: Corpus,
  directory: string,
  round: number,
  mode: Mode,
): Promise<Sample> {
  meter = traffic();
  const started = performance.now();
  let listMs = 0;
  let listBytes = 0;
  const compare = {
    cwd: directory,
    base: { kind: "rev", rev: "HEAD" },
    head: { kind: "worktree" },
    highlight: mode === "paseo-highlight",
  };
  const subscription = client.observeDiff(compare);
  try {
    const state: NativeState = await deadline(
      new Promise<NativeState>((accept, reject) => {
        subscription.subscribe({
          snapshot: (value: NativeState) => {
            if (value.phase === "loading" && !listMs) {
              listMs = elapsed(started);
              listBytes = meter.bytes;
            }
            if (value.phase === "error") reject(new Error(value.error?.message));
            if (value.phase === "ready") accept(value);
          },
          error: reject,
        });
      }),
    );
    const readyMs = elapsed(started);
    const bytes = meter.bytes;
    const binaryFrames = meter.binaryMessages;
    assert(!state.diffTooLarge);
    const files = state.files;
    assert(files);
    assert(files.every((file) => !file.status || file.status === "ok"));
    assert.deepEqual(files.map((file) => file.path).sort(), [...corpus.nativePaths].sort());
    assert.equal(
      files.reduce((sum, file) => sum + file.additions, 0),
      corpus.nativeAdditions,
    );
    assert.equal(
      files.reduce((sum, file) => sum + file.deletions, 0),
      corpus.nativeDeletions,
    );
    const edits = nativeEdits(files);
    assert.equal(edits.filter((edit) => edit[1] === "add").length, corpus.nativeAdditions);
    assert.equal(edits.filter((edit) => edit[1] === "remove").length, corpus.nativeDeletions);
    // A second subscriber shares the retained comparison, including unchanged highlighted bodies.
    const cacheTimes: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const time = performance.now();
      const cached: NativeState = await deadline(client.readDiff(compare));
      assert.equal(cached.phase, "ready");
      cacheTimes.push(elapsed(time));
    }
    return {
      scenario: corpus.name,
      round,
      mode,
      listMs,
      firstFileMs: readyMs,
      allFilesMs: readyMs,
      cacheMs: median(cacheTimes),
      expiredSnapshotFileMs: null,
      visibleHighlightMs: null,
      listBytes,
      firstFileBytes: bytes,
      allFilesBytes: bytes,
      binaryFrames,
      files: files.length,
      repositories: null,
      contentDigest: digest(edits),
      load: loadavg(),
    };
  } finally {
    await subscription.release();
  }
}
function summary() {
  const metrics = [
    "listMs",
    "firstFileMs",
    "allFilesMs",
    "cacheMs",
    "expiredSnapshotFileMs",
    "visibleHighlightMs",
    "listBytes",
    "firstFileBytes",
    "allFilesBytes",
    "binaryFrames",
  ] as const;
  return [...new Set(samples.map((sample) => sample.scenario))].flatMap((scenario) =>
    modes.map((mode) => {
      const group = samples.filter(
        (sample) => sample.scenario === scenario && sample.mode === mode,
      );
      return {
        scenario,
        mode,
        n: group.length,
        files: group[0].files,
        metrics: Object.fromEntries(
          metrics.map((metric) => {
            const values = group
              .map((sample) => sample[metric])
              .filter((value): value is number => value !== null);
            return [
              metric,
              values.length
                ? { median: median(values), min: Math.min(...values), max: Math.max(...values) }
                : null,
            ];
          }),
        ),
      };
    }),
  );
}
try {
  await connect();
  const corpora = await createPerformanceCorpora(f);
  const selected = process.env.PASEO_BENCH_CASES?.split(",");
  const cases = selected ? corpora.filter((corpus) => selected.includes(corpus.name)) : corpora;
  for (const corpus of cases) {
    for (let round = -1; round < rounds; round++) {
      // One excluded warm-up, then fresh directory keys for each recorded round.
      const directory = join(f.base, `${corpus.name}-round-${round + 1}`);
      await cp(corpus.directory, directory, { recursive: true });
      const order = [
        ...modes.slice((round + 1) % modes.length),
        ...modes.slice(0, (round + 1) % modes.length),
      ];
      const results: Sample[] = [];
      for (const mode of order) {
        // Let the daemon's 64-starts/s window drain between independent cases.
        // This wait is outside every timer and traffic counter.
        await delay(1100);
        const sample =
          mode === "gitlens"
            ? await plugin(corpus, directory, round)
            : await native(corpus, directory, round, mode);
        results.push(sample);
        console.log(
          JSON.stringify({
            scenario: corpus.name,
            round,
            mode,
            listMs: sample.listMs.toFixed(1),
            firstFileMs: sample.firstFileMs.toFixed(1),
            allFilesMs: sample.allFilesMs?.toFixed(1),
            files: sample.files,
          }),
        );
      }
      if (corpus.allFiles)
        assert.equal(
          new Set(results.map((sample) => sample.contentDigest)).size,
          1,
          "Compared implementations returned different edits",
        );
      if (round >= 0) samples.push(...results);
      await rm(directory, { recursive: true, force: true });
      await writeFile(join(output, "samples.partial.json"), JSON.stringify(samples, null, 2));
    }
  }
  const report = {
    measuredAt: new Date().toISOString(),
    gitlens: JSON.parse(await readFile(join(pluginDirectory, "package.json"), "utf8")).version,
    gitlensCommit,
    paseo: version,
    environment: {
      node: process.version,
      git: (await command(process.cwd(), "--version")).trim(),
      platform: `${platform()} ${release()} ${process.arch}`,
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      load: loadavg(),
    },
    method: {
      rounds,
      excludedWarmupsPerScenario: 1,
      transport:
        "Real loopback WebSocket; one isolated official daemon for both paths; SDK 0.16.0-beta.1",
      cold: "Fresh repository directory and application comparison keys, warm OS filesystem cache; startup and corpus construction excluded",
      order:
        "Rotate all three modes each round; never benchmark modes concurrently; idle 1100 ms before each mode to drain the preceding Git start-rate window",
      nativeHighlight:
        "paseo-highlight uses default server syntax highlighting; paseo-plain disables it as a control",
      pluginAll:
        "Diagnostic eager load: first file then remaining files with six concurrent RPCs; normal plugin UI only loads selected files",
      cache:
        "GitLens repeats one cached file RPC; Paseo repeats the whole cached comparison while original subscription remains active; different scopes",
      expiry:
        "GitLens waits 1100 ms outside timing, then reads an already cached file; includes mandatory snapshot revalidation",
      traffic:
        "Server-to-client WebSocket payload bytes while operation is active; excludes TCP/WebSocket framing, requests, and handshake",
      ui: "No browser rendering or FPS measured; plugin visibleHighlightMs separately runs current syntax state, split-row model and first 40 patch lines",
      submodules:
        "Coverage diagnostic; native root comparison has 20 files, GitLens recursively returns 200; timings are not equivalent work",
    },
    corpora: cases.map(({ directory: _directory, ...corpus }) => corpus),
    summary: summary(),
    samples,
  };
  await writeFile(join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${samples.length} samples to ${join(output, "results.json")}`);
} finally {
  await client.close().catch(() => {});
  const stopped = once(daemon, "exit");
  daemon.kill("SIGINT");
  await deadline(stopped, 10000).catch(() => {
    if (daemon.pid) process.kill(-daemon.pid, "SIGKILL");
  });
  log.end();
  await f.close();
  await rm(daemonHome, { recursive: true, force: true });
}
