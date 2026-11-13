import type { ChangesSnapshot, ChangesView } from "./contracts";
import { type Translate, tZh } from "./i18n";

// Responses carry only changed repositories. The explicit order also removes
// repositories that disappeared, without briefly dropping unchanged siblings.
export function mergeChangesView(
  previous: ChangesSnapshot | null,
  view: ChangesView,
  t: Translate = tZh,
): ChangesSnapshot {
  const repositories = new Map(previous?.repositories.map((repo) => [repo.id, repo]));
  for (const repository of view.repositories) repositories.set(repository.id, repository);
  return {
    ...view,
    repositories: view.repositoryIds.map((id) => {
      const repository = repositories.get(id);
      if (!repository) throw new Error(t("仓库快照不完整，请刷新后重试。"));
      return repository;
    }),
  };
}
