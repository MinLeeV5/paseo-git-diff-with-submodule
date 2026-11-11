import { expect, it } from "vitest";
import { buildFileRows, entryKey, folderKey } from "../client/changes-model";
import { changeSchema } from "../shared/contracts";

function file(path: string, oldPath?: string) {
  return changeSchema.parse({
    path,
    oldPath,
    status: oldPath ? "renamed" : "modified",
    additions: 2,
    deletions: 1,
    binary: false,
    staged: false,
    unstaged: true,
    version: "v1",
  });
}

it("keeps the original file order and metadata in list mode", () => {
  const files = [file("src/new.ts", "old.ts"), file("README.md")];
  const rows = buildFileRows("commit", files, false, new Set());
  expect(rows).toEqual(
    files.map((file) => ({ key: entryKey("commit", file.path), kind: "file", file, depth: 0 })),
  );
  expect(rows[0].kind === "file" && rows[0].file).toBe(files[0]);
  expect(buildFileRows("commit", [], true, new Set())).toEqual([]);
});

it("builds sorted nested folders with descendant counts and the current rename path", () => {
  const files = [
    file("src/lib/a.ts"),
    file("README.md"),
    file("src/b.ts"),
    file("docs/new.md", "old/place.md"),
  ];
  const rows = buildFileRows("commit", files, true, new Set());
  expect(
    rows.map((row) =>
      row.kind === "folder" ? [row.path, row.depth, row.count] : [row.file.path, row.depth],
    ),
  ).toEqual([
    ["docs", 0, 1],
    ["docs/new.md", 1],
    ["src", 0, 2],
    ["src/lib", 1, 1],
    ["src/lib/a.ts", 2],
    ["src/b.ts", 1],
    ["README.md", 0],
  ]);
  expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
});

it("scopes collapsed folders and can reveal search results without changing collapse state", () => {
  const files = [file("src/lib/a.ts"), file("src/b.ts"), file("README.md")];
  const collapsed = new Set([folderKey("first", "src")]);
  const paths = (scope: string, expandAll = false) =>
    buildFileRows(scope, files, true, collapsed, expandAll)
      .filter((row) => row.kind === "file")
      .map((row) => row.file.path);
  expect(paths("first")).toEqual(["README.md"]);
  expect(paths("second")).toEqual(["src/lib/a.ts", "src/b.ts", "README.md"]);
  expect(paths("first", true)).toEqual(paths("second"));
  expect([...collapsed]).toEqual([folderKey("first", "src")]);
});
