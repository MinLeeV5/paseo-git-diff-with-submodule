import { symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { revealTarget } from "../server/files";
import { GitChangesService } from "../server/service";
import { command, commit, fixture, put } from "./fixtures";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const directory = await f.repo("preview");
  const service = new GitChangesService();
  cleanups.push(() => service.close());
  return { ...f, directory, service };
}
it("previews the actual index separately from working content including staged image bytes", async () => {
  const { directory, service } = await setup();
  await put(directory, "readme.md", "# Original\n");
  await commit(directory);
  await put(directory, "readme.md", "# Index\n");
  const image = Buffer.from([137, 80, 78, 71, 0, 255, 128]);
  await put(directory, "image.png", image);
  await command(directory, "add", "readme.md", "image.png");
  await put(directory, "readme.md", "# Working\n");
  const input = { directory, repositoryId: ".", path: "readme.md" };
  expect(await service.content({ ...input, comparison: "staged" })).toMatchObject({
    state: "text",
    source: "index",
    content: "# Index\n",
  });
  expect(await service.content({ ...input, comparison: "head" })).toMatchObject({
    state: "text",
    source: "working",
    content: "# Working\n",
  });
  expect(
    (await service.content({ ...input, path: "image.png", comparison: "staged" })).content,
  ).toBe(`data:image/png;base64,${image.toString("base64")}`);
});
it("returns deliberate states for deleted, binary and large files", async () => {
  const { directory, service } = await setup();
  await put(directory, "deleted.html", "before");
  await commit(directory);
  await unlink(join(directory, "deleted.html"));
  await put(directory, "binary.dat", Buffer.from([0, 1, 2]));
  await put(directory, "large.html", "x".repeat(1024 * 1024 + 1));
  const input = { directory, repositoryId: ".", comparison: "head" as const };
  expect((await service.content({ ...input, path: "deleted.html" })).state).toBe("missing");
  expect((await service.content({ ...input, path: "binary.dat" })).state).toBe("binary");
  expect((await service.content({ ...input, path: "large.html" })).state).toBe("too_large");
});
it("rejects unknown files, repository escape paths and worktree symlinks", async () => {
  const { directory, service, base } = await setup();
  await put(directory, "known.md", "known");
  await commit(directory);
  await put(base, "private.md", "outside");
  await symlink(join(base, "private.md"), join(directory, "linked.md"));
  const input = { directory, repositoryId: ".", comparison: "head" as const };
  await expect(service.content({ ...input, path: "../private.md" })).rejects.toThrow();
  await expect(service.content({ ...input, path: "known.md" })).rejects.toThrow();
  expect((await service.content({ ...input, path: "linked.md" })).state).toBe("unsupported");
});
it("reveals deleted files at their nearest existing parent without shell interpretation", async () => {
  const { directory, service } = await setup();
  await put(directory, "folder/$(touch danger).md", "old");
  await commit(directory);
  await unlink(join(directory, "folder/$(touch danger).md"));
  const snapshot = await service.snapshot({ directory, comparison: "head" });
  expect(await revealTarget(snapshot.repositories[0], "folder/$(touch danger).md")).toEqual({
    target: join(snapshot.repositories[0].directory, "folder"),
    directory: true,
  });
  await expect(revealTarget(snapshot.repositories[0], "../outside")).rejects.toThrow();
});
