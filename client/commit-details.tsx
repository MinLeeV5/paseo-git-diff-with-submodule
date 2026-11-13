import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { FileChange } from "../shared/contracts";
import type { CommitDetails } from "../shared/history-contracts";
import { buildFileRows, type FileRow, statusLabels } from "./changes-model";
import { setWebTitle, ToolButton } from "./controls";
import { DiffViewer } from "./diff-viewer";
import { useT } from "./i18n";
import { fileAppearance, Icon } from "./icons";
import { codeFont, panelTokens } from "./theme";
import { useCommitDiff } from "./use-history";
import type { usePanelSettings } from "./use-panel-settings";

export function HistoryNotice({
  theme,
  title,
  description,
  retry,
  busy = false,
}: {
  theme: PluginTheme;
  title: string;
  description?: string;
  retry?: () => void;
  busy?: boolean;
}) {
  const c = panelTokens(theme);
  const t = useT();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 90,
        padding: 20,
        gap: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityRole={retry ? "alert" : undefined}
    >
      {busy ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <Icon
          name={retry ? "warning" : "source"}
          color={retry ? c.statusWarning : c.foregroundMuted}
          size={26}
        />
      )}
      <Text style={{ color: c.foreground, fontSize: 13, textAlign: "center" }}>{title}</Text>
      {description ? (
        <Text
          selectable
          style={{
            color: c.foregroundMuted,
            fontSize: 12,
            lineHeight: 19,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          {description}
        </Text>
      ) : null}
      {retry ? (
        <ToolButton
          theme={theme}
          label={t("重试")}
          text={t("重试")}
          icon="refresh"
          onPress={retry}
        />
      ) : null}
    </View>
  );
}

function CommitFile({
  file,
  tree,
  depth,
  theme,
  onPress,
}: {
  file: FileChange;
  tree: boolean;
  depth: number;
  theme: PluginTheme;
  onPress(): void;
}) {
  const c = panelTokens(theme);
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const color =
    file.status === "added"
      ? c.statusSuccess
      : file.status === "deleted"
        ? c.statusDanger
        : c.statusWarning;
  return (
    <Pressable
      ref={(node) =>
        setWebTitle(
          node,
          `${file.oldPath ? `${file.oldPath} → ` : ""}${file.path}\n${t("{status} · 查看本次提交差异", { status: t(statusLabels[file.status].label) })}`,
        )
      }
      accessibilityRole="button"
      accessibilityLabel={t("查看提交文件 {path} 的差异", { path: file.path })}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: 30,
        paddingHorizontal: 12,
        paddingLeft: 12 + depth * 16,
        gap: 7,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: hovered ? c.surface2 : "transparent",
        borderWidth: 1,
        borderColor: focused ? c.accent : "transparent",
      }}
    >
      <Icon
        name={fileAppearance(file.path, c.foregroundMuted).icon}
        color={c.foregroundMuted}
        size={16}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: c.foreground,
          textDecorationLine: file.status === "deleted" ? "line-through" : "none",
        }}
      >
        {(tree ? file.path.split("/").at(-1) : file.path)?.replace(/[\n\r\t]/g, " ")}
      </Text>
      {file.binary ? (
        <Text style={{ fontSize: 10, color: c.foregroundMuted }}>{t("二进制")}</Text>
      ) : (
        <>
          <Text style={{ color: c.statusSuccess, fontSize: 10, fontFamily: c.mono }}>
            +{file.additions ?? "−"}
          </Text>
          <Text style={{ color: c.statusDanger, fontSize: 10, fontFamily: c.mono }}>
            −{file.deletions ?? "−"}
          </Text>
        </>
      )}
      <Text style={{ width: 12, color, fontSize: 11 }}>{statusLabels[file.status].badge}</Text>
      <Icon name="chevronRight" size={12} color={c.foregroundMuted} />
    </Pressable>
  );
}

function CommitFolder({
  item,
  collapsed,
  theme,
  onToggle,
}: {
  item: Extract<FileRow, { kind: "folder" }>;
  collapsed: boolean;
  theme: PluginTheme;
  onToggle(): void;
}) {
  const c = panelTokens(theme);
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={(node) => setWebTitle(node, item.path)}
      accessibilityRole="button"
      accessibilityLabel={t("{action}提交目录 {path}", {
        action: collapsed ? t("展开") : t("收起"),
        path: item.path,
      })}
      accessibilityState={{ expanded: !collapsed }}
      {...(Platform.OS === "web" ? { "aria-expanded": !collapsed } : {})}
      onPress={onToggle}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: 30,
        paddingHorizontal: 12,
        paddingLeft: 12 + item.depth * 16,
        gap: 7,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: hovered ? c.surface2 : "transparent",
        borderWidth: 1,
        borderColor: focused ? c.accent : "transparent",
      }}
    >
      <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={12} color={c.foregroundMuted} />
      <Icon name={collapsed ? "folder" : "folderOpen"} size={16} color={c.foregroundMuted} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: c.foreground, fontSize: 12 }}>
        {item.label.replace(/[\n\r\t]/g, " ")}
      </Text>
      <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{item.count}</Text>
    </Pressable>
  );
}

export function CommitSummary({
  commit,
  theme,
  compact,
  tree,
  onTreeChange,
  onOpenFile,
  onSelectParent,
}: {
  commit: CommitDetails;
  theme: PluginTheme;
  compact: boolean;
  tree: boolean;
  onTreeChange(tree: boolean): void;
  onOpenFile(path: string): void;
  onSelectParent(oid: string): void;
}) {
  const c = panelTokens(theme);
  const t = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const rows = useMemo(
    () => buildFileRows(commit.oid, commit.files, tree, collapsed),
    [commit.oid, commit.files, tree, collapsed],
  );
  const additions = commit.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = commit.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  return (
    <View style={{ flex: 1, minHeight: 0, flexDirection: compact ? "column" : "row" }}>
      <ScrollView
        style={{
          ...(compact ? { maxHeight: "45%" } : { width: "40%", maxWidth: 460 }),
          borderRightWidth: compact ? 0 : 1,
          borderBottomWidth: compact ? 1 : 0,
          borderColor: c.border,
        }}
        contentContainerStyle={{ padding: 14, gap: 10 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: c.surface2,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: c.foregroundMuted, fontSize: 11, fontWeight: "600" }}>
              {[...commit.author].slice(0, 2).join("").toLocaleUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text selectable style={{ color: c.foreground, fontSize: 12, fontWeight: "600" }}>
              {commit.author}
            </Text>
            <Text selectable style={{ color: c.foregroundMuted, fontSize: 10 }}>
              {commit.email}
            </Text>
          </View>
        </View>
        <Text selectable style={{ color: c.foregroundMuted, fontSize: 11 }}>
          {new Date(commit.date).toLocaleString()}
        </Text>
        <Text selectable style={{ color: c.foreground, fontSize: 12, lineHeight: 20 }}>
          {commit.message || t("（无提交说明）")}
        </Text>
        <Text selectable style={{ color: c.foregroundMuted, fontFamily: c.mono, fontSize: 10 }}>
          {commit.oid}
        </Text>
        {commit.parents.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <Text style={{ fontSize: 10, color: c.foregroundMuted }}>{t("父提交")}</Text>
            {commit.parents.map((parent) => (
              <ToolButton
                key={parent}
                theme={theme}
                label={t("查看父提交 {oid}", { oid: parent.slice(0, 8) })}
                text={parent.slice(0, 8)}
                onPress={() => onSelectParent(parent)}
              />
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 10, color: c.foregroundMuted }}>
            {t("初始提交 · 与空树比较")}
          </Text>
        )}
        {commit.committer !== commit.author || commit.committerEmail !== commit.email ? (
          <Text selectable style={{ color: c.foregroundMuted, fontSize: 10 }}>
            {t("提交者")} {commit.committer} &lt;{commit.committerEmail}&gt;
          </Text>
        ) : null}
      </ScrollView>
      <View testID="git-commit-files" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <View
          style={{
            minHeight: 34,
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 12,
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={{ color: c.foreground, fontSize: 11, fontWeight: "600" }}>
            {t("{count} 个文件", { count: commit.files.length })}
          </Text>
          <Text style={{ color: c.statusSuccess, fontFamily: c.mono, fontSize: 10 }}>
            +{additions}
          </Text>
          <Text style={{ color: c.statusDanger, fontFamily: c.mono, fontSize: 10 }}>
            −{deletions}
          </Text>
          <Text
            numberOfLines={1}
            style={{ flex: 1, textAlign: "right", color: c.foregroundMuted, fontSize: 10 }}
          >
            {commit.parents.length > 1 ? t("与第一父提交比较") : t("点击文件查看差异")}
          </Text>
          <ToolButton
            theme={theme}
            icon={tree ? "list" : "tree"}
            label={tree ? t("以列表显示提交文件") : t("以目录树显示提交文件")}
            onPress={() => onTreeChange(!tree)}
          />
        </View>
        {commit.files.length ? (
          <FlatList
            data={rows}
            extraData={tree}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) =>
              item.kind === "folder" ? (
                <CommitFolder
                  item={item}
                  collapsed={collapsed.has(item.key)}
                  theme={theme}
                  onToggle={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(item.key)) next.delete(item.key);
                      else next.add(item.key);
                      return next;
                    })
                  }
                />
              ) : (
                <CommitFile
                  file={item.file}
                  depth={item.depth}
                  tree={tree}
                  theme={theme}
                  onPress={() => onOpenFile(item.file.path)}
                />
              )
            }
            style={{ flex: 1, minHeight: 0 }}
            initialNumToRender={12}
            windowSize={5}
          />
        ) : (
          <HistoryNotice
            theme={theme}
            title={commit.diffMessage ? t("无法读取文件差异") : t("此提交没有文件变化")}
            description={commit.diffMessage ?? t("这是一个空提交。")}
          />
        )}
      </View>
    </View>
  );
}

export function CommitDiff({
  directory,
  repositoryId,
  commit,
  path,
  theme,
  width,
  preferences,
  onBack,
}: {
  directory: string;
  repositoryId: string;
  commit: CommitDetails;
  path: string;
  theme: PluginTheme;
  width: number;
  preferences: ReturnType<typeof usePanelSettings>;
  onBack(): void;
}) {
  const c = panelTokens(theme);
  const t = useT();
  const settings = preferences.values;
  const patch = useCommitDiff(
    directory,
    repositoryId,
    commit.oid,
    path,
    settings.context,
    settings.ignoreWhitespace,
  );
  const [navigation, setNavigation] = useState({ index: 0, request: 0 });
  const count = patch.data?.hunks.length ?? 0;
  const mode = width < 650 ? "unified" : settings.mode;
  const moveHunk = (delta: number) =>
    setNavigation((previous) => ({
      index: (previous.index + delta + count) % count,
      request: previous.request + 1,
    }));
  return (
    <View testID="git-commit-diff" style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          minHeight: 32,
          paddingHorizontal: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <ToolButton theme={theme} icon="back" label={t("返回提交详情（Esc）")} onPress={onBack} />
        <Icon
          name={fileAppearance(path, c.foregroundMuted).icon}
          color={c.foregroundMuted}
          size={14}
        />
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: c.foreground, fontSize: 11 }}>
          {path}
        </Text>
        <ToolButton
          theme={theme}
          icon={mode === "split" ? "split" : "unified"}
          label={t("切换历史差异布局")}
          disabled={width < 650}
          onPress={() =>
            preferences.update({ mode: settings.mode === "split" ? "unified" : "split" })
          }
        />
        <ToolButton
          theme={theme}
          icon="up"
          label={t("上一个历史差异块")}
          disabled={!count}
          onPress={() => moveHunk(-1)}
        />
        <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>
          {count ? Math.min(navigation.index + 1, count) : 0}/{count}
        </Text>
        <ToolButton
          theme={theme}
          icon="down"
          label={t("下一个历史差异块")}
          disabled={!count}
          onPress={() => moveHunk(1)}
        />
      </View>
      {patch.error ? (
        <HistoryNotice
          theme={theme}
          title={t("读取历史差异失败")}
          description={patch.error}
          retry={patch.retry}
        />
      ) : patch.data ? (
        <DiffViewer
          diff={patch.data}
          theme={theme}
          mode={mode}
          wrap={settings.wrap}
          navigation={navigation}
          onHunkChange={(index) => setNavigation((previous) => ({ ...previous, index }))}
          from={commit.parents[0]?.slice(0, 8) ?? t("空树")}
          to={commit.oid.slice(0, 8)}
          syntaxHighlight={settings.syntaxHighlight}
          fontSize={settings.fontSize}
          fontFamily={codeFont(settings)}
          fontWeight={settings.fontWeight}
          splitRatio={settings.splitRatio}
          onSplitRatioChange={(splitRatio) => preferences.update({ splitRatio })}
          onSplitRatioCommit={preferences.flush}
          tabSize={settings.tabSize}
          lineNumbers={settings.lineNumbers}
        />
      ) : (
        <HistoryNotice theme={theme} busy title={t("正在读取历史差异…")} />
      )}
    </View>
  );
}
