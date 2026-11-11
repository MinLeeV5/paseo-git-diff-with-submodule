import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ChangesSnapshot,
  Comparison,
  FileDiff,
  RepositorySnapshot,
} from "../shared/contracts";
import { DiffCache } from "../shared/diff-cache";
import type {
  CommitDetails,
  CommitDiffInput,
  CommitInput,
  HistoryInput,
} from "../shared/history-contracts";
import { parsePreviewLink } from "../shared/preview-links";
import type { RepositoryAction } from "../shared/repository-contracts";
import type { PanelSettings } from "../shared/settings";
import { type CommitMessagePaseo, generatePaseoCommitMessage } from "./commit-message";
import { FileDiffBatcher } from "./diff";
import { readContent, revealInFileManager } from "./files";
import { type GitReadContext, withGitPriority } from "./git";
import { readCommit, readCommitDiff, readHistory } from "./history";
import { digest, RepositoryScanCache, resolveFile, scanWorkspace } from "./repositories";
import { generateCommitMessage, runRepositoryAction } from "./repository-actions";
import { RepositoryStore, repositoryBody, SNAPSHOT_TTL } from "./repository-store";

interface SnapshotInput {
  directory: string;
  comparison: Comparison;
  force?: boolean;
  progressive?: boolean;
  background?: boolean;
}
interface SnapshotEntry {
  time: number;
  pending: boolean;
  promise: Promise<ChangesSnapshot>;
  first: Promise<void>;
  current?: ChangesSnapshot;
  readGeneration: number;
  context: GitReadContext;
  seen: ReadonlyMap<string, RepositorySnapshot>;
}

export class GitChangesService {
  private readonly operations = new Set<string>();
  private readonly generationController = new AbortController();
  private epoch = 0;

  async repositoryAction(input: RepositoryAction) {
    const repository = await this.repository({
      directory: input.directory,
      comparison: "head",
      force: true,
      repositoryId: input.repositoryId,
    });
    if (repository?.state !== "ready") throw new Error("所属仓库不可用，请刷新后重试。");
    if (this.operations.has(repository.directory))
      throw new Error("此仓库正在执行 Git 操作，请等待完成。");
    this.operations.add(repository.directory);
    try {
      return await runRepositoryAction(repository, input);
    } finally {
      this.operations.delete(repository.directory);
      this.invalidate(repository);
    }
  }

  async generateCommitMessage(
    input: {
      directory: string;
      workspaceId?: string;
      repositoryId: string;
      scope: "staged" | "all";
    },
    generation?: {
      paseo: CommitMessagePaseo;
      settings: Pick<PanelSettings, "commitMessageGenerator" | "commitMessageInstructions">;
    },
  ) {
    const snapshot = await this.snapshot({
      directory: input.directory,
      comparison: input.scope === "staged" ? "staged" : "head",
      force: true,
    });
    const repository = snapshot.repositories.find((repo) => repo.id === input.repositoryId);
    if (repository?.state !== "ready") throw new Error("所属仓库不可用，请刷新后重试。");
    if (this.operations.has(repository.directory))
      throw new Error("此仓库正在执行 Git 操作，请等待完成。");
    if (!generation || generation.settings.commitMessageGenerator === "local")
      return generateCommitMessage(repository, input.scope);
    this.operations.add(repository.directory);
    try {
      return await generatePaseoCommitMessage(
        generation.paseo,
        snapshot.directory,
        repository,
        input.scope,
        generation.settings.commitMessageInstructions,
        input.workspaceId,
        this.generationController.signal,
      );
    } finally {
      this.operations.delete(repository.directory);
    }
  }
  private readonly commits = new Map<string, Promise<CommitDetails>>();

  private async historyRepository(input: { directory: string; repositoryId: string }) {
    const repository = await this.repository({ ...input, comparison: "head" });
    if (repository?.state !== "ready") throw new Error("所属仓库不可用，请刷新后重试。");
    return repository;
  }

  async history(input: HistoryInput) {
    const repository = await this.historyRepository(input);
    return readHistory(repository.directory, input);
  }

  private cachedCommit(directory: string, oid: string) {
    const key = JSON.stringify([directory, oid]);
    const existing = this.commits.get(key);
    if (existing) return existing;
    const promise = readCommit(directory, oid);
    this.commits.set(key, promise);
    void promise.then(
      (commit) => {
        if (commit.diffMessage && this.commits.get(key) === promise) this.commits.delete(key);
      },
      () => {},
    );
    void promise.catch(() => {
      if (this.commits.get(key) === promise) this.commits.delete(key);
    });
    while (this.commits.size > 32) {
      const first = this.commits.keys().next().value;
      if (first !== undefined) this.commits.delete(first);
    }
    return promise;
  }

  async commit(input: CommitInput) {
    const repository = await this.historyRepository(input);
    return this.cachedCommit(repository.directory, input.oid);
  }

  async commitDiff(input: CommitDiffInput): Promise<FileDiff> {
    const repository = await this.historyRepository(input);
    const key = JSON.stringify([
      "commit",
      repository.directory,
      input.oid,
      input.path,
      input.context,
      input.ignoreWhitespace,
    ]);
    return this.cachedPatch(key, () =>
      this.cachedCommit(repository.directory, input.oid).then((commit) =>
        readCommitDiff(
          repository.directory,
          commit,
          input.path,
          input.context,
          input.ignoreWhitespace,
        ),
      ),
    );
  }

  private async fileRepository(input: {
    directory: string;
    repositoryId: string;
    path: string;
    comparison: Comparison;
    scope?: "changes" | "workspace";
  }) {
    const repository = await this.repository(input);
    if (
      repository?.state !== "ready" ||
      (input.scope !== "workspace" && !repository.files.some((file) => file.path === input.path))
    )
      throw new Error("文件已不在当前变更列表中，请刷新后重试。");
    const absolute =
      input.scope === "workspace" && input.path === "."
        ? repository.directory
        : resolveFile(repository.directory, input.path);
    if (input.scope === "workspace") {
      if (input.path.split(/[\\/]/).includes(".git")) throw new Error("不能打开 Git 内部文件。");
      const canonical = await realpath(absolute);
      const delta = relative(repository.directory, canonical);
      if (
        delta === ".." ||
        delta.startsWith(`..${sep}`) ||
        isAbsolute(delta) ||
        delta.split(/[\\/]/).includes(".git")
      )
        throw new Error("文件必须位于所属仓库内。");
    }
    return repository;
  }
  async content(input: {
    directory: string;
    repositoryId: string;
    path: string;
    comparison: Comparison;
    scope?: "changes" | "workspace";
  }) {
    return readContent(await this.fileRepository(input), input.path, input.comparison);
  }
  async reveal(input: {
    directory: string;
    repositoryId: string;
    path: string;
    comparison: Comparison;
    scope?: "changes" | "workspace";
  }) {
    return revealInFileManager(await this.fileRepository(input), input.path);
  }
  async resolveLink(input: {
    directory: string;
    repositoryId: string;
    path: string;
    href: string;
  }) {
    const link = parsePreviewLink(input.href);
    if (link?.kind !== "file") throw new Error("不是有效的工作区文件链接。");
    const snapshot = await this.snapshot({ directory: input.directory, comparison: "head" });
    const from = snapshot.repositories.find((repo) => repo.id === input.repositoryId);
    if (from?.state !== "ready") throw new Error("所属仓库不可用。");
    const source = resolveFile(from.directory, input.path);
    let linkedPath = link.path;
    if (process.platform === "win32" && link.absolute && /^\/[a-z]:\//i.test(linkedPath))
      linkedPath = linkedPath.slice(1);
    let target = link.absolute
      ? resolve(linkedPath)
      : linkedPath.startsWith("/")
        ? resolve(snapshot.directory, `.${linkedPath}`)
        : resolve(dirname(source), linkedPath);
    // The configured workspace can use an alias such as macOS /var -> /private/var.
    // Translate its lexical prefix before applying canonical workspace boundaries.
    if (link.absolute) {
      const configuredPath = relative(resolve(input.directory), target);
      if (
        configuredPath !== ".." &&
        !configuredPath.startsWith(`..${sep}`) &&
        !isAbsolute(configuredPath)
      )
        target = resolve(snapshot.directory, configuredPath);
    }
    const workspacePath = relative(snapshot.directory, target);
    if (
      workspacePath === ".." ||
      workspacePath.startsWith(`..${sep}`) ||
      isAbsolute(workspacePath) ||
      workspacePath.split(/[\\/]/).includes(".git")
    )
      throw new Error("文件链接必须位于当前工作区内。");
    let canonical: string;
    try {
      canonical = await realpath(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error("链接指向的文件或目录不存在。");
      throw error;
    }
    const canonicalPath = relative(snapshot.directory, canonical);
    if (
      canonicalPath === ".." ||
      canonicalPath.startsWith(`..${sep}`) ||
      isAbsolute(canonicalPath) ||
      canonicalPath.split(/[\\/]/).includes(".git")
    )
      throw new Error("文件链接必须位于当前工作区内。");
    const repository = snapshot.repositories
      .filter((repo) => {
        const delta = relative(repo.directory, canonical);
        return (
          repo.state === "ready" &&
          delta !== ".." &&
          !delta.startsWith(`..${sep}`) &&
          !isAbsolute(delta)
        );
      })
      .sort((a, b) => b.directory.length - a.directory.length)[0];
    if (!repository) throw new Error("链接所属仓库不可用。");
    const stat = await lstat(canonical);
    if (!stat.isFile() && !stat.isDirectory()) throw new Error("链接目标不是普通文件或目录。");
    return {
      repositoryId: repository.id,
      path: relative(repository.directory, canonical).split(sep).join("/") || ".",
      kind: stat.isDirectory() ? ("directory" as const) : ("file" as const),
      version: `${stat.mtimeMs}:${stat.size}`,
      fragment: link.fragment,
    };
  }
  private readonly snapshots = new Map<string, SnapshotEntry>();
  private scanSerial = 0;
  private readonly catalogs = new Map<string, Map<string, RepositorySnapshot>>();
  private readonly repositories = new RepositoryStore();
  private readonly patches = new DiffCache(8 * 1024 * 1024, 24);
  private readonly pendingPatches = new Map<string, Promise<FileDiff>>();
  private readonly patchControllers = new Map<string, AbortController>();
  private readonly scanCache = new RepositoryScanCache();
  private readonly diffBatcher = new FileDiffBatcher();

  snapshot(input: SnapshotInput): Promise<ChangesSnapshot> {
    const key = JSON.stringify([resolve(input.directory), input.comparison]);
    const existing = this.snapshots.get(key);
    const select = (entry: SnapshotEntry) =>
      input.progressive && entry.pending
        ? entry.first.then(() => entry.current ?? entry.promise)
        : entry.promise;
    if (
      existing &&
      (existing.pending || (!input.force && Date.now() - existing.time < SNAPSHOT_TTL))
    )
      return select(existing);
    let firstReady!: () => void;
    let firstFailed!: (error: unknown) => void;
    const first = new Promise<void>((accept, reject) => {
      firstReady = accept;
      firstFailed = reject;
    });
    void first.catch(() => {});
    const announced = new Map<string, RepositorySnapshot>();
    const ordering = new Map<string, string>();
    const scanId = ++this.scanSerial;
    const readGeneration = input.force ? this.repositories.nextGeneration() : 0;
    const context: GitReadContext = { priority: input.background ? "background" : "normal" };
    const promise = withGitPriority(context, () =>
      scanWorkspace(input, this.scanCache, {
        read: this.repositories.reader(false, readGeneration),
        onRepository: (repository, directory, hasChildren, order) => {
          if (this.snapshots.get(key) !== entry) return;
          if (repository.id === ".") context.priority = input.background ? "background" : "normal";
          this.remember(key, repository);
          announced.set(repository.id, repository);
          ordering.set(repository.id, order);
          if (repository.id === "." && !hasChildren) return;
          const repositories = [...announced.values()].sort((a, b) =>
            (ordering.get(a.id) as string) < (ordering.get(b.id) as string) ? -1 : 1,
          );
          // Refresh keeps the already painted complete tree until the new scan settles.
          const previous = existing?.current;
          entry.current =
            previous && !previous.pending
              ? { ...previous, pending: true }
              : {
                  directory,
                  comparison: input.comparison,
                  repositories,
                  pending: true,
                  version: `scan:${scanId}:${announced.size}`,
                  scannedAt: new Date().toISOString(),
                };
          firstReady();
        },
      }),
    );
    const entry: SnapshotEntry = {
      time: Date.now(),
      pending: true,
      promise,
      first,
      readGeneration,
      context,
      seen: announced,
    };
    this.snapshots.set(key, entry);
    void promise.then(
      (snapshot) => {
        entry.pending = false;
        entry.time = Date.now();
        entry.current = snapshot;
        if (this.snapshots.get(key) === entry)
          this.catalogs.set(key, new Map(snapshot.repositories.map((repo) => [repo.id, repo])));
        firstReady();
      },
      (error) => {
        firstFailed(error);
        if (this.snapshots.get(key) === entry) this.snapshots.delete(key);
      },
    );
    if (this.snapshots.size > 20) {
      const first = this.snapshots.keys().next().value;
      if (first !== undefined) {
        this.snapshots.delete(first);
        this.catalogs.delete(first);
      }
    }
    return select(entry);
  }

  private readonly repositoryVersions = new WeakMap<RepositorySnapshot, string>();
  async snapshotView(input: SnapshotInput & { known?: Record<string, string> }) {
    const snapshot = await this.snapshot(input);
    const versions: Record<string, string> = Object.create(null);
    for (const repository of snapshot.repositories) {
      let version = this.repositoryVersions.get(repository);
      if (!version) {
        version = digest(repository);
        this.repositoryVersions.set(repository, version);
      }
      versions[repository.id] = version;
    }
    return {
      ...snapshot,
      repositoryIds: snapshot.repositories.map((repo) => repo.id),
      repositoryVersions: versions,
      repositories: snapshot.repositories.filter(
        (repo) => input.known?.[repo.id] !== versions[repo.id],
      ),
    };
  }

  private remember(key: string, repository: RepositorySnapshot) {
    let catalog = this.catalogs.get(key);
    if (!catalog) {
      catalog = new Map();
      this.catalogs.set(key, catalog);
    }
    catalog.set(repository.id, repository);
    while (this.catalogs.size > 20) {
      const first = this.catalogs.keys().next().value as string;
      this.catalogs.delete(first);
      this.snapshots.delete(first);
    }
  }

  private repository(input: {
    directory: string;
    comparison: Comparison;
    repositoryId: string;
    force?: boolean;
  }): Promise<RepositorySnapshot | undefined> {
    return withGitPriority({ priority: "interactive" }, async () => {
      const epoch = this.epoch;
      const key = JSON.stringify([resolve(input.directory), input.comparison]);
      const known = this.catalogs.get(key)?.get(input.repositoryId);
      const activeScan = this.snapshots.get(key);
      const needsFresh = Boolean(
        activeScan?.pending &&
          activeScan.readGeneration &&
          !activeScan.seen.has(input.repositoryId),
      );
      if (needsFresh && input.repositoryId === "." && activeScan) {
        // A full scan always reads the root first. Reuse that result without
        // rediscovering it or waiting for any of its children.
        activeScan.context.priority = "interactive";
        if (known?.state === "ready")
          this.repositories.pending(known.directory, input.comparison, activeScan.readGeneration);
        await activeScan.first;
        if (this.epoch !== epoch) return this.repository(input);
        return activeScan.seen.get(".");
      }
      if (known?.state === "ready" && !input.force) {
        const pending = this.repositories.pending(
          known.directory,
          input.comparison,
          needsFresh ? activeScan?.readGeneration : 0,
        );
        if (pending) return repositoryBody(await pending, known);
        if (!needsFresh) {
          const cached = this.repositories.peek(known.directory, input.comparison);
          if (cached) return repositoryBody(cached, known);
          const snapshot = this.snapshots.get(key);
          if (snapshot && !snapshot.pending && Date.now() - snapshot.time < SNAPSHOT_TTL)
            return known;
        }
      }
      const snapshot = await scanWorkspace(input, this.scanCache, {
        repositoryId: input.repositoryId,
        read: this.repositories.reader(
          false,
          input.force
            ? this.repositories.nextGeneration()
            : needsFresh
              ? activeScan?.readGeneration
              : 0,
        ),
        onRepository: (repository) => {
          if (this.epoch === epoch) this.remember(key, repository);
        },
      });
      const old = this.snapshots.get(key);
      if (old && !old.pending && Date.now() - old.time >= SNAPSHOT_TTL) this.snapshots.delete(key);
      return snapshot.repositories.find((repo) => repo.id === input.repositoryId);
    });
  }

  private invalidate(repository: RepositorySnapshot) {
    this.epoch++;
    const directories = new Set([repository.directory]);
    for (const [key, catalog] of this.catalogs) {
      let current = [...catalog.values()].find((repo) => repo.directory === repository.directory);
      if (!current) continue;
      this.snapshots.delete(key);
      while (current) {
        directories.add(current.directory);
        current = current.parentId === null ? undefined : catalog.get(current.parentId);
      }
    }
    this.repositories.invalidate(directories);
    this.diffBatcher.invalidate(directories);
    const affected = (key: string) => {
      const parts = JSON.parse(key) as unknown[];
      return parts[0] !== "commit" && directories.has(parts[0] as string);
    };
    this.patches.deleteWhere(affected);
    for (const key of this.pendingPatches.keys())
      if (affected(key)) {
        this.patchControllers.get(key)?.abort();
        this.patchControllers.delete(key);
        this.pendingPatches.delete(key);
      }
  }

  async diff(input: {
    directory: string;
    comparison: Comparison;
    repositoryId: string;
    path: string;
    context: number;
    ignoreWhitespace: boolean;
  }): Promise<FileDiff> {
    const repository = await this.repository(input);
    if (repository?.state !== "ready") throw new Error("所属仓库不可用，请刷新后重试。");
    const file = repository.files.find((change) => change.path === input.path);
    if (!file) throw new Error("文件已不在当前变更列表中，请刷新后重试。");
    const key = JSON.stringify([
      repository.directory,
      input.comparison,
      file,
      input.context,
      input.ignoreWhitespace,
    ]);
    return this.cachedPatch(key, (execution) =>
      this.diffBatcher.read(
        repository,
        input.path,
        input.comparison,
        input.context,
        input.ignoreWhitespace,
        this.repositories.peek(repository.directory, input.comparison)?.baseEntries?.get(input.path)
          ?.oid,
        execution,
      ),
    );
  }

  private cachedPatch(
    key: string,
    read: (execution: GitReadContext) => Promise<FileDiff>,
  ): Promise<FileDiff> {
    const existing = this.patches.get(key);
    if (existing) return Promise.resolve(existing);
    const pending = this.pendingPatches.get(key);
    if (pending) return pending;
    const controller = new AbortController();
    const execution: GitReadContext = { priority: "interactive", signal: controller.signal };
    const promise = withGitPriority(execution, () => read(execution));
    this.pendingPatches.set(key, promise);
    this.patchControllers.set(key, controller);
    void promise.then(
      (diff) => {
        if (this.pendingPatches.get(key) !== promise) return;
        this.pendingPatches.delete(key);
        this.patchControllers.delete(key);
        this.patches.set(key, diff);
      },
      () => {
        if (this.pendingPatches.get(key) === promise) {
          this.pendingPatches.delete(key);
          this.patchControllers.delete(key);
        }
      },
    );
    return promise;
  }

  close(): void {
    this.epoch++;
    this.generationController.abort();
    this.commits.clear();
    this.snapshots.clear();
    this.patches.clear();
    for (const controller of this.patchControllers.values()) controller.abort();
    this.patchControllers.clear();
    this.pendingPatches.clear();
    this.scanCache.clear();
    this.repositories.close();
    this.diffBatcher.close();
    this.catalogs.clear();
  }
}
