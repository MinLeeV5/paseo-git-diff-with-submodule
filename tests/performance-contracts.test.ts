import { afterEach, expect, it, vi } from "vitest";
import { readFileDiff } from "../server/diff";
import { git } from "../server/git";
import { RepositoryScanCache, readRepository } from "../server/repositories";
import { GitChangesService } from "../server/service";
import { mergeChangesView } from "../shared/changes-view";
import { compactFileDiff } from "../shared/contracts";
import { command, commit, fixture, put } from "./fixtures";

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
async function setup(paths = Array.from({ length: 12 }, (_, i) => `src/file-${i}.ts`)) {
  const f = await fixture();
  cleanups.push(f.close);
  const directory = await f.repo("root");
  const before = "export const before = 1;\n";
  for (const path of paths) await put(directory, path, before);
  await commit(directory);
  for (const path of paths) await put(directory, path, "export const after = 2;\n");
  const service = new GitChangesService();
  cleanups.unshift(async () => service.close());
  const input = {
    directory,
    comparison: "head" as const,
    repositoryId: ".",
    context: 3,
    ignoreWhitespace: false,
  };
  return { directory, paths, service, input };
}

it("batches concurrent tracked reads without changing patches or spawning one diff per file", async () => {
  const { paths, service, input } = await setup();
  const repo = (await service.snapshot(input)).repositories[0];
  const expected = await Promise.all(paths.map((path) => readFileDiff(repo, path, "head")));
  // Keep metadata fresh independently of how long setup took on the test host.
  await service.snapshot({ ...input, force: true });
  await service.diff({ ...input, path: paths[0] });
  vi.mocked(git).mockClear();
  const actual = await Promise.all(paths.map((path) => service.diff({ ...input, path })));
  expect(actual).toEqual(expected);
  const patches = vi
    .mocked(git)
    .mock.calls.filter(
      ([, args]) =>
        args[0] === "diff" && !args.includes("--name-status") && !args.includes("--numstat"),
    );
  expect(patches.length).toBeLessThan(paths.length);
  expect(patches.some(([, args]) => paths.filter((path) => args.includes(path)).length > 1)).toBe(
    true,
  );
});

it("retains exact patches for special filenames and non-default Git headers", async () => {
  const { directory, paths, service, input } = await setup([
    "plain.ts",
    "second.ts",
    "third.ts",
    "with space.ts",
    "中文.ts",
    ...(process.platform === "win32" ? [] : ['quoted"file.ts']),
  ]);
  await command(directory, "config", "diff.mnemonicPrefix", "true");
  const repo = (await service.snapshot({ ...input, force: true })).repositories[0];
  const expected = await Promise.all(paths.map((path) => readFileDiff(repo, path, "head")));
  vi.mocked(git).mockClear();
  expect(await Promise.all(paths.map((path) => service.diff({ ...input, path })))).toEqual(
    expected,
  );
  const calls = vi.mocked(git).mock.calls;
  expect(calls.some(([, args]) => args[0] === "ls-tree" && args.includes("-l"))).toBe(false);
  expect(calls.some(([, args]) => args[0] === "cat-file")).toBe(false);
  expect(calls.filter(([, args]) => args[0] === "diff")).toHaveLength(paths.length);
});

it("does not put untracked, oversized or staged files on the tracked batch path", async () => {
  const { directory, service, input } = await setup(["small.ts", "other.ts", "large.ts"]);
  await put(directory, "new.txt", "untracked\n");
  await put(directory, "large.ts", "x".repeat(1024 * 1024 + 1));
  await command(directory, "add", "small.ts");
  const repo = (await service.snapshot({ ...input, force: true })).repositories[0];
  for (const comparison of ["head", "staged", "unstaged"] as const) {
    const snapshot =
      comparison === "head"
        ? repo
        : (await service.snapshot({ ...input, comparison, force: true })).repositories[0];
    const expected = await Promise.all(
      snapshot.files.map((file) => readFileDiff(snapshot, file.path, comparison)),
    );
    const actual = await Promise.all(
      snapshot.files.map((file) => service.diff({ ...input, comparison, path: file.path })),
    );
    expect(actual).toEqual(expected);
  }
});

it("sends no repository bodies on an unchanged view and keeps client object identity", async () => {
  const { service, input } = await setup();
  const first = await service.snapshotView({ ...input, progressive: true });
  expect(first.pending).toBeUndefined();
  const snapshot = mergeChangesView(null, first);
  vi.mocked(git).mockClear();
  const next = await service.snapshotView({
    ...input,
    progressive: true,
    known: first.repositoryVersions,
  });
  expect(next.repositories).toEqual([]);
  expect(vi.mocked(git)).not.toHaveBeenCalled();
  const merged = mergeChangesView(snapshot, next);
  expect(merged.repositories[0]).toBe(snapshot.repositories[0]);
  expect(JSON.stringify(next).length).toBeLessThan(JSON.stringify(first).length);
});

it("removes disappeared repositories when applying deltas without dropping retained siblings", async () => {
  const { service, input } = await setup();
  const first = await service.snapshotView(input);
  const root = first.repositories[0];
  const snapshot = mergeChangesView(null, {
    ...first,
    repositories: [root, { ...root, id: "old" }, { ...root, id: "keep" }],
    repositoryIds: [".", "old", "keep"],
  });
  const next = { ...first, repositories: [], repositoryIds: [".", "keep"] };
  const merged = mergeChangesView(snapshot, next);
  expect(merged.repositories.map((repo) => repo.id)).toEqual([".", "keep"]);
  expect(merged.repositories[1]).toBe(snapshot.repositories[2]);
});

it("compacts text views while preserving their hunks and metadata-only patch text", async () => {
  const { service, input, paths } = await setup(["file.ts"]);
  const diff = await service.diff({ ...input, path: paths[0] });
  const view = compactFileDiff(diff);
  expect(view.patch).toBe("");
  expect(view.hunks).toBe(diff.hunks);
  expect(diff.patch).toContain("+export const after");
  const metadata = {
    ...diff,
    state: "empty" as const,
    hunks: [],
    patch: "old mode 100644\nnew mode 100755\n",
  };
  expect(compactFileDiff(metadata)).toBe(metadata);
});

it("retains baseline objects only for changed files instead of the whole HEAD tree", async () => {
  const { directory, paths } = await setup();
  await command(directory, "restore", "--", ...paths.slice(1));
  const read = await readRepository(
    directory,
    ".",
    null,
    null,
    null,
    "head",
    new RepositoryScanCache(),
  );
  expect(read.snapshot.files.map((file) => file.path)).toEqual([paths[0]]);
  expect([...(read.baseEntries?.keys() ?? [])]).toEqual([paths[0]]);
  expect(read.baseEntries?.get(paths[0])?.oid).toMatch(/^[a-f0-9]{40,64}$/);
});

it("uses the original read immediately for distinct baseline objects without size probes", async () => {
  const { directory, paths, service, input } = await setup();
  for (const path of paths) await put(directory, path, `// ${path}\nexport const before = 1;\n`);
  await commit(directory);
  for (const path of paths) await put(directory, path, `// ${path}\nexport const after = 2;\n`);
  const repository = (await service.snapshot({ ...input, force: true })).repositories[0];
  const expected = await Promise.all(paths.map((path) => readFileDiff(repository, path, "head")));
  await service.snapshot({ ...input, force: true });
  await service.diff({ ...input, path: paths[0] });
  vi.mocked(git).mockClear();
  expect(await Promise.all(paths.map((path) => service.diff({ ...input, path })))).toEqual(
    expected,
  );
  expect(vi.mocked(git).mock.calls.some(([, args]) => args[0] === "cat-file")).toBe(false);
  expect(vi.mocked(git).mock.calls.filter(([, args]) => args[0] === "diff")).toHaveLength(
    paths.length - 1,
  );
});
