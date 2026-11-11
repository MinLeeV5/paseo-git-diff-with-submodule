import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { cpus, devNull, loadavg, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { mapLimit } from "../server/concurrency";
import { mergeChangesView } from "../shared/changes-view";
import {
  type ChangesSnapshot,
  changesViewRpc,
  type FileDiff,
  fileDiffSchema,
  snapshotSchema,
} from "../shared/contracts";
import { command, fixture } from "../tests/fixtures";
import { type Corpus, createPerformanceCorpora } from "./benchmark-fixtures";

const output = resolve(
  process.env.PASEO_REGRESSION_OUTPUT ?? "artifacts/performance-optimization/paired",
);
const runtime = resolve(
  process.env.PASEO_BENCH_RUNTIME ?? "artifacts/benchmark-comparison/runtime",
);
const packages = join(runtime, "node_modules");
const rounds = Number(process.env.PASEO_BENCH_ROUNDS ?? 7);
assert(Number.isInteger(rounds) && rounds > 0);
await mkdir(output, { recursive: true });
const { DaemonClient } = await import(
  pathToFileURL(join(packages, "@getpaseo/client/dist/daemon-client.js")).href
);
const { WebSocket } = await import(pathToFileURL(join(packages, "ws/wrapper.mjs")).href);
const f = await fixture();
const home = await mkdtemp(join(tmpdir(), "gitlens-regression-"));
const baselineCommit = (await command(process.cwd(), "rev-parse", "v0.6.0^{commit}")).trim();
const baseline = join(home, "baseline");
const candidate = join(home, "candidate");
await mkdir(baseline);
await mkdir(candidate);
const production = [
  "index.server.ts",
  "index.client.tsx",
  "package.json",
  "paseo-plugin.json",
  "server",
  "shared",
  "client",
  "assets",
];
const archive = spawn("git", ["archive", baselineCommit, ...production], {
  stdio: ["ignore", "pipe", "inherit"],
});
const extract = spawn("tar", ["-x", "-C", baseline], { stdio: ["pipe", "ignore", "inherit"] });
archive.stdout.pipe(extract.stdin);
assert(
  (await Promise.all([once(archive, "exit"), once(extract, "exit")])).every(([code]) => code === 0),
);
for (const path of production) await cp(resolve(path), join(candidate, path), { recursive: true });
async function fingerprint(directory: string, prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(files, await fingerprint(directory, path));
    else
      files[path] = createHash("sha256")
        .update(await readFile(join(directory, path)))
        .digest("hex");
  }
  return files;
}
const sourceFiles = await fingerprint(candidate);
const sourceHash = createHash("sha256")
  .update(JSON.stringify(Object.entries(sourceFiles).sort()))
  .digest("hex");
const ids = {
  baseline: JSON.parse(await readFile(join(baseline, "paseo-plugin.json"), "utf8")).id as string,
  candidate: JSON.parse(await readFile(join(candidate, "paseo-plugin.json"), "utf8")).id as string,
};
assert.notEqual(ids.baseline, ids.candidate, "Benchmark sources need distinct runtime IDs");
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const address = listener.address();
assert(address && typeof address !== "string");
await new Promise<void>((accept) => listener.close(() => accept()));
const port = address.port;
await writeFile(
  join(home, "config.json"),
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
      [ids.baseline]: { source: "directory", path: baseline, enabled: true },
      [ids.candidate]: { source: "directory", path: candidate, enabled: true },
    },
  }),
);
const logPath = join(output, "daemon.log");
const log = createWriteStream(logPath);
const environment = { ...process.env };
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
  delete environment[key];
const daemon = spawn(
  process.execPath,
  [join(packages, "@getpaseo/cli/bin/paseo"), "daemon", "run", "--home", home],
  {
    env: {
      ...environment,
      PASEO_RELAY_ENABLED: "false",
      PASEO_DICTATION_ENABLED: "false",
      PASEO_VOICE_MODE_ENABLED: "false",
      PASEO_LOG_LEVEL: "warn",
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: "1",
      ESBUILD_BINARY_PATH: join(
        packages,
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
let received = 0;
const client = new DaemonClient({
  url: `ws://127.0.0.1:${port}/ws`,
  clientId: `regression-${randomUUID()}`,
  clientType: "cli",
  appVersion: "0.16.0-beta.1",
  reconnect: { enabled: false },
  localCredential: async () => (await readFile(join(home, "local-credential"), "utf8")).trim(),
  webSocketFactory: (
    url: string,
    options?: { protocols?: string[]; headers?: Record<string, string> },
  ) => {
    const socket = new WebSocket(url, options?.protocols ?? [], { headers: options?.headers });
    socket.on("message", (data: string | Buffer | ArrayBuffer) => {
      received +=
        typeof data === "string"
          ? Buffer.byteLength(data)
          : Buffer.isBuffer(data)
            ? data.length
            : data.byteLength;
    });
    return socket;
  },
});
let interrupted = false;
const interrupt = () => {
  interrupted = true;
  void client.close().catch(() => {});
  daemon.kill("SIGINT");
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
type Variant = keyof typeof ids;
type Sample = {
  scenario: string;
  variant: Variant;
  round: number;
  firstListMs: number;
  completeListMs: number;
  firstFileMs: number;
  allFilesMs: number;
  cachedFileMs: number;
  expiredCachedFileMs: number;
  busyFileMs: number;
  refreshMs: number;
  firstBytes: number;
  totalBytes: number;
  refreshBytes: number;
  files: number;
  repositories: number;
  digest: string;
  loadStart: number[];
  loadEnd: number[];
};
const samples: Sample[] = [];
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const elapsed = (start: number) => performance.now() - start;
async function deadline<T>(promise: Promise<T>, milliseconds = 120000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Regression benchmark timed out")), milliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function edits(path: string, diff: FileDiff): string[] {
  assert.equal(diff.state, "text");
  return diff.hunks.flatMap((hunk) =>
    hunk.lines.flatMap((line) =>
      line.kind === "added" || line.kind === "removed"
        ? [JSON.stringify([path, line.kind, line.content])]
        : [],
    ),
  );
}
async function measure(
  corpus: Corpus,
  directory: string,
  variant: Variant,
  round: number,
): Promise<Sample> {
  const modern = variant === "candidate";
  const rpc = (name: string, input: unknown) =>
    deadline(client.invokePluginRpc(ids[variant], name, input));
  let snapshot: ChangesSnapshot | null = null;
  let known: Record<string, string> = {};
  const getSnapshot = async (force = false, progressive = modern) => {
    if (modern) {
      const view = changesViewRpc.output.parse(
        await rpc("git.changes-view", { directory, comparison: "head", force, progressive, known }),
      );
      snapshot = mergeChangesView(snapshot, view);
      known = view.repositoryVersions;
    } else
      snapshot = snapshotSchema.parse(
        await rpc("git.changes", { directory, comparison: "head", force }),
      );
    return snapshot;
  };
  const loadStart = loadavg();
  received = 0;
  const start = performance.now();
  const initial = await getSnapshot(true);
  const firstListMs = elapsed(start);
  const firstRepo = initial.repositories.find((repo) => repo.files.length);
  assert(firstRepo, "Corpus must announce a changed repository");
  const firstPath = firstRepo.files[0].path;
  const firstQualified = firstRepo.id === "." ? firstPath : `${firstRepo.id}/${firstPath}`;
  const read = (repositoryId: string, path: string) =>
    rpc(modern ? "git.file-diff-view" : "git.file-diff", {
      directory,
      repositoryId,
      path,
      comparison: "head",
      context: 3,
      ignoreWhitespace: false,
    }).then((value) => fileDiffSchema.parse(value));
  const first = await read(firstRepo.id, firstPath);
  const firstFileMs = elapsed(start);
  const firstBytes = received;
  let complete = initial;
  while (complete.pending) {
    await delay(120);
    complete = await getSnapshot();
  }
  const completeListMs = initial.pending ? elapsed(start) : firstListMs;
  // Both variants must be idle for the warm-cache probe. The progressive client
  // can paint a file while other repositories are still scanning.
  // allFilesMs/totalBytes describe the complete diagnostic sequence, including
  // these five identical cache RPCs; firstFileMs is the pure single-file metric.
  const cache: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await read(firstRepo.id, firstPath);
    cache.push(elapsed(t));
  }
  const files = complete.repositories.flatMap((repo) =>
    repo.files.map((file) => ({
      repositoryId: repo.id,
      path: file.path,
      qualified: repo.id === "." ? file.path : `${repo.id}/${file.path}`,
    })),
  );
  assert.deepEqual(files.map((file) => file.qualified).sort(), corpus.paths);
  assert.equal(complete.repositories.length, corpus.repositories.length);
  assert(complete.repositories.every((repo) => repo.state === "ready"));
  const lines = edits(firstQualified, first);
  await mapLimit(
    files.filter((file) => file.qualified !== firstQualified),
    6,
    async (file) => {
      lines.push(...edits(file.qualified, await read(file.repositoryId, file.path)));
    },
  );
  const allFilesMs = elapsed(start);
  const totalBytes = received;
  assert.equal(lines.filter((line) => JSON.parse(line)[1] === "added").length, corpus.additions);
  assert.equal(lines.filter((line) => JSON.parse(line)[1] === "removed").length, corpus.deletions);
  const digest = createHash("sha256").update(JSON.stringify(lines.sort())).digest("hex");
  // Refill the same file's patch, then expire metadata outside the measured interval.
  await read(firstRepo.id, firstPath);
  await delay(1100);
  let t = performance.now();
  const expired = await read(firstRepo.id, firstPath);
  const expiredCachedFileMs = elapsed(t);
  assert.deepEqual(edits(firstQualified, expired), edits(firstQualified, first));
  const background = rpc("git.changes", {
    directory,
    comparison: "head",
    force: true,
    background: true,
  });
  await delay(20);
  t = performance.now();
  await read(firstRepo.id, firstPath);
  const busyFileMs = elapsed(t);
  await background;
  received = 0;
  t = performance.now();
  let refreshed = await getSnapshot(true);
  while (refreshed.pending) {
    await delay(120);
    refreshed = await getSnapshot();
  }
  const refreshMs = elapsed(t);
  const refreshBytes = received;
  assert.equal(
    refreshed.repositories.reduce((n, repo) => n + repo.files.length, 0),
    corpus.paths.length,
  );
  return {
    scenario: corpus.name,
    variant,
    round,
    firstListMs,
    completeListMs,
    firstFileMs,
    allFilesMs,
    cachedFileMs: median(cache),
    expiredCachedFileMs,
    busyFileMs,
    refreshMs,
    firstBytes,
    totalBytes,
    refreshBytes,
    files: files.length,
    repositories: complete.repositories.length,
    digest,
    loadStart,
    loadEnd: loadavg(),
  };
}
try {
  for (let i = 0; i < 300; i++) {
    if (daemon.exitCode !== null) throw new Error("Benchmark daemon exited; inspect daemon.log");
    if (
      (await readFile(logPath, "utf8").catch(() => "")).includes(`Listening on 127.0.0.1:${port}`)
    )
      break;
    if (i === 299) throw new Error("Benchmark daemon not ready");
    await delay(100);
  }
  await client.connect();
  for (const variant of ["baseline", "candidate"] as const)
    await client.invokePluginRpc(ids[variant], "git.changes", {
      directory: process.cwd(),
      comparison: "head",
      force: true,
    });
  const allCorpora = await createPerformanceCorpora(f, {
    uniqueTracked: process.env.PASEO_BENCH_UNIQUE !== "0",
  });
  const selected = process.env.PASEO_BENCH_CASES?.split(",").map((name) => name.trim());
  const corpora = selected
    ? allCorpora.filter((corpus) => selected.includes(corpus.name))
    : allCorpora;
  assert(corpora.length > 0, "No benchmark scenarios selected");
  if (selected)
    assert.deepEqual(
      [...new Set(selected)].sort(),
      corpora.map((corpus) => corpus.name).sort(),
      "Unknown benchmark scenario",
    );
  for (const corpus of corpora) {
    for (let round = -1; round < rounds; round++) {
      if (interrupted) throw new Error("Benchmark interrupted");
      const directory = join(f.base, `paired-${corpus.name}-${round + 1}`);
      await cp(corpus.directory, directory, { recursive: true });
      const pair: Sample[] = [];
      const order: Variant[] =
        round % 2 === 0 ? ["candidate", "baseline"] : ["baseline", "candidate"];
      for (const variant of order) {
        await delay(300);
        const sample = await measure(corpus, directory, variant, round);
        pair.push(sample);
        console.log(JSON.stringify(sample));
      }
      assert.equal(
        pair[0].digest,
        pair[1].digest,
        "Baseline and candidate returned different edits",
      );
      if (round >= 0) samples.push(...pair);
      await writeFile(join(output, "partial.json"), JSON.stringify(samples, null, 2));
      await rm(directory, { recursive: true, force: true });
    }
  }
  const metrics = [
    "firstListMs",
    "completeListMs",
    "firstFileMs",
    "allFilesMs",
    "cachedFileMs",
    "expiredCachedFileMs",
    "busyFileMs",
    "refreshMs",
    "firstBytes",
    "totalBytes",
    "refreshBytes",
  ] as const;
  const summary = corpora.flatMap((corpus) =>
    (["baseline", "candidate"] as const).map((variant) => {
      const group = samples.filter(
        (sample) => sample.scenario === corpus.name && sample.variant === variant,
      );
      return {
        scenario: corpus.name,
        variant,
        n: group.length,
        metrics: Object.fromEntries(
          metrics.map((metric) => {
            const values = group.map((sample) => sample[metric]);
            return [
              metric,
              { median: median(values), min: Math.min(...values), max: Math.max(...values) },
            ];
          }),
        ),
      };
    }),
  );
  const gates = corpora.map((corpus) => {
    const group = samples.filter((sample) => sample.scenario === corpus.name);
    return {
      scenario: corpus.name,
      metrics: Object.fromEntries(
        metrics.map((metric) => {
          const before = median(
            group.filter((s) => s.variant === "baseline").map((s) => s[metric]),
          );
          const after = median(
            group.filter((s) => s.variant === "candidate").map((s) => s[metric]),
          );
          // Retain all numbers; a slowdown is a candidate for independent confirmation,
          // never a reason to remove a slow sample from the reported dataset.
          return [
            metric,
            {
              before,
              after,
              ratio: after / before,
              improvedOrEqual: after <= before,
              requiresConfirmation:
                after > before &&
                after - before >
                  (metric === "cachedFileMs" ? 0.5 : metric.endsWith("Bytes") ? 0 : 5),
            },
          ];
        }),
      ),
    };
  });
  const report = {
    measuredAt: new Date().toISOString(),
    baselineCommit,
    candidateSourceHash: sourceHash,
    candidateSourceFiles: sourceFiles,
    rounds,
    warmupRoundsPerCase: 1,
    transport:
      "Real local WebSocket, one isolated official 0.16.0-beta.1 daemon, alternating baseline/candidate order",
    environment: {
      node: process.version,
      cpu: cpus()[0].model,
      memory: totalmem(),
      platform: `${process.platform}/${process.arch}`,
      git: (await command(process.cwd(), "--version")).trim(),
    },
    summary,
    gates,
    samples,
  };
  await writeFile(join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${samples.length} paired samples to ${output}`);
  if (
    process.env.PASEO_BENCH_ENFORCE !== "0" &&
    gates.some((gate) => Object.values(gate.metrics).some((metric) => metric.requiresConfirmation))
  ) {
    console.error(
      "Performance gate failed: inspect flagged metrics and run independent confirmation.",
    );
    process.exitCode = 1;
  }
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  await client.close().catch(() => {});
  if (daemon.exitCode === null && daemon.signalCode === null) {
    const stopped = once(daemon, "exit");
    daemon.kill("SIGINT");
    await deadline(stopped, 10000).catch(() => {
      if (daemon.pid) {
        try {
          process.kill(-daemon.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    });
  }
  log.end();
  await f.close();
  await rm(home, { recursive: true, force: true });
}
