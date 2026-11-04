import { entryKey, type FileEntry } from "./changes-model";

export type EditorTab = { key: string; repositoryId: string; path: string; label: string };
export type TabsState = { tabs: EditorTab[]; active: string | null };
export function openTab(state: TabsState, entry: FileEntry): TabsState {
  const key = entryKey(entry.repository.id, entry.file.path);
  if (state.active === key) return state;
  const exists = state.tabs.some((tab) => tab.key === key);
  return {
    tabs: exists
      ? state.tabs
      : [
          ...state.tabs,
          {
            key,
            repositoryId: entry.repository.id,
            path: entry.file.path,
            label: entry.file.path.split("/").at(-1) || entry.file.path,
          },
        ],
    active: key,
  };
}
export function closeTab(state: TabsState, key: string): TabsState {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.key !== key);
  return {
    tabs,
    active:
      state.active === key ? (tabs[Math.min(index, tabs.length - 1)]?.key ?? null) : state.active,
  };
}
