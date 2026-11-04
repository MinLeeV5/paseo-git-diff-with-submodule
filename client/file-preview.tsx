import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, Text, View } from "react-native";
import { type FileContent, fileContentRpc, mermaidRuntimeRpc } from "../shared/contracts";
import { ToolButton } from "./controls";
import { Icon } from "./icons";
import { hasMermaid } from "./mermaid-preview";
import { type PreviewKind, previewDocument } from "./preview-model";
import { panelTokens } from "./theme";

let renderer: Promise<string> | null = null;

export function FilePreview({
  directory,
  repositoryId,
  path,
  version,
  comparison,
  kind,
  theme,
  fontSize,
  fontFamily,
  fontWeight,
}: {
  directory: string;
  repositoryId: string;
  path: string;
  version: string;
  comparison: "head" | "staged" | "unstaged";
  kind: PreviewKind;
  theme: PluginTheme;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: "400" | "500" | "600";
}) {
  const call = useRpc(fileContentRpc);
  const loadRenderer = useRpc(mermaidRuntimeRpc);
  const c = panelTokens(theme);
  const [attempt, setAttempt] = useState(0);
  const [runtime, setRuntime] = useState("");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [state, setState] = useState<{
    key: string;
    data: FileContent | null;
    error: string | null;
  }>({ key: "", data: null, error: null });
  // Keep a small cache local to the mounted preview. Closing/switching releases it.
  const cache = useRef<{ key: string; data: FileContent } | null>(null);
  const key = JSON.stringify([directory, repositoryId, path, version, comparison, attempt]);
  useEffect(() => {
    let stopped = false;
    if (cache.current?.key === key) {
      setState({ key, data: cache.current.data, error: null });
      return;
    }
    setState({ key, data: null, error: null });
    void call({ directory, repositoryId, path, comparison }).then(
      (data) => {
        if (!stopped) {
          cache.current = { key, data };
          setState({ key, data, error: null });
        }
      },
      (error: unknown) => {
        if (!stopped)
          setState({
            key,
            data: null,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      stopped = true;
    };
  }, [call, key, directory, repositoryId, path, comparison]);
  const current = state.key === key ? state : { data: null, error: null };
  const diagrams =
    Platform.OS === "web" &&
    kind === "markdown" &&
    current.data?.state === "text" &&
    hasMermaid(current.data.content);
  useEffect(() => {
    if (!diagrams || runtime || runtimeError) return;
    let stopped = false;
    renderer ??= loadRenderer({})
      .then((result) => result.gzip)
      .catch((error) => {
        renderer = null;
        throw error;
      });
    void renderer?.then(
      (source) => {
        if (!stopped) setRuntime(source);
      },
      (error: unknown) => {
        if (!stopped) setRuntimeError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      stopped = true;
    };
  }, [diagrams, loadRenderer, runtime, runtimeError]);
  const document = useMemo(
    () =>
      current.data && ["text", "image"].includes(current.data.state)
        ? previewDocument(
            current.data.content,
            kind,
            {
              background: c.surface0,
              foreground: c.foreground,
              muted: c.foregroundMuted,
              border: c.border,
              accent: c.accent,
            },
            fontSize,
            {
              fontFamily,
              fontWeight,
              ...(diagrams && runtime
                ? {
                    mermaid: {
                      gzip: runtime,
                      nonce: `git-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
                    },
                  }
                : {}),
            },
          )
        : "",
    [
      current.data,
      kind,
      c.surface0,
      c.foreground,
      c.foregroundMuted,
      c.border,
      c.accent,
      fontSize,
      fontFamily,
      fontWeight,
      diagrams,
      runtime,
    ],
  );
  if (current.error || (current.data && !["text", "image"].includes(current.data.state)))
    return (
      <View
        style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center", gap: 12 }}
      >
        <Icon name="info" size={28} color={c.foregroundMuted} />
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
          {current.error ?? current.data?.message}
        </Text>
        {current.error ? (
          <ToolButton
            theme={theme}
            label="重试读取预览"
            text="重试"
            icon="refresh"
            onPress={() => setAttempt((value) => value + 1)}
          />
        ) : null}
      </View>
    );
  if (!current.data)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  if (Platform.OS === "web")
    return (
      <View style={{ flex: 1, minHeight: 0 }}>
        {diagrams && runtimeError ? (
          <View
            accessibilityRole="alert"
            style={{ padding: 8, gap: 5, backgroundColor: c.surface1 }}
          >
            <Text style={{ color: c.statusDanger, fontSize: 12 }}>
              Mermaid 加载失败：{runtimeError}
            </Text>
            <ToolButton
              theme={theme}
              icon="refresh"
              label="重试加载 Mermaid"
              text="重试"
              onPress={() => setRuntimeError(null)}
            />
          </View>
        ) : null}
        {createElement("iframe", {
          key: `${key}:${Boolean(diagrams && runtime)}`,
          title: `${path} 文件预览`,
          "data-testid": "file-preview",
          srcDoc:
            diagrams && runtimeError
              ? document.replaceAll("正在加载 Mermaid 图表…", "图表引擎加载失败，可展开查看源码。")
              : document,
          sandbox: diagrams && runtime ? "allow-scripts" : "",
          referrerPolicy: "no-referrer",
          style: {
            flex: 1,
            width: "100%",
            minHeight: 0,
            border: 0,
            background: c.surface0,
            colorScheme: "normal",
          },
        })}
      </View>
    );
  if (current.data.state === "image")
    return (
      <Image
        accessibilityLabel={`${path} 文件预览`}
        source={{ uri: current.data.content }}
        resizeMode="contain"
        style={{ flex: 1 }}
      />
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text selectable style={{ color: c.foreground, fontSize, lineHeight: fontSize * 1.7 }}>
        {kind === "html" ? "HTML 预览请在桌面或 Web 面板中打开。\n\n" : ""}
        {current.data.content}
      </Text>
    </ScrollView>
  );
}
