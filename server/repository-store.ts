import type { Comparison, RepositorySnapshot } from "../shared/contracts";
import { currentGitPriority, type GitReadContext, withGitPriority } from "./git";
import { type RepositoryRead, readRepository } from "./repositories";

interface Entry {
  directory: string;
  value?: RepositoryRead;
  pending: boolean;
  time: number;
  weight: number;
  context: GitReadContext;
  promise: Promise<RepositoryRead>;
  generation: number;
  controller: AbortController;
}
export const SNAPSHOT_TTL = 1000;

// Share only repository bodies. Parent gitlinks and workspace-relative IDs belong
// to the discovery that requested the body, so overlay them on every cache hit.
export class RepositoryStore {
  private readonly entries = new Map<string, Entry>();
  private closed = false;
  private bytes = 0;
  private generation = 0;
  nextGeneration() {
    return this.generation + 1;
  }
  peek(directory: string, comparison: Comparison) {
    const entry = this.entries.get(JSON.stringify([directory, comparison]));
    if (!entry?.pending && entry?.value && Date.now() - entry.time < SNAPSHOT_TTL)
      return entry.value;
    return undefined;
  }
  pending(directory: string, comparison: Comparison, minimumGeneration = 0) {
    const entry = this.entries.get(JSON.stringify([directory, comparison]));
    if (!entry?.pending || entry.generation < minimumGeneration) return undefined;
    this.promote(entry.context);
    return entry.promise;
  }
  reader(force = false, minimumGeneration = 0): typeof readRepository {
    return (directory, id, parentId, recordedHead, indexedHead, comparison, cache) => {
      if (this.closed) return Promise.reject(new Error("Repository reader is closed"));
      const key = JSON.stringify([directory, comparison]);
      const existing = this.entries.get(key);
      const overlay = (value: RepositoryRead): RepositoryRead => ({
        ...value,
        snapshot: {
          ...value.snapshot,
          id,
          relativePath: id === "." ? "" : id,
          parentId,
          recordedHead,
          indexedHead,
        },
      });
      if (existing?.pending && existing.generation < minimumGeneration) {
        // A force refresh must not borrow a read that started before it. Wait
        // for that read, then share the next generation with other force readers.
        return existing.promise.then(() =>
          this.reader(force, minimumGeneration)(
            directory,
            id,
            parentId,
            recordedHead,
            indexedHead,
            comparison,
            cache,
          ),
        );
      }
      if (
        existing &&
        (existing.pending ||
          (!force &&
            existing.generation >= minimumGeneration &&
            Date.now() - existing.time < SNAPSHOT_TTL))
      ) {
        this.promote(existing.context);
        this.entries.delete(key);
        this.entries.set(key, existing);
        return existing.promise.then(overlay);
      }
      if (existing) {
        this.bytes -= existing.weight;
        this.entries.delete(key);
      }
      const controller = new AbortController();
      const context: GitReadContext = {
        priority: currentGitPriority(),
        signal: controller.signal,
      };
      const promise = withGitPriority(context, () =>
        readRepository(directory, id, parentId, recordedHead, indexedHead, comparison, cache),
      );
      const entry: Entry = {
        directory,
        pending: true,
        time: 0,
        weight: 0,
        context,
        promise,
        generation: ++this.generation,
        controller,
      };
      this.entries.set(key, entry);
      void promise.then(
        (value) => {
          if (this.entries.get(key) !== entry) return;
          entry.pending = false;
          entry.time = Date.now();
          entry.value = value;
          entry.weight =
            512 +
            value.snapshot.files.reduce((sum, file) => sum + 640 + file.path.length * 2, 0) +
            value.modules.length * 192;
          this.bytes += entry.weight;
          this.trim();
        },
        () => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
        },
      );
      return promise.then(overlay);
    };
  }
  private trim() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.pending) continue;
      if (
        now - entry.time < SNAPSHOT_TTL &&
        this.entries.size <= 128 &&
        this.bytes <= 12 * 1024 * 1024
      )
        continue;
      this.entries.delete(key);
      this.bytes -= entry.weight;
    }
  }
  private promote(context: GitReadContext) {
    const priority = currentGitPriority();
    if (priority === "interactive" || (priority === "normal" && context.priority === "background"))
      context.priority = priority;
  }
  invalidate(directories: Set<string>) {
    for (const [key, entry] of this.entries)
      if (directories.has(entry.directory)) {
        entry.controller.abort();
        this.entries.delete(key);
        this.bytes -= entry.weight;
      }
  }
  close() {
    this.closed = true;
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
    this.bytes = 0;
  }
}

export function repositoryBody(value: RepositoryRead, descriptor: RepositorySnapshot) {
  return {
    ...value.snapshot,
    id: descriptor.id,
    relativePath: descriptor.relativePath,
    parentId: descriptor.parentId,
    recordedHead: descriptor.recordedHead,
    indexedHead: descriptor.indexedHead,
  };
}
