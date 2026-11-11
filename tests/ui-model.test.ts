import { expect, it } from "vitest";
import {
  buildChangeRows,
  entryKey,
  folderKey,
  repositoryName,
  resolveCollapsedRows,
} from "../client/changes-model";
import { repositorySchema } from "../shared/contracts";

function repository(id: string, paths: { path: string; oldPath?: string }[]) {
  return repositorySchema.parse({
    id,
    directory: `/workspace/${id}`,
    relativePath: id === "." ? "" : id,
    parentId: id === "." ? null : ".",
    head: "abc",
    recordedHead: null,
    indexedHead: null,
    state: "ready",
    error: null,
    files: paths.map((file) => ({
      ...file,
      status: file.oldPath ? "renamed" : "modified",
      additions: 1,
      deletions: 1,
      binary: false,
      staged: false,
      unstaged: true,
      version: "v1",
    })),
  });
}

it.each([
  ["/work/easiclass-ai-grader-next", "", "easiclass-ai-grader-next"],
  ["/work/easiclass-ai-grader-next/", "", "easiclass-ai-grader-next"],
  ["C:\\work\\easiclass-ai-grader-next\\", "", "easiclass-ai-grader-next"],
  ["/work/root/modules/client", "modules/client", "client"],
])("uses the repository directory name for %s", (directory, relativePath, expected) => {
  expect(repositoryName({ directory, relativePath })).toBe(expected);
});

it("keeps identical paths in different repositories independently selectable and collapsible", () => {
  const repos = [
    repository(".", [{ path: "src/index.ts" }]),
    repository("packages/client", [{ path: "src/index.ts" }]),
  ];
  const rows = buildChangeRows(repos, "", true, new Set([folderKey(".", "src")]));
  expect(rows.filter((row) => row.kind === "file").map((row) => row.key)).toEqual([
    entryKey("packages/client", "src/index.ts"),
  ]);
  expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
});

it("reveals filtered descendants of collapsed repositories and folders, including rename origins", () => {
  const repo = repository(".", [
    { path: "src/new.ts", oldPath: "src/old.ts" },
    { path: "docs/readme.md" },
  ]);
  const collapsed = new Set(["repo:.", folderKey(".", "src")]);
  const rows = buildChangeRows([repo], "  OLD.ts  ", true, collapsed);
  expect(rows.filter((row) => row.kind === "file").map((row) => row.file.path)).toEqual([
    "src/new.ts",
  ]);
  expect(rows[0]).toMatchObject({ count: 1 });
  expect(collapsed.size).toBe(2);
});

it("keeps an explicit clean or unavailable repository state and never invents file rows", () => {
  const clean = repository(".", []);
  const unavailable = { ...repository("child", []), state: "uninitialized" as const };
  expect(
    buildChangeRows([clean, unavailable], "", false, new Set()).map((row) => row.kind),
  ).toEqual(["repository", "actions", "notice", "repository", "notice"]);
  expect(buildChangeRows([clean, unavailable], "missing", false, new Set())).toEqual([]);
});

it("defaults clean repositories to collapsed even with sync counts, only in multi-repository workspaces", () => {
  const clean = { ...repository(".", []), aheadCount: 3, behindCount: 2 };
  const changed = repository("child", [{ path: "src/index.ts" }]);
  const unavailable = { ...repository("missing", []), state: "uninitialized" as const };
  const error = { ...repository("failed", []), state: "error" as const, error: "Scan failed" };
  const repos = [clean, changed, unavailable, error];
  const collapsed = resolveCollapsedRows(repos, new Map());

  expect(resolveCollapsedRows([clean], new Map()).size).toBe(0);
  expect([...collapsed]).toEqual(["repo:."]);
  const rows = buildChangeRows(repos, "", false, collapsed);
  expect(rows.filter((row) => row.repository.id === ".").map((row) => row.kind)).toEqual([
    "repository",
  ]);
  expect(rows.some((row) => row.kind === "file" && row.repository.id === "child")).toBe(true);
  expect(rows.filter((row) => row.kind === "notice").map((row) => row.repository.id)).toEqual([
    "missing",
    "failed",
  ]);
});

it("updates default collapse when changes appear or disappear while preserving manual choices", () => {
  const clean = repository("child", []);
  const changed = repository("child", [{ path: "src/index.ts" }]);
  const parent = repository(".", [{ path: "README.md" }]);
  const overrides = new Map<string, boolean>();

  expect(resolveCollapsedRows([parent, changed], overrides).has("repo:child")).toBe(false);
  expect(resolveCollapsedRows([parent, clean], overrides).has("repo:child")).toBe(true);
  expect(resolveCollapsedRows([parent, changed], overrides).has("repo:child")).toBe(false);

  overrides.set("repo:child", false);
  const expanded = resolveCollapsedRows([parent, clean], overrides);
  expect(expanded.has("repo:child")).toBe(false);
  expect(
    buildChangeRows([parent, clean], "", false, expanded)
      .filter((row) => row.repository.id === "child")
      .map((row) => row.kind),
  ).toEqual(["repository", "actions", "notice"]);

  overrides.set("repo:child", true);
  overrides.set(folderKey(".", "src"), true);
  const collapsed = resolveCollapsedRows([parent, changed], overrides);
  expect(collapsed.has("repo:child")).toBe(true);
  expect(collapsed.has(folderKey(".", "src"))).toBe(true);
});

it("allows expanding all clean repositories and revealing a filtered clean repository", () => {
  const repos = [repository(".", []), repository("child", [])];
  const collapsed = resolveCollapsedRows(repos, new Map());
  expect(buildChangeRows(repos, "", false, collapsed).map((row) => row.kind)).toEqual([
    "repository",
    "repository",
  ]);
  expect(buildChangeRows(repos, "child", false, collapsed).map((row) => row.kind)).toEqual([
    "repository",
    "actions",
    "notice",
  ]);
  const expanded = resolveCollapsedRows(
    repos,
    new Map(repos.map((repo) => [`repo:${repo.id}`, false])),
  );
  expect(buildChangeRows(repos, "", false, expanded).map((row) => row.kind)).toEqual([
    "repository",
    "actions",
    "notice",
    "repository",
    "actions",
    "notice",
  ]);
});
