import { join } from "node:path";
import { mapLimit } from "../server/concurrency";
import { addModule, command, commit, type fixture, put } from "../tests/fixtures";

export type Corpus = {
  name: string;
  label: string;
  directory: string;
  repositories: string[];
  paths: string[];
  nativePaths: string[];
  additions: number;
  deletions: number;
  nativeAdditions: number;
  nativeDeletions: number;
  allFiles: boolean;
};

export async function createPerformanceCorpora(
  f: Awaited<ReturnType<typeof fixture>>,
  options: { uniqueTracked?: boolean } = {},
) {
  const baseline = (lines: number) =>
    `${Array.from(
      { length: lines },
      (_, i) => `export const value${i} = { count: ${i}, label: "benchmark" };`,
    ).join("\n")}\n`;
  const modified = (text: string, dense: boolean) =>
    dense
      ? text
          .split("\n")
          .map((line, i) =>
            i % 30 === 15 ? line.replace(`count: ${i}`, `count: ${i + 100000}`) : line,
          )
          .join("\n")
      : text.replace("count: 15,", "count: 150000,");
  async function makeCorpus(
    name: string,
    label: string,
    tracked: number,
    untracked = 0,
    lines = 100,
    dense = false,
    unique = false,
  ): Promise<Corpus> {
    const directory = await f.repo(name);
    const paths = Array.from(
      { length: tracked },
      (_, i) => `src/group-${i % 20}/file-${String(i).padStart(4, "0")}.ts`,
    );
    const text = baseline(lines);
    const content = (path: string) => (unique ? `// ${path}\n${text}` : text);
    await mapLimit(paths, 16, (path) => put(directory, path, content(path)));
    await commit(directory);
    await mapLimit(paths, 16, (path) => put(directory, path, modified(content(path), dense)));
    for (let i = 0; i < untracked; i++) {
      const path = `new/file-${String(i).padStart(4, "0")}.ts`;
      await put(directory, path, baseline(30));
      paths.push(path);
    }
    paths.sort();
    const perFile = dense ? Math.floor(lines / 30) : 1;
    return {
      name,
      label,
      directory,
      repositories: ["."],
      paths,
      nativePaths: paths,
      additions: tracked * perFile + untracked * 30,
      deletions: tracked * perFile,
      nativeAdditions: tracked * perFile + untracked * 30,
      nativeDeletions: tracked * perFile,
      allFiles: true,
    };
  }
  async function makeModules(): Promise<Corpus> {
    const source = await f.repo("module-source");
    const paths = Array.from({ length: 20 }, (_, i) => `src/file-${String(i).padStart(4, "0")}.ts`);
    const text = baseline(100);
    await mapLimit(paths, 8, (path) => put(source, path, text));
    await commit(source);
    const directory = await f.repo("modules-10");
    await mapLimit(paths, 8, (path) => put(directory, path, text));
    await commit(directory);
    const repositories = ["."];
    for (let i = 0; i < 8; i++) {
      const path = `modules/module-${i}`;
      await addModule(directory, source, path);
      await command(directory, "config", "-f", ".gitmodules", `submodule.${path}.ignore`, "all");
      repositories.push(path);
    }
    const parent = join(directory, repositories[1]);
    await addModule(parent, source, "nested/leaf");
    await command(parent, "config", "-f", ".gitmodules", "submodule.nested/leaf.ignore", "all");
    await commit(parent);
    repositories.push(`${repositories[1]}/nested/leaf`);
    // Explicit staging preserves the nested gitlink despite ignore=all.
    await command(directory, "-c", "diff.ignoreSubmodules=none", "add", "-A");
    await commit(directory);
    for (const repository of repositories)
      await mapLimit(paths, 8, (path) =>
        put(join(directory, repository), path, modified(text, false)),
      );
    return {
      name: "modules-10",
      label: "主仓 + 8 个子模块 + 1 个嵌套子模块，各 20 个变更文件",
      directory,
      repositories,
      paths: repositories
        .flatMap((repo) => paths.map((path) => (repo === "." ? path : `${repo}/${path}`)))
        .sort(),
      nativePaths: paths,
      additions: 200,
      deletions: 200,
      nativeAdditions: 20,
      nativeDeletions: 20,
      allFiles: false,
    };
  }
  const corpora = [
    await makeCorpus("tracked-50", "50 个已跟踪文件，每个 100 行，修改 1 行", 50),
    await makeCorpus("tracked-500", "500 个已跟踪文件，每个 100 行，修改 1 行", 500),
    await makeCorpus("tracked-1000", "1000 个已跟踪文件，每个 100 行，修改 1 行", 1000),
    await makeCorpus("mixed-1000", "500 个已跟踪修改 + 500 个未跟踪文件（各 30 行）", 500, 500),
    await makeCorpus(
      "large-file",
      "1 个 12000 行文件，每 30 行修改 1 行，共 400 处",
      1,
      0,
      12000,
      true,
    ),
    await makeModules(),
  ];
  if (options.uniqueTracked)
    corpora.push(
      await makeCorpus(
        "unique-tracked-1000",
        "1000 个不同 HEAD 对象，每个 101 行，修改 1 行",
        1000,
        0,
        100,
        false,
        true,
      ),
    );
  return corpora;
}
