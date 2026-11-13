import { lstat } from "node:fs/promises";
import type { Comparison, FileDiff, RepositorySnapshot } from "../shared/contracts";
import { type Translate, tZh } from "../shared/i18n";
import { DIFF_OPTIONS, GitError, type GitReadContext, git, withGitPriority } from "./git";
import { parseHunks } from "./parsers";
import { comparisonArgs, MAX_FILE_BYTES, resolveFile } from "./repositories";

function materialize(
  repository: RepositorySnapshot,
  path: string,
  patch: string,
  ignoreWhitespace: boolean,
  t: Translate = tZh,
): FileDiff {
  const change = repository.files.find((file) => file.path === path);
  const result: FileDiff = {
    path,
    ...(change?.oldPath ? { oldPath: change.oldPath } : {}),
    state: "empty",
    patch,
    hunks: [],
    message: null,
  };
  if (
    change?.binary ||
    /^Binary files .* differ$/m.test(patch) ||
    /^GIT binary patch$/m.test(patch)
  )
    return { ...result, state: "binary", message: t("二进制文件已变化，无法显示文本行差异。") };
  const hunks = parseHunks(patch);
  return {
    ...result,
    hunks,
    state: hunks.length ? "text" : "empty",
    message: hunks.length
      ? null
      : patch
        ? t("仅文件名、类型或权限等元数据发生变化。")
        : ignoreWhitespace
          ? t("忽略空白后没有文本差异。")
          : t("当前没有文本差异。"),
  };
}

export async function readFileDiff(
  repository: RepositorySnapshot,
  path: string,
  comparison: Comparison,
  context = 3,
  ignoreWhitespace = false,
  t: Translate = tZh,
): Promise<FileDiff> {
  const change = repository.files.find((file) => file.path === path);
  if (!change) throw new Error(t("该文件已不在当前变更列表中，请刷新后重试。"));
  const result: FileDiff = {
    path,
    ...(change.oldPath ? { oldPath: change.oldPath } : {}),
    state: "empty",
    patch: "",
    hunks: [],
    message: null,
  };
  if (change.status === "conflicted" && comparison !== "head") {
    return {
      ...result,
      message: t("文件存在未解决的合并冲突，请切换全部未提交查看工作目录中的冲突标记。"),
    };
  }
  const absolute = resolveFile(repository.directory, path);
  try {
    const stat = await lstat(absolute);
    if (stat.isDirectory())
      return { ...result, message: t("这是未注册的嵌套仓库目录，请单独打开该仓库。") };
    if (comparison !== "staged" && stat.size > MAX_FILE_BYTES)
      return {
        ...result,
        state: "too_large",
        message: t("文件超过 1 MiB，保留变更状态和统计；请在本地 Git 工具中查看完整内容。"),
      };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const options = [
    ...DIFF_OPTIONS,
    `--unified=${context}`,
    ...(ignoreWhitespace ? ["--ignore-all-space"] : []),
  ];
  let patch: string;
  try {
    if (change.status === "untracked" || (!repository.head && comparison === "head")) {
      patch = await git(
        repository.directory,
        ["diff", ...options, "--no-index", "--", "/dev/null", path],
        { acceptDifference: true, maxBuffer: 2 * 1024 * 1024 },
      );
    } else {
      const paths = change.oldPath ? [change.oldPath, path] : [path];
      patch = await git(
        repository.directory,
        [
          "diff",
          ...options,
          ...comparisonArgs(comparison, Boolean(repository.head)),
          "--",
          ...paths,
        ],
        { maxBuffer: 2 * 1024 * 1024 },
      );
    }
  } catch (error) {
    if (error instanceof GitError && error.tooLarge)
      return {
        ...result,
        state: "too_large",
        message: t("补丁超过 2 MiB，请在本地 Git 工具中查看完整内容。"),
      };
    throw error;
  }
  return materialize(repository, path, patch, ignoreWhitespace, t);
}

interface DiffJob {
  repository: RepositorySnapshot;
  path: string;
  context: number;
  ignoreWhitespace: boolean;
  baseOid: string;
  execution: GitReadContext;
  t: Translate;
  accept(diff: FileDiff): void;
  reject(error: unknown): void;
}

// The first file is read immediately. While it is in flight, coalesce other
// already requested files for at most 2 ms; there is no speculative prefetch.
export class FileDiffBatcher {
  private readonly groups = new Map<string, DiffJob[]>();
  private readonly active = new Map<string, number>();
  private readonly sizes = new Map<string, number>();
  private readonly headers = new Map<string, boolean>();
  private key(
    repository: RepositorySnapshot,
    context: number,
    ignoreWhitespace: boolean,
    baseOid: string,
  ) {
    return JSON.stringify([
      repository.directory,
      repository.head,
      context,
      ignoreWhitespace,
      baseOid,
    ]);
  }
  private async single(
    key: string,
    repository: RepositorySnapshot,
    path: string,
    context: number,
    ignoreWhitespace: boolean,
    t: Translate,
  ) {
    const diff = await readFileDiff(repository, path, "head", context, ignoreWhitespace, t);
    if (diff.patch) {
      this.headers.set(key, diff.patch.split("\n", 1)[0] === `diff --git a/${path} b/${path}`);
      while (this.headers.size > 64)
        this.headers.delete(this.headers.keys().next().value as string);
    }
    return diff;
  }
  private async track(key: string, read: () => Promise<FileDiff>) {
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    try {
      return await read();
    } finally {
      const left = (this.active.get(key) ?? 1) - 1;
      if (left) this.active.set(key, left);
      else this.active.delete(key);
    }
  }
  read(
    repository: RepositorySnapshot,
    path: string,
    comparison: Comparison,
    context: number,
    ignoreWhitespace: boolean,
    baseOid?: string,
    execution: GitReadContext = { priority: "interactive" },
    t: Translate = tZh,
  ): Promise<FileDiff> {
    const file = repository.files.find((file) => file.path === path);
    if (
      comparison !== "head" ||
      !repository.head ||
      file?.status !== "modified" ||
      file.oldPath ||
      file.binary ||
      baseOid === undefined ||
      !/^[a-zA-Z0-9_./-]+$/.test(path)
    )
      return readFileDiff(repository, path, comparison, context, ignoreWhitespace, t);
    // A size probe for every distinct baseline can cost more than the saved
    // diff processes. Share only a baseline object already used by this group.
    const key = this.key(repository, context, ignoreWhitespace, baseOid);
    // Establish support from an ordinary requested patch. Unknown or custom Git
    // prefixes use the original reader immediately, with no probing Git process.
    if (this.headers.get(key) !== true)
      return this.single(key, repository, path, context, ignoreWhitespace, t);
    const busy = this.active.has(key);
    return this.track(key, () => {
      if (!busy) return this.single(key, repository, path, context, ignoreWhitespace, t);
      let jobs = this.groups.get(key);
      if (!jobs) {
        jobs = [];
        this.groups.set(key, jobs);
        const pending = jobs;
        setTimeout(() => {
          if (this.groups.get(key) !== pending) return;
          this.groups.delete(key);
          void this.flush(pending);
        }, 2);
      }
      const pending = jobs;
      return new Promise<FileDiff>((accept, reject) =>
        pending.push({
          repository,
          path,
          context,
          ignoreWhitespace,
          baseOid,
          execution,
          t,
          accept,
          reject,
        }),
      );
    });
  }
  private async flush(jobs: DiffJob[]) {
    if (jobs.length > 32) {
      await Promise.all(
        Array.from({ length: Math.ceil(jobs.length / 32) }, (_, i) => {
          const chunk = jobs.slice(i * 32, (i + 1) * 32);
          return withGitPriority(chunk[0].execution, () => this.flush(chunk));
        }),
      );
      return;
    }
    const fallback = async (job: DiffJob) => {
      try {
        job.accept(
          await withGitPriority(job.execution, () =>
            readFileDiff(
              job.repository,
              job.path,
              "head",
              job.context,
              job.ignoreWhitespace,
              job.t,
            ),
          ),
        );
      } catch (error) {
        job.reject(error);
      }
    };
    if (jobs.length < 2) {
      await Promise.all(jobs.map(fallback));
      return;
    }
    const eligible: DiffJob[] = [];
    const deferred: DiffJob[] = [];
    await Promise.all(
      jobs.map(async (job) => {
        try {
          const stat = await lstat(resolveFile(job.repository.directory, job.path));
          if (stat.isFile() && stat.size <= 65536) eligible.push(job);
          else deferred.push(job);
        } catch {
          deferred.push(job);
        }
      }),
    );
    const otherReads = Promise.all(deferred.map(fallback));
    if (eligible.length < 2) {
      await Promise.all([otherReads, ...eligible.map(fallback)]);
      return;
    }
    const first = eligible[0];
    let remaining = eligible;
    let oversized: Promise<unknown> = Promise.resolve();
    try {
      const unknown = eligible.filter((job) => !this.sizes.has(job.baseOid));
      if (unknown.length) {
        const output = await git(first.repository.directory, ["cat-file", "-s", first.baseOid], {
          maxBuffer: 128,
        });
        const size = output.trim();
        if (/^\d+$/.test(size)) this.sizes.set(first.baseOid, Number(size));
      }
      while (this.sizes.size > 256) this.sizes.delete(this.sizes.keys().next().value as string);
      const bounded = eligible.filter((job) => {
        const bytes = this.sizes.get(job.baseOid);
        return bytes !== undefined && bytes <= 65536;
      });
      remaining = bounded;
      oversized = Promise.all(eligible.filter((job) => !bounded.includes(job)).map(fallback));
      if (bounded.length < 2) {
        await Promise.all([otherReads, oversized, ...bounded.map(fallback)]);
        return;
      }
      const patch = await git(
        first.repository.directory,
        [
          "diff",
          ...DIFF_OPTIONS,
          `--unified=${first.context}`,
          ...(first.ignoreWhitespace ? ["--ignore-all-space"] : []),
          "HEAD",
          "--",
          ...bounded.map((job) => job.path),
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      );
      const sections = new Map(
        patch
          .split(/(?=^diff --git )/m)
          .filter(Boolean)
          .map((section) => [section.split("\n", 1)[0], section]),
      );
      const expected = new Set(bounded.map((job) => `diff --git a/${job.path} b/${job.path}`));
      if ([...sections.keys()].some((header) => !expected.has(header))) {
        this.headers.set(
          this.key(first.repository, first.context, first.ignoreWhitespace, first.baseOid),
          false,
        );
        throw new Error("Non-default Git patch headers");
      }
      const fallbacks: Promise<void>[] = [];
      for (const job of bounded) {
        const section = sections.get(`diff --git a/${job.path} b/${job.path}`) ?? "";
        if (section && Buffer.byteLength(section) > 2 * 1024 * 1024) fallbacks.push(fallback(job));
        else
          job.accept(materialize(job.repository, job.path, section, job.ignoreWhitespace, job.t));
      }
      await Promise.all(fallbacks);
    } catch {
      await Promise.all(remaining.map(fallback));
    }
    await Promise.all([otherReads, oversized]);
  }
  invalidate(directories: Set<string>, t: Translate = tZh) {
    for (const key of this.headers.keys())
      if (directories.has((JSON.parse(key) as string[])[0])) this.headers.delete(key);
    for (const [key, jobs] of this.groups)
      if (directories.has(jobs[0].repository.directory)) {
        this.groups.delete(key);
        for (const job of jobs) job.reject(new Error(t("仓库已更新，请重试读取差异。")));
      }
  }
  close() {
    this.invalidate(new Set([...this.groups.values()].map((jobs) => jobs[0].repository.directory)));
    this.headers.clear();
    this.sizes.clear();
  }
}
