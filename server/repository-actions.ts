import { lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { RepositorySnapshot } from "../shared/contracts";
import { type Translate, tZh } from "../shared/i18n";
import type { RepositoryAction } from "../shared/repository-contracts";
import { DIFF_OPTIONS, git } from "./git";
import { parseIndex, parseNameStatus } from "./parsers";
import { resolveFile } from "./repositories";

async function head(directory: string) {
  return (
    (
      await git(directory, ["rev-parse", "--verify", "--quiet", "HEAD"], { acceptDifference: true })
    ).trim() || null
  );
}

function checkedPaths(repository: RepositorySnapshot, paths?: string[], t: Translate = tZh) {
  if (!paths) return ["."];
  return [...new Set(paths)].map((path) => {
    resolveFile(repository.directory, path);
    if (path.split(/[\\/]/).includes(".git") || path.includes("\0"))
      throw new Error(t("不能操作 Git 内部文件。"));
    return path;
  });
}

async function stage(repository: RepositorySnapshot, paths?: string[], t: Translate = tZh) {
  let selected = checkedPaths(repository, paths, t);
  if (paths) {
    const tracked = (
      await git(repository.directory, ["ls-files", "--cached", "-z", "--", ...selected])
    ).split("\0");
    const matches = await Promise.all(
      selected.map(async (path) => {
        const absolute = resolveFile(repository.directory, path);
        const normalized = relative(repository.directory, absolute).split(sep).join("/");
        return (
          tracked.some((entry) => entry === normalized || entry.startsWith(`${normalized}/`)) ||
          Boolean(await lstat(absolute).catch(() => null))
        );
      }),
    );
    // A staged rename has already removed its old path from both the index and disk.
    selected = selected.filter((_, index) => matches[index]);
    if (!selected.length) throw new Error(t("所选文件已变化，请刷新后重试。"));
  }
  await git(repository.directory, ["add", "--all", "--", ...selected]);
  // Newer Git also skips explicit gitlink adds when submodule ignore=all is set.
  // Update only selected, tracked, initialized gitlinks without changing config.
  const normalized = paths
    ? selected.map((path) =>
        relative(repository.directory, resolveFile(repository.directory, path))
          .split(sep)
          .join("/"),
      )
    : [""];
  const index = parseIndex(await git(repository.directory, ["ls-files", "--stage", "-z"]));
  for (const [path, entry] of index) {
    if (
      entry.mode !== "160000" ||
      !normalized.some((parent) => !parent || path === parent || path.startsWith(`${parent}/`))
    )
      continue;
    if (!(await lstat(join(repository.directory, path, ".git")).catch(() => null))) continue;
    const moduleHead = await head(resolveFile(repository.directory, path)).catch(() => null);
    if (moduleHead && moduleHead !== entry.oid)
      await git(repository.directory, ["update-index", "--cacheinfo", "160000", moduleHead, path]);
  }
}

async function syncTarget(repository: RepositorySnapshot, t: Translate = tZh) {
  if (!repository.branch || !repository.head)
    throw new Error(t("请先在本地分支上创建提交，再拉取或推送。"));
  const directory = repository.directory;
  const [remoteConfig, mergeConfig, remoteOutput] = await Promise.all([
    git(directory, ["config", "--get", `branch.${repository.branch}.remote`], {
      acceptDifference: true,
    }),
    git(directory, ["config", "--get", `branch.${repository.branch}.merge`], {
      acceptDifference: true,
    }),
    git(directory, ["remote"]),
  ]);
  const remotes = remoteOutput.trim().split("\n").filter(Boolean);
  const remote =
    remoteConfig.trim() ||
    (remotes.includes("origin") ? "origin" : remotes.length === 1 ? remotes[0] : "");
  if (!remote || (remote !== "." && !remotes.includes(remote)))
    throw new Error(
      t(
        remotes.length
          ? "无法确定远程仓库，请先为当前分支配置上游。"
          : "此仓库没有远程仓库，请先配置 remote。",
      ),
    );
  const ref = mergeConfig.trim() || `refs/heads/${repository.branch}`;
  if (!ref.startsWith("refs/heads/")) throw new Error(t("上游必须指向远程分支。"));
  return { remote, ref, tracking: Boolean(remoteConfig.trim() && mergeConfig.trim()) };
}

export async function runRepositoryAction(
  repository: RepositorySnapshot,
  input: RepositoryAction,
  t: Translate = tZh,
) {
  const directory = repository.directory;
  let message: string;
  switch (input.action) {
    case "stage":
      await stage(repository, input.paths, t);
      message = t(input.paths ? "已暂存所选文件。" : "已暂存此仓库的全部更改。");
      break;
    case "unstage": {
      const paths = checkedPaths(repository, input.paths, t);
      await git(
        directory,
        repository.head
          ? ["reset", "--quiet", "HEAD", "--", ...paths]
          : ["rm", "--cached", "--force", "-r", "--ignore-unmatch", "--", ...paths],
      );
      message = t("已取消暂存，工作目录内容已保留。");
      break;
    }
    case "commit": {
      const messageText = input.message.trim();
      if (!messageText) throw new Error(t("请填写提交信息。"));
      if ((await head(directory)) !== input.expectedHead)
        throw new Error(t("仓库 HEAD 已变化，请刷新并检查后重新提交。"));
      if (repository.conflictCount)
        throw new Error(t("仓库仍有未解决的冲突，请先解决冲突并暂存。"));
      if (input.stageAll) await stage(repository, undefined, t);
      const staged = await git(directory, [
        "diff",
        ...DIFF_OPTIONS,
        "--cached",
        "--name-only",
        "-z",
      ]);
      if (!staged) throw new Error(t("没有可提交的已暂存更改。"));
      await git(directory, ["commit", "--message", messageText], { timeout: 120000 });
      message = t("提交成功。");
      break;
    }
    case "pull": {
      if (repository.conflictCount) throw new Error(t("请先解决此仓库的冲突，再拉取。"));
      const target = await syncTarget(repository, t);
      await git(
        directory,
        [
          "pull",
          "--ff-only",
          "--no-rebase",
          "--no-recurse-submodules",
          "--",
          target.remote,
          target.ref,
        ],
        { timeout: 120000 },
      );
      message = t("拉取完成。");
      break;
    }
    case "push": {
      const target = await syncTarget(repository, t);
      await git(
        directory,
        [
          "push",
          "--recurse-submodules=no",
          ...(target.tracking ? [] : ["--set-upstream"]),
          "--",
          target.remote,
          `HEAD:${target.ref}`,
        ],
        { timeout: 120000 },
      );
      message = t("推送完成。");
      break;
    }
  }
  return { message, head: await head(directory) };
}

export async function commitChanges(
  repository: RepositorySnapshot,
  scope: "staged" | "all",
  t: Translate = tZh,
) {
  if (repository.conflictCount) throw new Error(t("请先解决冲突，再生成提交信息。"));
  const refs = scope === "staged" || !repository.head ? ["--cached"] : ["HEAD"];
  const names = parseNameStatus(
    await git(repository.directory, [
      "diff",
      ...DIFF_OPTIONS,
      "--ignore-submodules=dirty",
      "--name-status",
      "-z",
      ...refs,
      "--",
    ]),
  );
  if (scope === "all") {
    const untracked = (
      await git(repository.directory, ["ls-files", "--others", "--exclude-standard", "-z"])
    )
      .split("\0")
      .filter(Boolean);
    const existing = new Set(names.map((file) => file.path));
    for (const path of untracked)
      if (!existing.has(path)) names.push({ path, status: "untracked" });
  }
  // An unborn repository's index can still contain new files removed from disk.
  // They will not be part of an eventual stage-all commit.
  const changes =
    scope === "all" && !repository.head
      ? (
          await Promise.all(
            names.map(async (file) =>
              (await lstat(resolveFile(repository.directory, file.path)).catch((error) => {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
                throw error;
              }))
                ? file
                : null,
            ),
          )
        ).filter((file) => file !== null)
      : names;
  if (!changes.length)
    throw new Error(
      t(scope === "staged" ? "没有已暂存的更改可生成提交信息。" : "此仓库没有可提交的更改。"),
    );
  return changes;
}

export async function generateCommitMessage(
  repository: RepositorySnapshot,
  scope: "staged" | "all",
  t: Translate = tZh,
) {
  const names = await commitChanges(repository, scope, t);
  const documentation = names.every((file) =>
    /(?:^docs\/|\.(?:md|markdown|rst|txt)$)/i.test(file.path),
  );
  const tests = names.every((file) =>
    /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\./i.test(file.path),
  );
  const added = names.every((file) => ["added", "untracked"].includes(file.status));
  const removed = names.every((file) => file.status === "deleted");
  const prefix = documentation ? "docs" : tests ? "test" : added ? "feat" : "chore";
  const verb = added ? t("添加") : removed ? t("移除") : t("更新");
  const subject =
    names.length === 1
      ? names[0].path
      : t("{files}等 {count} 个文件", {
          files: names
            .slice(0, 2)
            .map((file) => file.path)
            .join(t("、")),
          count: names.length,
        });
  const labels: Record<string, string> = {
    added: "新增",
    untracked: "新增",
    deleted: "删除",
    modified: "修改",
    renamed: "重命名",
    copied: "复制",
    typechanged: "类型变化",
  };
  const details = names
    .slice(0, 30)
    .map(
      (file) =>
        `- ${t(labels[file.status] ?? "更新")} ${JSON.stringify(file.path)}${file.oldPath ? t("（原路径 {path}）", { path: JSON.stringify(file.oldPath) }) : ""}`,
    );
  if (names.length > 30) details.push(t("- 其余 {count} 个文件", { count: names.length - 30 }));
  const title = `${prefix}: ${verb}${subject}`;
  return {
    message: `${title.length > 100 ? `${prefix}: ${verb} ${t("{count} 个文件", { count: names.length })}` : title}\n\n${details.join("\n")}`,
    scope,
    source: "local" as const,
  };
}
