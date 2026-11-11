export const workspaceViews = [
  { value: "changes", label: "更改", icon: "fileDiff" },
  { value: "history", label: "提交图", icon: "branch" },
] as const;

export type WorkspaceView = (typeof workspaceViews)[number]["value"];
