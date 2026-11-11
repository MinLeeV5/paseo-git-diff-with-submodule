import { realpath } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { currentGitPriority, git } from "../server/git";
import { GitChangesService } from "../server/service";
import { addModule, command, commit, fixture, put } from "./fixtures";

vi.mock("../server/git", async (original) => {
  const module = await original<typeof import("../server/git")>();
  return { ...module, git: vi.fn(module.git) };
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.mocked(git).mockRestore();
  vi.restoreAllMocks();
  await Promise.all(cleanups.splice(0).map((close) => close()));
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const source = await f.repo("source");
  await put(source, "file.txt", "original\n");
  await commit(source);
  const root = await realpath(await f.repo("root"));
  await put(root, "root.txt", "original\n");
  await commit(root);
  const child = await addModule(root, source, "modules/child");
  const sibling = await addModule(root, source, "modules/sibling");
  await commit(root);
  await put(root, "root.txt", "changed root\n");
  await put(child, "file.txt", "changed child\n");
  await put(sibling, "file.txt", "changed sibling\n");
  const service = new GitChangesService();
  cleanups.unshift(async () => service.close());
  const input = {
    directory: root,
    comparison: "head" as const,
    context: 3,
    ignoreWhitespace: false,
  };
  return { f, root, child, sibling, service, input };
}

it("revalidates only the selected repository path after a snapshot expires", async () => {
  const { root, child, sibling, service, input } = await setup();
  await service.snapshot(input);
  const time = Date.now();
  const now = vi.spyOn(Date, "now").mockReturnValue(time + 2000);
  vi.mocked(git).mockClear();
  const result = await service.diff({ ...input, repositoryId: "modules/child", path: "file.txt" });
  expect(result.patch).toContain("+changed child");
  expect(vi.mocked(git).mock.calls.some(([directory]) => directory === sibling)).toBe(false);
  expect(new Set(vi.mocked(git).mock.calls.map(([directory]) => directory))).toEqual(
    new Set([root, child]),
  );
  now.mockRestore();
});

it("does not wait for an unrelated repository scan to finish", async () => {
  const { root, sibling, service, input } = await setup();
  const original = vi.mocked(git).getMockImplementation() as typeof git;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(git).mockImplementation(async (directory, args, options) => {
    if (directory === sibling && args[0] === "rev-parse" && args[1] === "--verify") await blocked;
    return original(directory, args, options);
  });
  try {
    const partial = await service.snapshot({ ...input, progressive: true });
    expect(partial.pending).toBe(true);
    expect(partial.repositories[0].directory).toBe(root);
    const result = await service.diff({ ...input, repositoryId: ".", path: "root.txt" });
    expect(result.patch).toContain("+changed root");
  } finally {
    release();
  }
  const complete = await service.snapshot(input);
  expect(complete.pending).toBeUndefined();
  expect(complete.repositories.map((repo) => repo.id)).toEqual([
    ".",
    "modules/child",
    "modules/sibling",
  ]);
});

it("keeps another repository's patch cached after staging one child", async () => {
  const { service, input } = await setup();
  await service.snapshot(input);
  const target = { ...input, repositoryId: "modules/sibling", path: "file.txt" };
  const before = await service.diff(target);
  await service.repositoryAction({
    directory: input.directory,
    repositoryId: "modules/child",
    action: "stage",
    paths: ["file.txt"],
  });
  expect(await service.diff(target)).toBe(before);
});

it("keeps the complete tree during refresh and reads fresh data before siblings settle", async () => {
  const { root, sibling, service, input } = await setup();
  const before = await service.snapshot(input);
  const target = { ...input, repositoryId: ".", path: "root.txt" };
  await service.diff(target);
  await put(root, "root.txt", "refreshed while scanning\n");
  const original = vi.mocked(git).getMockImplementation() as typeof git;
  let releaseRoot!: () => void;
  let releaseSibling!: () => void;
  let startedRoot!: () => void;
  const rootStarted = new Promise<void>((resolve) => {
    startedRoot = resolve;
  });
  const blockedRoot = new Promise<void>((resolve) => {
    releaseRoot = resolve;
  });
  const blockedSibling = new Promise<void>((resolve) => {
    releaseSibling = resolve;
  });
  vi.mocked(git).mockImplementation(async (directory, args, options) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      if (directory === root) {
        startedRoot();
        await blockedRoot;
        expect(currentGitPriority()).toBe("interactive");
      }
      if (directory === sibling) await blockedSibling;
    }
    return original(directory, args, options);
  });
  vi.mocked(git).mockClear();
  const refresh = service.snapshot({ ...input, force: true, progressive: true, background: true });
  await rootStarted;
  const selected = service.diff(target);
  releaseRoot();
  try {
    const partial = await refresh;
    expect(partial.pending).toBe(true);
    expect(partial.repositories).toBe(before.repositories);
    expect((await selected).patch).toContain("+refreshed while scanning");
    expect(
      vi
        .mocked(git)
        .mock.calls.filter(
          ([directory, args]) =>
            directory === root && args[0] === "rev-parse" && args[1] === "--show-toplevel",
        ),
    ).toHaveLength(1);
  } finally {
    releaseRoot();
    releaseSibling();
  }
  const after = await service.snapshot(input);
  expect(after.pending).toBeUndefined();
  expect(after.repositories.map((repo) => repo.id)).toEqual(
    before.repositories.map((repo) => repo.id),
  );
  expect(after.repositories[0].files[0].version).not.toBe(before.repositories[0].files[0].version);
});

it("refreshes HEAD, index, file changes, deletion and module availability", async () => {
  const { child, service, input } = await setup();
  const target = { ...input, repositoryId: "modules/child", path: "file.txt" };
  await service.snapshot(input);
  expect((await service.diff(target)).patch).toContain("+changed child");
  await put(child, "file.txt", "next content\n");
  await service.snapshot({ ...input, force: true });
  expect((await service.diff(target)).patch).toContain("+next content");
  await command(child, "add", "file.txt");
  await service.snapshot({ ...input, comparison: "staged", force: true });
  expect((await service.diff({ ...target, comparison: "staged" })).patch).toContain(
    "+next content",
  );
  await commit(child);
  await service.snapshot({ ...input, force: true });
  await expect(service.diff(target)).rejects.toThrow("文件已不在");
  await command(child, "rm", "file.txt");
  await service.snapshot({ ...input, force: true });
  expect((await service.diff(target)).patch).toContain("-next content");
});
