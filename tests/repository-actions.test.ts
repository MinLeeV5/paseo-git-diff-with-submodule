import { chmod, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as gitModule from "../server/git";
import { GitChangesService } from "../server/service";
import { repositoryActionRpc } from "../shared/repository-contracts";
import { addModule, command, commit, fixture, put } from "./fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanups.splice(0).map((close) => close()));
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const directory = await f.repo("workspace");
  const service = new GitChangesService();
  cleanups.push(async () => service.close());
  return { f, directory, service };
}
async function currentHead(directory: string) {
  return (await command(directory, "rev-parse", "HEAD")).trim();
}

describe("repository changes", () => {
  it("commits only the index and retains partially staged and unstaged working content", async () => {
    const { directory, service } = await setup();
    await put(directory, "partial.txt", "baseline\n");
    await put(directory, "other.txt", "baseline\n");
    await commit(directory);
    await put(directory, "partial.txt", "staged\n");
    await command(directory, "add", "--", "partial.txt");
    await put(directory, "partial.txt", "working\n");
    await put(directory, "other.txt", "unstaged\n");
    const before = await currentHead(directory);
    const result = await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "commit",
      message: "fix: partial\n\nKeep the working copy.",
      stageAll: false,
      expectedHead: before,
    });
    expect(result.head).not.toBe(before);
    expect(await command(directory, "show", "HEAD:partial.txt")).toBe("staged\n");
    expect(await command(directory, "show", "HEAD:other.txt")).toBe("baseline\n");
    expect(await readFile(join(directory, "partial.txt"), "utf8")).toBe("working\n");
    const snapshot = await service.snapshot({ directory, comparison: "head" });
    expect(snapshot.repositories[0]).toMatchObject({
      stagedCount: 0,
      unstagedCount: 2,
      conflictCount: 0,
    });
  });

  it("creates initial commits with literal multiline messages and respects ignore rules", async () => {
    const { directory, service } = await setup();
    await put(directory, ".gitignore", "ignored.txt\n");
    await put(directory, "file with spaces.txt", "first\n");
    await put(directory, "ignored.txt", "secret\n");
    const message = "feat: initial $(touch should-not-exist) `literal`\n\nSecond line.";
    await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "commit",
      message,
      stageAll: true,
      expectedHead: null,
    });
    expect((await command(directory, "log", "-1", "--format=%B")).trim()).toBe(message);
    expect(await command(directory, "ls-tree", "-r", "--name-only", "HEAD")).toBe(
      ".gitignore\nfile with spaces.txt\n",
    );
    expect(await readFile(join(directory, "ignored.txt"), "utf8")).toBe("secret\n");
    expect(
      repositoryActionRpc.input.safeParse({
        directory,
        repositoryId: ".",
        action: "commit",
        message: "  ",
        stageAll: true,
        expectedHead: null,
      }).success,
    ).toBe(false);
  });

  it("keeps main and ignored submodule commits independent and stages their gitlink explicitly", async () => {
    const { f, directory, service } = await setup();
    const source = await f.repo("source");
    await put(source, "child.txt", "baseline\n");
    await commit(source);
    const child = await addModule(directory, source, "modules/child");
    await command(child, "config", "user.name", "Plugin tests");
    await command(child, "config", "user.email", "test@example.invalid");
    await command(
      directory,
      "config",
      "-f",
      ".gitmodules",
      "submodule.modules/child.ignore",
      "all",
    );
    await put(directory, "main.txt", "baseline\n");
    await commit(directory);
    const mainHead = await currentHead(directory);
    const childHead = await currentHead(child);
    await put(directory, "main.txt", "main work\n");
    await put(child, "child.txt", "child work\n");
    const generated = await service.generateCommitMessage({
      directory,
      repositoryId: "modules/child",
      scope: "all",
    });
    expect(generated.message).toContain("child.txt");
    expect(generated.message).not.toContain("main.txt");
    await service.repositoryAction({
      directory,
      repositoryId: "modules/child",
      action: "commit",
      message: "fix: child only",
      stageAll: true,
      expectedHead: childHead,
    });
    expect(await currentHead(directory)).toBe(mainHead);
    expect(await command(directory, "show", "HEAD:main.txt")).toBe("baseline\n");
    await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "commit",
      message: "chore: update root and child pointer",
      stageAll: true,
      expectedHead: mainHead,
    });
    expect(await command(directory, "show", "HEAD:main.txt")).toBe("main work\n");
    expect((await command(directory, "ls-tree", "HEAD", "modules/child")).trim()).toContain(
      await currentHead(child),
    );
    expect(
      (await service.snapshot({ directory, comparison: "head" })).repositories.every(
        (repo) => repo.files.length === 0,
      ),
    ).toBe(true);
  });

  it("restages edited renames and unstages unborn files without changing working content", async () => {
    const { directory, service } = await setup();
    const path = "odd\nfile.txt";
    await put(directory, path, "staged\n");
    await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "stage",
      paths: [path],
    });
    await put(directory, path, "working\n");
    await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "unstage",
      paths: [path],
    });
    expect(await command(directory, "ls-files")).toBe("");
    expect(await readFile(join(directory, path), "utf8")).toBe("working\n");
    await commit(directory);
    await command(directory, "mv", path, "renamed.txt");
    await put(directory, "renamed.txt", "renamed work\n");
    await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "stage",
      paths: [path, "renamed.txt"],
    });
    expect(await command(directory, "show", ":renamed.txt")).toBe("renamed work\n");
    await service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "unstage",
      paths: [path, "renamed.txt"],
    });
    expect(await command(directory, "diff", "--cached", "--name-only")).toBe("");
    expect(await readFile(join(directory, "renamed.txt"), "utf8")).toBe("renamed work\n");
  });

  it("generates editable messages for the selected scope without touching the index", async () => {
    const { directory, service } = await setup();
    await put(directory, "docs/staged.md", "before\n");
    await commit(directory);
    await put(directory, "docs/staged.md", "after\n");
    await command(directory, "add", ".");
    await put(directory, "untracked.ts", "export const added = true;\n");
    const indexBefore = await command(directory, "diff", "--cached");
    const staged = await service.generateCommitMessage({
      directory,
      repositoryId: ".",
      scope: "staged",
    });
    expect(staged.message).toMatch(/^docs:/);
    expect(staged.message).toContain("docs/staged.md");
    expect(staged.message).not.toContain("untracked.ts");
    const all = await service.generateCommitMessage({ directory, repositoryId: ".", scope: "all" });
    expect(all.message).toContain("untracked.ts");
    expect(all.source).toBe("local");
    expect(await command(directory, "diff", "--cached")).toBe(indexBefore);
  });

  it("rejects unknown repositories, internal paths, stale HEADs and empty indexes", async () => {
    const { directory, service } = await setup();
    await put(directory, "a.txt", "a\n");
    await commit(directory);
    const before = await currentHead(directory);
    await expect(
      service.repositoryAction({ directory, repositoryId: "../other", action: "stage" }),
    ).rejects.toThrow("仓库不可用");
    for (const path of ["../outside.txt", ".git/config"])
      await expect(
        service.repositoryAction({ directory, repositoryId: ".", action: "stage", paths: [path] }),
      ).rejects.toThrow();
    await expect(
      service.repositoryAction({
        directory,
        repositoryId: ".",
        action: "commit",
        message: "empty",
        stageAll: false,
        expectedHead: before,
      }),
    ).rejects.toThrow("没有可提交");
    await put(directory, "a.txt", "b\n");
    await commit(directory);
    await expect(
      service.repositoryAction({
        directory,
        repositoryId: ".",
        action: "commit",
        message: "stale",
        stageAll: true,
        expectedHead: before,
      }),
    ).rejects.toThrow("HEAD 已变化");
  });

  it("preserves staged data after hook failures and releases the operation lock", async () => {
    const { directory, service } = await setup();
    await put(directory, "a.txt", "a\n");
    await commit(directory);
    const before = await currentHead(directory);
    await put(directory, "a.txt", "b\n");
    const hook = join(directory, ".git/hooks/pre-commit");
    await put(directory, ".git/hooks/pre-commit", "#!/bin/sh\necho rejected >&2\nexit 1\n");
    await chmod(hook, 0o755);
    const input = {
      directory,
      repositoryId: ".",
      action: "commit" as const,
      message: "hook test",
      stageAll: true,
      expectedHead: before,
    };
    await expect(service.repositoryAction(input)).rejects.toThrow();
    expect(await currentHead(directory)).toBe(before);
    expect(await command(directory, "diff", "--cached", "--name-only")).toContain("a.txt");
    await rm(hook);
    await expect(service.repositoryAction({ ...input, stageAll: false })).resolves.toMatchObject({
      message: "提交成功。",
    });
  });

  it("rejects overlapping operations on one repository", async () => {
    const { directory, service } = await setup();
    await put(directory, "a.txt", "a\n");
    await commit(directory);
    await put(directory, "a.txt", "b\n");
    const original = gitModule.git;
    let release = () => {};
    let started = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(gitModule, "git").mockImplementation(async (dir, args, options) => {
      if (args[0] === "commit") {
        started = true;
        await gate;
      }
      return original(dir, args, options);
    });
    const operation = service.repositoryAction({
      directory,
      repositoryId: ".",
      action: "commit",
      message: "serialized",
      stageAll: true,
      expectedHead: await currentHead(directory),
    });
    try {
      await vi.waitFor(() => expect(started).toBe(true));
      await expect(
        service.repositoryAction({ directory, repositoryId: ".", action: "unstage" }),
      ).rejects.toThrow("正在执行");
    } finally {
      release();
    }
    await operation;
  });
});

describe("repository synchronization", () => {
  it("counts outgoing and incoming commits from local upstream refs without fetching", async () => {
    const { f, directory, service } = await setup();
    const snapshot = (comparison: "head" | "staged" | "unstaged" = "head") =>
      service.snapshot({ directory, comparison, force: true });
    expect((await snapshot()).repositories[0]).toMatchObject({
      aheadCount: null,
      behindCount: null,
    });
    await put(directory, "base.txt", "base\n");
    await commit(directory);
    expect((await snapshot()).repositories[0]).toMatchObject({
      aheadCount: null,
      behindCount: null,
    });
    const remote = join(f.base, "counts.git");
    await command(f.base, "init", "--bare", "-q", remote);
    await command(directory, "remote", "add", "origin", remote);
    await service.repositoryAction({ directory, repositoryId: ".", action: "push" });
    expect((await snapshot()).repositories[0]).toMatchObject({
      upstream: "origin/main",
      aheadCount: 0,
      behindCount: 0,
    });
    const peer = join(f.base, "counts-peer");
    await command(f.base, "clone", "-q", "--branch", "main", remote, peer);
    await put(directory, "outgoing.txt", "local\n");
    await commit(directory);
    for (let i = 1; i <= 2; i++) {
      await put(peer, `incoming-${i}.txt`, "remote\n");
      await commit(peer);
    }
    await command(peer, "push", "-q");
    const before = await snapshot();
    expect(before.repositories[0]).toMatchObject({ aheadCount: 1, behindCount: 0 });
    await command(directory, "fetch", "-q", "origin");
    // User status settings must not turn exact counts into unknown values.
    await command(directory, "config", "status.aheadBehind", "false");
    for (const comparison of ["head", "staged", "unstaged"] as const) {
      const after = await snapshot(comparison);
      expect(after.repositories[0]).toMatchObject({ aheadCount: 1, behindCount: 2, files: [] });
      expect(after.version).not.toBe(before.version);
    }
    await command(directory, "update-ref", "-d", "refs/remotes/origin/main");
    expect((await snapshot()).repositories[0]).toMatchObject({
      upstream: "origin/main",
      aheadCount: null,
      behindCount: null,
    });
    await command(directory, "checkout", "--detach", "-q");
    expect((await snapshot()).repositories[0]).toMatchObject({
      branch: null,
      upstream: null,
      aheadCount: null,
      behindCount: null,
    });
  });

  it("pulls and pushes a submodule independently of its parent repository", async () => {
    const { f, directory, service } = await setup();
    const source = await f.repo("source");
    await put(source, "child.txt", "base\n");
    await commit(source);
    const child = await addModule(directory, source, "modules/child");
    await commit(directory);
    const mainHead = await currentHead(directory);
    const remote = join(f.base, "child.git");
    await command(f.base, "init", "--bare", "-q", remote);
    await command(child, "remote", "set-url", "origin", remote);
    await service.repositoryAction({ directory, repositoryId: "modules/child", action: "push" });
    const peer = join(f.base, "peer");
    await command(f.base, "clone", "-q", "--branch", "main", remote, peer);
    await put(peer, "remote-child.txt", "remote child update\n");
    await commit(peer);
    await command(peer, "push", "-q");
    await command(child, "fetch", "-q", "origin");
    const beforePull = await service.snapshot({ directory, comparison: "head", force: true });
    expect(beforePull.repositories[0]).toMatchObject({ aheadCount: null, behindCount: null });
    expect(beforePull.repositories[1]).toMatchObject({ aheadCount: 0, behindCount: 1 });
    await service.repositoryAction({ directory, repositoryId: "modules/child", action: "pull" });
    expect(
      (await service.snapshot({ directory, comparison: "head" })).repositories[1],
    ).toMatchObject({ aheadCount: 0, behindCount: 0 });
    expect(await currentHead(child)).toBe(await currentHead(peer));
    expect(await currentHead(directory)).toBe(mainHead);
    expect(await readFile(join(child, "remote-child.txt"), "utf8")).toBe("remote child update\n");
    expect(await command(directory, "ls-tree", "HEAD", "modules/child")).not.toContain(
      await currentHead(child),
    );
  });

  it("refuses to stage and commit unresolved merge markers", async () => {
    const { directory, service } = await setup();
    await put(directory, "conflict.txt", "base\n");
    await commit(directory);
    await command(directory, "checkout", "-qb", "other");
    await put(directory, "conflict.txt", "other\n");
    await commit(directory);
    await command(directory, "checkout", "main");
    await put(directory, "conflict.txt", "main\n");
    await commit(directory);
    await expect(command(directory, "merge", "other")).rejects.toThrow();
    const before = await currentHead(directory);
    const unmerged = await command(directory, "ls-files", "--unmerged");
    await expect(
      service.repositoryAction({
        directory,
        repositoryId: ".",
        action: "commit",
        message: "conflict",
        stageAll: true,
        expectedHead: before,
      }),
    ).rejects.toThrow("未解决的冲突");
    expect(await command(directory, "ls-files", "--unmerged")).toBe(unmerged);
    expect(await currentHead(directory)).toBe(before);
  });

  it("pushes a new upstream, pulls a fast-forward, and rejects divergence without force", async () => {
    const { f, directory, service } = await setup();
    const remote = join(f.base, "remote.git");
    await command(f.base, "init", "--bare", "-q", remote);
    await put(directory, "a.txt", "base\n");
    await commit(directory);
    await command(directory, "remote", "add", "origin", remote);
    await service.repositoryAction({ directory, repositoryId: ".", action: "push" });
    expect((await command(directory, "rev-parse", "--abbrev-ref", "@{upstream}")).trim()).toBe(
      "origin/main",
    );
    const peer = join(f.base, "peer");
    await command(f.base, "clone", "-q", "--branch", "main", remote, peer);
    await put(peer, "remote.txt", "remote work\n");
    await commit(peer);
    await command(peer, "push", "-q");
    await service.repositoryAction({ directory, repositoryId: ".", action: "pull" });
    expect(await readFile(join(directory, "remote.txt"), "utf8")).toBe("remote work\n");
    expect(await currentHead(directory)).toBe(await currentHead(peer));
    const snapshot = await service.snapshot({ directory, comparison: "head" });
    expect(snapshot.repositories[0].upstream).toBe("origin/main");
    await put(directory, "local.txt", "local work\n");
    await commit(directory);
    const localHead = await currentHead(directory);
    await put(peer, "other-remote.txt", "divergent\n");
    await commit(peer);
    await command(peer, "push", "-q");
    await expect(
      service.repositoryAction({ directory, repositoryId: ".", action: "pull" }),
    ).rejects.toThrow();
    expect(await currentHead(directory)).toBe(localHead);
    await expect(
      service.repositoryAction({ directory, repositoryId: ".", action: "push" }),
    ).rejects.toThrow();
    expect(await command(remote, "rev-parse", "refs/heads/main")).toBe(
      `${await currentHead(peer)}\n`,
    );
  });

  it("explains missing remotes and refuses detached HEAD synchronization", async () => {
    const { directory, service } = await setup();
    await put(directory, "a.txt", "base\n");
    await commit(directory);
    await expect(
      service.repositoryAction({ directory, repositoryId: ".", action: "push" }),
    ).rejects.toThrow("没有远程仓库");
    await command(directory, "checkout", "--detach", "-q");
    await expect(
      service.repositoryAction({ directory, repositoryId: ".", action: "pull" }),
    ).rejects.toThrow("本地分支");
  });
});
