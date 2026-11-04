import { resolve } from "node:path";
import type { ChangesSnapshot, Comparison, FileDiff } from "../shared/contracts";
import { DiffCache } from "../shared/diff-cache";
import { readFileDiff } from "./diff";
import { readContent, revealInFileManager } from "./files";
import { RepositoryScanCache, resolveFile, scanWorkspace } from "./repositories";

export class GitChangesService {
  private async fileRepository(input: {
    directory: string;
    repositoryId: string;
    path: string;
    comparison: Comparison;
  }) {
    const snapshot = await this.snapshot(input);
    const repository = snapshot.repositories.find((repo) => repo.id === input.repositoryId);
    if (repository?.state !== "ready" || !repository.files.some((file) => file.path === input.path))
      throw new Error("文件已不在当前变更列表中，请刷新后重试。");
    resolveFile(repository.directory, input.path);
    return repository;
  }
  async content(input: {
    directory: string;
    repositoryId: string;
    path: string;
    comparison: Comparison;
  }) {
    return readContent(await this.fileRepository(input), input.path, input.comparison);
  }
  async reveal(input: {
    directory: string;
    repositoryId: string;
    path: string;
    comparison: Comparison;
  }) {
    return revealInFileManager(await this.fileRepository(input), input.path);
  }
  private readonly snapshots = new Map<
    string,
    { time: number; pending: boolean; promise: Promise<ChangesSnapshot> }
  >();
  private readonly patches = new DiffCache(8 * 1024 * 1024, 24);
  private readonly pendingPatches = new Map<string, Promise<FileDiff>>();
  private readonly scanCache = new RepositoryScanCache();

  snapshot(input: {
    directory: string;
    comparison: Comparison;
    force?: boolean;
  }): Promise<ChangesSnapshot> {
    const key = JSON.stringify([resolve(input.directory), input.comparison]);
    const existing = this.snapshots.get(key);
    if (existing && (existing.pending || (!input.force && Date.now() - existing.time < 1000)))
      return existing.promise;
    const promise = scanWorkspace(input, this.scanCache);
    const entry = { time: Date.now(), pending: true, promise };
    this.snapshots.set(key, entry);
    void promise.then(
      () => {
        entry.pending = false;
        entry.time = Date.now();
      },
      () => {
        if (this.snapshots.get(key) === entry) this.snapshots.delete(key);
      },
    );
    if (this.snapshots.size > 20) {
      const first = this.snapshots.keys().next().value;
      if (first !== undefined) this.snapshots.delete(first);
    }
    return promise;
  }

  async diff(input: {
    directory: string;
    comparison: Comparison;
    repositoryId: string;
    path: string;
    context: number;
    ignoreWhitespace: boolean;
  }): Promise<FileDiff> {
    const snapshot = await this.snapshot(input);
    const repository = snapshot.repositories.find((repo) => repo.id === input.repositoryId);
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
    const existing = this.patches.get(key);
    if (existing) return existing;
    const pending = this.pendingPatches.get(key);
    if (pending) return pending;
    const promise = readFileDiff(
      repository,
      input.path,
      input.comparison,
      input.context,
      input.ignoreWhitespace,
    );
    this.pendingPatches.set(key, promise);
    void promise.then(
      (diff) => {
        if (this.pendingPatches.get(key) !== promise) return;
        this.pendingPatches.delete(key);
        this.patches.set(key, diff);
      },
      () => {
        if (this.pendingPatches.get(key) === promise) this.pendingPatches.delete(key);
      },
    );
    return promise;
  }

  close(): void {
    this.snapshots.clear();
    this.patches.clear();
    this.pendingPatches.clear();
    this.scanCache.clear();
  }
}
