import type { Comparison, FileChange, RepositorySnapshot } from "../shared/contracts";

export const statusLabels: Record<FileChange["status"], { badge: string; label: string }> = {
  added: { badge: "A", label: "新增" },
  modified: { badge: "M", label: "修改" },
  deleted: { badge: "D", label: "删除" },
  renamed: { badge: "R", label: "重命名" },
  copied: { badge: "C", label: "复制" },
  conflicted: { badge: "U", label: "冲突" },
  typechanged: { badge: "T", label: "类型变化" },
  untracked: { badge: "U", label: "未跟踪" },
};
export const comparisons: {
  value: Comparison;
  label: string;
  from: string;
  to: string;
  group: string;
}[] = [
  { value: "head", label: "全部", from: "HEAD", to: "工作目录", group: "未提交的更改" },
  { value: "staged", label: "已暂存", from: "HEAD", to: "暂存区", group: "已暂存的更改" },
  { value: "unstaged", label: "未暂存", from: "暂存区", to: "工作目录", group: "更改" },
];
export type FileEntry = { repository: RepositorySnapshot; file: FileChange };
export type FileRow =
  | {
      key: string;
      kind: "folder";
      path: string;
      label: string;
      depth: number;
      count: number;
    }
  | { key: string; kind: "file"; file: FileChange; depth: number };
export type ChangeRow =
  | {
      key: string;
      kind: "repository" | "notice" | "actions";
      repository: RepositorySnapshot;
      count: number;
    }
  | (FileRow & { repository: RepositorySnapshot });

export function entryKey(repositoryId: string, path: string) {
  return JSON.stringify([repositoryId, path]);
}
export function folderKey(repositoryId: string, path: string) {
  return `folder:${entryKey(repositoryId, path)}`;
}

export function repositoryName(repository: Pick<RepositorySnapshot, "directory" | "relativePath">) {
  const path = (repository.relativePath || repository.directory).replace(/[\\/]+$/, "");
  return path.split(/[\\/]/).at(-1) || path;
}

export function resolveCollapsedRows(
  repositories: readonly RepositorySnapshot[],
  overrides: ReadonlyMap<string, boolean>,
): Set<string> {
  const collapsed = new Set<string>();
  if (repositories.length > 1)
    for (const repository of repositories)
      if (repository.state === "ready" && repository.files.length === 0)
        collapsed.add(`repo:${repository.id}`);
  for (const [key, value] of overrides) {
    if (value) collapsed.add(key);
    else collapsed.delete(key);
  }
  return collapsed;
}

export function buildChangeRows(
  repositories: RepositorySnapshot[],
  filter: string,
  tree: boolean,
  collapsed: ReadonlySet<string>,
): ChangeRow[] {
  const query = filter.trim().toLocaleLowerCase();
  const rows: ChangeRow[] = [];
  for (const repository of repositories) {
    const repositoryMatches = repository.relativePath.toLocaleLowerCase().includes(query);
    const files =
      query && !repositoryMatches
        ? repository.files.filter((file) =>
            `${file.path}\n${file.oldPath ?? ""}`.toLocaleLowerCase().includes(query),
          )
        : repository.files;
    if (query && !files.length && !repositoryMatches) continue;
    rows.push({
      key: `repo:${repository.id}`,
      kind: "repository",
      repository,
      count: files.length,
    });
    if (!query && collapsed.has(`repo:${repository.id}`)) continue;
    if (repository.state === "ready")
      rows.push({ key: `actions:${repository.id}`, kind: "actions", repository, count: 0 });
    if (!files.length || repository.state !== "ready") {
      rows.push({ key: `notice:${repository.id}`, kind: "notice", repository, count: 0 });
      continue;
    }
    rows.push(
      ...buildFileRows(repository.id, files, tree, collapsed, Boolean(query)).map((row) => ({
        ...row,
        repository,
      })),
    );
  }
  return rows;
}

export function buildFileRows(
  scope: string,
  files: readonly FileChange[],
  tree: boolean,
  collapsed: ReadonlySet<string>,
  expandAll = false,
): FileRow[] {
  if (!tree)
    return files.map((file) => ({
      key: entryKey(scope, file.path),
      kind: "file",
      file,
      depth: 0,
    }));
  type Folder = {
    path: string;
    folders: Map<string, Folder>;
    files: FileChange[];
    count: number;
  };
  const root: Folder = { path: "", folders: new Map(), files: [], count: files.length };
  for (const file of files) {
    let folder = root;
    const segments = file.path.split("/").slice(0, -1);
    for (const segment of segments) {
      let child = folder.folders.get(segment);
      if (!child) {
        child = {
          path: folder.path ? `${folder.path}/${segment}` : segment,
          folders: new Map(),
          files: [],
          count: 0,
        };
        folder.folders.set(segment, child);
      }
      child.count++;
      folder = child;
    }
    folder.files.push(file);
  }
  const rows: FileRow[] = [];
  function visit(folder: Folder, depth: number) {
    for (const [label, child] of [...folder.folders].sort(([a], [b]) => a.localeCompare(b))) {
      const key = folderKey(scope, child.path);
      rows.push({ key, kind: "folder", path: child.path, label, depth, count: child.count });
      if (expandAll || !collapsed.has(key)) visit(child, depth + 1);
    }
    for (const file of folder.files)
      rows.push({ key: entryKey(scope, file.path), kind: "file", file, depth });
  }
  visit(root, 0);
  return rows;
}
