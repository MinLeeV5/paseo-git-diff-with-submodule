import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import type { RepositorySnapshot } from "../shared/contracts";
import type { RepositoryAction } from "../shared/repository-contracts";
import { InputField, ToolButton } from "./controls";
import { useT } from "./i18n";
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
  const t = useT();
  const [focused, setFocused] = useState(false);
  const id = repository.id;
  const label = repository.relativePath || t("主仓库");
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
        accessibilityLabel={t("{label} 提交信息", { label })}
        placeholder={Platform.OS === "web" ? t("提交信息（⌘ / Ctrl+Enter）") : t("提交信息")}
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
          label={t("为{label}自动生成{scope}的提交信息", {
            label,
            scope: staged ? t("已暂存") : t("全部更改"),
          })}
          busy={state?.busy === "generate"}
          disabled={busy || (!staged && !unstaged) || Boolean(repository.conflictCount)}
          onPress={() => onGenerate(id, staged ? "staged" : "all")}
        />
      </InputField>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <ToolButton
          theme={theme}
          icon="stage"
          label={t("暂存{label}全部更改", { label })}
          disabled={busy || !unstaged}
          onPress={() => onRun({ directory, repositoryId: id, action: "stage" })}
        />
        <ToolButton
          theme={theme}
          icon="unstage"
          label={t("取消{label}全部暂存", { label })}
          disabled={busy || !staged}
          onPress={() => onRun({ directory, repositoryId: id, action: "unstage" })}
        />
        <View style={{ flex: 1 }} />
        <ToolButton
          theme={theme}
          icon="pull"
          text={repository.behindCount === null ? undefined : String(repository.behindCount)}
          label={
            t("拉取{label}", { label }) +
            (repository.behindCount === null
              ? ""
              : t(" · {count} 个待拉取提交", { count: repository.behindCount }))
          }
          busy={state?.busy === "pull"}
          disabled={busy || !repository.branch || !repository.head}
          onPress={() => onRun({ directory, repositoryId: id, action: "pull" })}
        />
        <ToolButton
          theme={theme}
          icon="push"
          text={repository.aheadCount === null ? undefined : String(repository.aheadCount)}
          label={
            t("推送{label}", { label }) +
            (repository.aheadCount === null
              ? ""
              : t(" · {count} 个待推送提交", { count: repository.aheadCount }))
          }
          busy={state?.busy === "push"}
          disabled={busy || !repository.branch || !repository.head}
          onPress={() => onRun({ directory, repositoryId: id, action: "push" })}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("{action} · {label}", {
            action: staged ? t("提交已暂存更改") : t("暂存并提交全部更改"),
            label,
          })}
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
            {staged ? t("提交已暂存 ({count})", { count: staged }) : t("暂存并提交全部")}
          </Text>
        </Pressable>
        {staged && unstaged ? (
          <ToolButton
            theme={theme}
            text={t("全部")}
            label={t("{action} · {label}", { action: t("暂存并提交全部更改"), label })}
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
            ? t("{count} 个冲突 · 请解决后暂存", { count: repository.conflictCount })
            : t("已暂存 {staged} · 未暂存 {unstaged}", { staged, unstaged })}
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
              commit: t("正在提交…"),
              stage: t("正在暂存…"),
              unstage: t("正在取消暂存…"),
              pull: t("正在拉取…"),
              push: t("正在推送…"),
              generate: t("正在生成提交信息…"),
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
            label={t("关闭{label}操作结果", { label })}
            onPress={() => onClear(id)}
          />
        </View>
      ) : null}
    </View>
  );
});
