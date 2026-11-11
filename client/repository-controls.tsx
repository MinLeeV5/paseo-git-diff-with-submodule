import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import type { RepositorySnapshot } from "../shared/contracts";
import type { RepositoryAction } from "../shared/repository-contracts";
import { InputField, ToolButton } from "./controls";
import { Icon } from "./icons";
import { panelTokens } from "./theme";
import type { RepositoryOperationState } from "./use-repository-actions";

export const RepositoryControls = memo(function RepositoryControls({
  directory,
  repository,
  draft,
  state,
  theme,
  onDraft,
  onRun,
  onGenerate,
  onClear,
}: {
  directory: string;
  repository: RepositorySnapshot;
  draft: string;
  state?: RepositoryOperationState;
  theme: PluginTheme;
  onDraft(id: string, value: string): void;
  onRun(input: RepositoryAction): void;
  onGenerate(id: string, scope: "staged" | "all"): void;
  onClear(id: string): void;
}) {
  const c = panelTokens(theme);
  const [focused, setFocused] = useState(false);
  const id = repository.id;
  const label = repository.relativePath || "主仓库";
  const busy = Boolean(state?.busy);
  const staged = repository.stagedCount;
  const unstaged = repository.unstagedCount;
  const blocked =
    busy || !draft.trim() || Boolean(repository.conflictCount) || (!staged && !unstaged);
  const submit = (stageAll: boolean) => {
    if (blocked) return;
    onRun({
      directory,
      repositoryId: id,
      action: "commit",
      message: draft,
      stageAll,
      expectedHead: repository.head,
    });
  };
  return (
    <View
      testID={`git-repository-controls-${id}`}
      style={{ padding: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border }}
    >
      <InputField
        theme={theme}
        accessibilityLabel={`${label} 提交信息`}
        placeholder={Platform.OS === "web" ? "提交信息（⌘ / Ctrl+Enter）" : "提交信息"}
        value={draft}
        onChangeText={(value) => onDraft(id, value)}
        editable={!busy || state?.busy === "generate"}
        blurOnSubmit={false}
        onKeyPress={(event) => {
          const key = event.nativeEvent as {
            key: string;
            ctrlKey?: boolean;
            metaKey?: boolean;
            isComposing?: boolean;
            keyCode?: number;
          };
          if (
            Platform.OS === "web" &&
            key.key === "Enter" &&
            (key.ctrlKey || key.metaKey) &&
            !key.isComposing &&
            key.keyCode !== 229
          ) {
            event.preventDefault();
            submit(!staged);
          }
        }}
      >
        <ToolButton
          theme={theme}
          icon="generate"
          label={`为${label}自动生成${staged ? "已暂存" : "全部更改"}的提交信息`}
          busy={state?.busy === "generate"}
          disabled={busy || (!staged && !unstaged) || Boolean(repository.conflictCount)}
          onPress={() => onGenerate(id, staged ? "staged" : "all")}
        />
      </InputField>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <ToolButton
          theme={theme}
          icon="stage"
          label={`暂存${label}全部更改`}
          disabled={busy || !unstaged}
          onPress={() => onRun({ directory, repositoryId: id, action: "stage" })}
        />
        <ToolButton
          theme={theme}
          icon="unstage"
          label={`取消${label}全部暂存`}
          disabled={busy || !staged}
          onPress={() => onRun({ directory, repositoryId: id, action: "unstage" })}
        />
        <View style={{ flex: 1 }} />
        <ToolButton
          theme={theme}
          icon="pull"
          text={repository.behindCount === null ? undefined : String(repository.behindCount)}
          label={`拉取${label}${repository.behindCount === null ? "" : ` · ${repository.behindCount} 个待拉取提交`}`}
          busy={state?.busy === "pull"}
          disabled={busy || !repository.branch || !repository.head}
          onPress={() => onRun({ directory, repositoryId: id, action: "pull" })}
        />
        <ToolButton
          theme={theme}
          icon="push"
          text={repository.aheadCount === null ? undefined : String(repository.aheadCount)}
          label={`推送${label}${repository.aheadCount === null ? "" : ` · ${repository.aheadCount} 个待推送提交`}`}
          busy={state?.busy === "push"}
          disabled={busy || !repository.branch || !repository.head}
          onPress={() => onRun({ directory, repositoryId: id, action: "push" })}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${staged ? "提交已暂存更改" : "暂存并提交全部更改"} · ${label}`}
          disabled={blocked}
          accessibilityState={{ disabled: blocked, busy }}
          onPress={() => submit(!staged)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            minHeight: 30,
            padding: 6,
            gap: 6,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            backgroundColor: blocked ? c.surface1 : c.accent,
            opacity: busy ? 0.65 : 1,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: focused ? c.foreground : blocked ? c.border : c.accent,
          }}
        >
          {state?.busy === "commit" ? (
            <ActivityIndicator color={c.accentForeground} size="small" />
          ) : (
            <Icon name="check" color={blocked ? c.foregroundMuted : c.accentForeground} size={14} />
          )}
          <Text style={{ color: blocked ? c.foregroundMuted : c.accentForeground, fontSize: 12 }}>
            {staged ? `提交已暂存 (${staged})` : "暂存并提交全部"}
          </Text>
        </Pressable>
        {staged && unstaged ? (
          <ToolButton
            theme={theme}
            text="全部"
            label={`暂存并提交全部更改 · ${label}`}
            disabled={blocked}
            onPress={() => submit(true)}
          />
        ) : null}
      </View>
      <View style={{ gap: 3 }}>
        <Text
          style={{
            color: repository.conflictCount ? c.statusDanger : c.foregroundMuted,
            fontSize: 10,
            lineHeight: 14,
          }}
        >
          {repository.conflictCount
            ? `${repository.conflictCount} 个冲突 · 请解决后暂存`
            : `已暂存 ${staged} · 未暂存 ${unstaged}`}
        </Text>
        {repository.upstream ? (
          <Text
            numberOfLines={1}
            style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 14 }}
          >
            {repository.upstream}
          </Text>
        ) : null}
      </View>
      {busy && state?.busy !== "generate" ? (
        <Text accessibilityLiveRegion="polite" style={{ color: c.foregroundMuted, fontSize: 11 }}>
          {
            {
              commit: "正在提交…",
              stage: "正在暂存…",
              unstage: "正在取消暂存…",
              pull: "正在拉取…",
              push: "正在推送…",
              generate: "正在生成提交信息…",
            }[state?.busy ?? "generate"]
          }
        </Text>
      ) : null}
      {state?.error && state.message ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ flexDirection: "row", gap: 4, alignItems: "flex-start" }}
        >
          <Text
            selectable
            style={{
              flex: 1,
              color: c.statusDanger,
              fontSize: 11,
              lineHeight: 17,
            }}
          >
            {state.message}
          </Text>
          <ToolButton
            theme={theme}
            icon="close"
            label={`关闭${label}操作结果`}
            onPress={() => onClear(id)}
          />
        </View>
      ) : null}
    </View>
  );
});
