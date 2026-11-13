import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  ChangesSnapshot,
  Comparison,
  FileChange,
  RepositorySnapshot,
} from "../shared/contracts";
import { type Translate, tZh } from "../shared/i18n";
import { mapLimit, TaskPool } from "./concurrency";
import { DIFF_OPTIONS, errorMessage, git } from "./git";
import {
  type IndexEntry,
  parseIndex,
  parseNameStatus,
  parseNumstat,
  parseStatus,
  parseTree,
} from "./parsers";

export const MAX_FILE_BYTES = 1024 * 1024;
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}
export function resolveFile(directory: string, path: string, t: Translate = tZh): string {
  const absolute = resolve(directory, path);
  const delta = relative(directory, absolute);
  if (
    isAbsolute(path) ||
    !delta ||
    delta === ".." ||
    delta.startsWith(`..${sep}`) ||
    isAbsolute(delta)
  ) {
    throw new Error(t("文件路径必须位于所属仓库内。"));
  }
  return absolute;
}
export function comparisonArgs(comparison: Comparison, hasHead: boolean): string[] {
  if (comparison === "staged" || (!hasHead && comparison === "head")) return ["--cached"];
  return comparison === "head" ? ["HEAD"] : [];
}
export async function fileFingerprint(path: string): Promise<string> {
  try {
    const stat = await lstat(path, { bigint: true });
    return `${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}:${stat.mode}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "deleted";
    throw error;
  }
}
export async function addedFileStats(
  path: string,
): Promise<{ additions: number | null; deletions: number | null; binary: boolean }> {
  const stat = await lstat(path);
  if (stat.isDirectory() || stat.size > MAX_FILE_BYTES)
    return { additions: null, deletions: null, binary: false };
  const bytes = stat.isSymbolicLink() ? Buffer.from(await readlink(path)) : await readFile(path);
  const binary = bytes.includes(0);
  if (binary) return { additions: null, deletions: null, binary: true };
  const text = bytes.toString("utf8");
  return {
    additions: text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0,
    deletions: 0,
    binary: false,
  };
}

export class RepositoryScanCache {
  private readonly files = new Map<
    string,
    { fingerprint: string; stats: Awaited<ReturnType<typeof addedFileStats>> }
  >();
  async stats(path: string, fingerprint: string) {
    const cached = this.files.get(path);
    if (cached?.fingerprint === fingerprint) return cached.stats;
    const stats = await addedFileStats(path);
    this.files.delete(path);
    this.files.set(path, { fingerprint, stats });
    while (this.files.size > 10000) {
      const first = this.files.keys().next().value;
      if (first === undefined) break;
      this.files.delete(first);
    }
    return stats;
  }
  clear() {
    this.files.clear();
  }
}

async function modulePaths(directory: string): Promise<string[]> {
  try {
    await lstat(join(directory, ".gitmodules"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const output = await git(
    directory,
    ["config", "-z", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"],
    { acceptDifference: true },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(entry.indexOf("\n") + 1));
}

export interface RepositoryRead {
  snapshot: RepositorySnapshot;
  baseEntries?: Map<string, IndexEntry>;
  modules: { path: string; recordedHead: string | null; indexedHead: string | null }[];
}
export async function readRepository(
  directory: string,
  id: string,
  parentId: string | null,
  recordedHead: string | null,
  indexedHead: string | null,
  comparison: Comparison,
  cache: RepositoryScanCache,
): Promise<RepositoryRead> {
  const headRead = git(directory, ["rev-parse", "--verify", "--quiet", "HEAD"], {
    acceptDifference: true,
  }).then((value) => value.trim() || null);
  const [head, indexOutput, treeOutput, statusOutput, configuredModules] = await Promise.all([
    headRead,
    git(directory, ["ls-files", "--stage", "-z"]),
    headRead.then((head) => (head ? git(directory, ["ls-tree", "-r", "-z", head]) : "")),
    git(directory, [
      "status",
      "--porcelain=v2",
      "--branch",
      "--ahead-behind",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ]),
    modulePaths(directory),
  ]);
  const index = parseIndex(indexOutput);
  const tree = parseTree(treeOutput);
  const moduleNames = new Set(configuredModules);
  for (const [path, entry] of [...index, ...tree])
    if (entry.mode === "160000") moduleNames.add(path);
  const refs = comparisonArgs(comparison, Boolean(head));
  const [names, statsOutput] = await Promise.all([
    git(directory, ["diff", ...DIFF_OPTIONS, "--name-status", "-z", ...refs, "--"]),
    git(directory, ["diff", ...DIFF_OPTIONS, "--numstat", "-z", ...refs, "--"]),
  ]);
  const status = parseStatus(statusOutput);
  const headers: string[] = [];
  for (const record of statusOutput.split("\0")) {
    if (!record.startsWith("# ")) break;
    headers.push(record);
  }
  const stats = parseNumstat(statsOutput);
  const changed = new Map(parseNameStatus(names).map((file) => [file.path, file]));
  if (comparison !== "staged") {
    for (const path of status.untracked) {
      if (!changed.has(path)) changed.set(path, { path, status: "untracked" });
    }
    // Without HEAD, the cached diff cannot include edits to an already staged new file.
    if (!head && comparison === "head") {
      for (const [path] of index) changed.set(path, { path, status: "added" });
    }
  }
  const entries = await mapLimit(
    [...changed.values()],
    12,
    async (change): Promise<FileChange | null> => {
      if (moduleNames.has(change.path) || (change.oldPath && moduleNames.has(change.oldPath)))
        return null;
      const absolute = resolveFile(directory, change.path);
      const fingerprint = await fileFingerprint(absolute);
      const statusEntry = status.entries.get(change.path);
      let stat = stats.get(change.path) ?? { additions: 0, deletions: 0, binary: false };
      const useWholeFile = change.status === "untracked" || (!head && comparison === "head");
      if (useWholeFile) {
        try {
          stat = await cache.stats(absolute, fingerprint);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      }
      return {
        ...change,
        status: statusEntry?.conflict ? "conflicted" : change.status,
        ...stat,
        staged: statusEntry?.staged ?? false,
        unstaged: statusEntry?.unstaged ?? change.status === "untracked",
        version: digest([head, index.get(change.path), fingerprint, change, stat]),
      };
    },
  );
  const files = entries.filter((file): file is FileChange => file !== null);
  files.sort((left, right) => left.path.localeCompare(right.path));
  // Batching only needs baseline objects for changed files. Retaining the entire
  // HEAD tree would make a clean, very large repository an expensive cache entry.
  const baseEntries = new Map<string, IndexEntry>();
  for (const file of files) {
    const entry = tree.get(file.path);
    if (entry) baseEntries.set(file.path, entry);
  }
  // Missing upstream refs (including deleted remote branches) have no branch.ab
  // record. Keep their counts unknown rather than showing a misleading zero.
  const divergence = /^# branch\.ab \+(\d+) -(\d+)$/.exec(
    headers.find((record) => record.startsWith("# branch.ab ")) ?? "",
  );
  return {
    snapshot: {
      id,
      directory,
      relativePath: id === "." ? "" : id,
      parentId,
      head,
      branch:
        headers
          .find((record) => record.startsWith("# branch.head "))
          ?.slice(14)
          .replace(/^\(detached\)$/, "") || null,
      recordedHead,
      indexedHead,
      upstream: headers.find((line) => line.startsWith("# branch.upstream "))?.slice(18) || null,
      aheadCount: divergence ? Number(divergence[1]) : null,
      behindCount: divergence ? Number(divergence[2]) : null,
      stagedCount: [...status.entries.values()].filter((entry) => entry.staged).length,
      unstagedCount:
        [...status.entries.values()].filter((entry) => entry.unstaged).length +
        status.untracked.length,
      conflictCount: [...status.entries.values()].filter((entry) => entry.conflict).length,
      state: "ready",
      error: null,
      files,
    },
    baseEntries,
    modules: [...moduleNames].sort().map((path) => ({
      path,
      recordedHead: gitlink(tree, path),
      indexedHead: gitlink(index, path),
    })),
  };
}
function gitlink(entries: Map<string, IndexEntry>, path: string): string | null {
  const entry = entries.get(path);
  return entry?.mode === "160000" ? entry.oid : null;
}

export async function scanWorkspace(
  input: {
    directory: string;
    comparison: Comparison;
  },
  cache = new RepositoryScanCache(),
  options: {
    repositoryId?: string;
    read?: typeof readRepository;
    onRepository?(
      repository: RepositorySnapshot,
      directory: string,
      hasChildren: boolean,
      order: string,
    ): void;
    t?: Translate;
  } = {},
): Promise<ChangesSnapshot> {
  const t = options.t ?? tZh;
  const requested = await realpath(resolve(input.directory));
  const directory = await realpath((await git(requested, ["rev-parse", "--show-toplevel"])).trim());
  const visited = new Set<string>();
  const reads = new TaskPool(3);
  async function visit(
    current: string,
    id: string,
    parentId: string | null,
    recordedHead: string | null,
    indexedHead: string | null,
    order = "",
  ): Promise<RepositorySnapshot[]> {
    const fallback: RepositorySnapshot = {
      upstream: null,
      aheadCount: null,
      behindCount: null,
      stagedCount: 0,
      unstagedCount: 0,
      conflictCount: 0,
      id,
      directory: current,
      relativePath: id === "." ? "" : id,
      parentId,
      head: null,
      branch: null,
      recordedHead,
      indexedHead,
      state: "uninitialized",
      error: null,
      files: [],
    };
    try {
      const result = await reads.run(async (): Promise<RepositoryRead | null> => {
        if (parentId !== null) {
          // rev-parse in an empty submodule directory otherwise resolves to the parent repository.
          try {
            await lstat(join(current, ".git"));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              return null;
            }
            throw error;
          }
        }
        const canonical = await realpath(current);
        const top =
          parentId === null
            ? directory
            : await realpath((await git(canonical, ["rev-parse", "--show-toplevel"])).trim());
        if (top !== canonical) {
          return null;
        }
        if (visited.has(canonical)) throw new Error(t("检测到重复的子模块仓库路径。"));
        visited.add(canonical);
        return (options.read ?? readRepository)(
          canonical,
          id,
          parentId,
          recordedHead,
          indexedHead,
          input.comparison,
          cache,
        );
      });
      if (!result) {
        options.onRepository?.(fallback, directory, false, order);
        return [fallback];
      }
      options.onRepository?.(result.snapshot, directory, result.modules.length > 0, order);
      const children = await Promise.all(
        result.modules.map(async (module, index) => {
          const child = resolveFile(result.snapshot.directory, module.path);
          const childId =
            id === "."
              ? module.path.split(sep).join("/")
              : `${id}/${module.path.split(sep).join("/")}`;
          if (
            options.repositoryId !== undefined &&
            options.repositoryId !== childId &&
            !options.repositoryId.startsWith(`${childId}/`)
          )
            return [];
          return visit(
            child,
            childId,
            id,
            module.recordedHead,
            module.indexedHead,
            `${order}${String(index).padStart(8, "0")}.`,
          );
        }),
      );
      return [result.snapshot, ...children.flat()];
    } catch (error) {
      const failed = { ...fallback, state: "error" as const, error: errorMessage(error) };
      options.onRepository?.(failed, directory, false, order);
      return [failed];
    }
  }
  const repositories = await visit(directory, ".", null, null, null);
  return {
    directory,
    comparison: input.comparison,
    repositories,
    version: digest(repositories),
    scannedAt: new Date().toISOString(),
  };
}
