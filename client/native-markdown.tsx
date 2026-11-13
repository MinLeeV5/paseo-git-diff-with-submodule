import type { PluginTheme } from "@getpaseo/plugin";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Image, ScrollView, Text, type TextStyle, View } from "react-native";
import { useT } from "./i18n";
import { type MarkdownNode, markdownNodes } from "./markdown-model";
import { panelTokens } from "./theme";

export function NativeMarkdown({
  content,
  theme,
  fontSize,
  fontFamily,
  fontWeight,
  navigation,
  onNavigate,
}: {
  content: string;
  theme: PluginTheme;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: "400" | "500" | "600";
  navigation?: { fragment: string; request: number };
  onNavigate(href: string): void;
}) {
  const c = panelTokens(theme);
  const t = useT();
  const nodes = useMemo(() => markdownNodes(content, c.surface0), [content, c.surface0]);
  const scroll = useRef<ScrollView>(null);
  const headings = useRef(new Map<string, number>());
  const pendingAnchor = useRef<string | null>(null);
  const size = fontSize + 2;
  const textStyle: TextStyle = { color: c.foreground, fontSize: size, lineHeight: size * 1.7 };
  const codeStyle: TextStyle = { fontFamily: fontFamily ?? c.mono, fontWeight, fontSize };

  const revealAnchor = useCallback((fragment: string) => {
    pendingAnchor.current = fragment;
    const y = fragment ? headings.current.get(fragment) : 0;
    if (y !== undefined) {
      scroll.current?.scrollTo({ y, animated: false });
      pendingAnchor.current = null;
    }
  }, []);
  useEffect(() => {
    if (navigation) revealAnchor(navigation.fragment);
  }, [navigation, revealAnchor]);

  function inline(children: (MarkdownNode | string)[]): ReactNode {
    return children.map((node) => {
      if (typeof node === "string") return node;
      if (node.tag === "br") return "\n";
      if (node.tag === "input") return node.attributes.checked === "true" ? "☑" : "☐";
      if (node.tag === "img")
        return (
          <Text key={node.key} style={{ color: c.foregroundMuted }}>
            {node.attributes.alt || t("图片")}
          </Text>
        );
      const style: TextStyle =
        node.tag === "strong"
          ? { fontWeight: "700" }
          : node.tag === "em"
            ? { fontStyle: "italic" }
            : node.tag === "del"
              ? { textDecorationLine: "line-through" }
              : node.tag === "code"
                ? { ...codeStyle, backgroundColor: c.surface2 }
                : node.tag === "a"
                  ? { color: c.accent, textDecorationLine: "underline" }
                  : { color: /^color:(#[\da-f]+)$/i.exec(node.attributes.style ?? "")?.[1] };
      return (
        <Text
          key={node.key}
          style={style}
          accessibilityRole={node.tag === "a" ? "link" : undefined}
          onPress={node.tag === "a" ? () => onNavigate(node.attributes.href) : undefined}
        >
          {inline(node.children)}
        </Text>
      );
    });
  }

  function block(node: MarkdownNode): ReactNode {
    const children = node.children.filter(
      (child): child is MarkdownNode => typeof child !== "string",
    );
    if (/^h[1-6]$/.test(node.tag)) {
      const headingSize = size * [1.8, 1.45, 1.2, 1.1, 1, 1][Number(node.tag[1]) - 1];
      return (
        <View
          key={node.key}
          onLayout={(event) => {
            headings.current.set(node.attributes.id, event.nativeEvent.layout.y);
            if (pendingAnchor.current === node.attributes.id) revealAnchor(node.attributes.id);
          }}
          style={{ marginTop: 16, marginBottom: 8 }}
        >
          <Text
            accessibilityRole="header"
            selectable
            style={[
              textStyle,
              { fontSize: headingSize, lineHeight: headingSize * 1.3, fontWeight: "700" },
            ]}
          >
            {inline(node.children)}
          </Text>
        </View>
      );
    }
    if (node.tag === "hr")
      return (
        <View key={node.key} style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />
      );
    if (node.tag === "ul" || node.tag === "ol")
      return (
        <View key={node.key} style={{ marginVertical: 8, gap: 4 }}>
          {children.map((item, itemIndex) => (
            <View key={item.key} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={textStyle}>{node.tag === "ol" ? `${itemIndex + 1}.` : "•"}</Text>
              <Text selectable style={[textStyle, { flex: 1 }]}>
                {inline(item.children)}
              </Text>
            </View>
          ))}
        </View>
      );
    if (node.tag === "table") {
      const rows = children
        .flatMap((section) => section.children)
        .filter((row): row is MarkdownNode => typeof row !== "string");
      return (
        <ScrollView key={node.key} horizontal style={{ marginVertical: 8 }}>
          <View>
            {rows.map((row) => (
              <View key={row.key} style={{ flexDirection: "row" }}>
                {row.children.map((cell) =>
                  typeof cell === "string" ? null : (
                    <Text
                      key={cell.key}
                      selectable
                      style={[
                        textStyle,
                        {
                          width: 160,
                          padding: 8,
                          borderWidth: 1,
                          borderColor: c.border,
                          fontWeight: cell.tag === "th" ? "700" : "400",
                        },
                      ]}
                    >
                      {inline(cell.children)}
                    </Text>
                  ),
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
    if (node.tag === "pre")
      return (
        <ScrollView
          key={node.key}
          horizontal
          style={{
            marginVertical: 8,
            backgroundColor: c.surface1,
            borderWidth: 1,
            borderColor: c.border,
          }}
          contentContainerStyle={{ padding: 12 }}
        >
          <Text selectable style={[textStyle, codeStyle]}>
            {inline(node.children)}
          </Text>
        </ScrollView>
      );
    if (node.tag === "figure")
      return (
        <View key={node.key} style={{ marginVertical: 8 }}>
          <Text style={[textStyle, { color: c.foregroundMuted }]}>
            {t("Mermaid 图表源码（图形预览可在桌面或 Web 打开）")}
          </Text>
          {children
            .filter((child) => child.tag === "details")
            .flatMap((child) => child.children)
            .map((child) =>
              typeof child !== "string" && child.tag === "pre" ? block(child) : null,
            )}
        </View>
      );
    if (node.tag === "div") return <View key={node.key}>{children.map(block)}</View>;
    if (node.tag === "img")
      return (
        <Image
          key={node.key}
          accessibilityLabel={node.attributes.alt}
          source={{ uri: node.attributes.src }}
          resizeMode="contain"
          style={{ width: "100%", height: 180 }}
        />
      );
    return (
      <Text
        key={node.key}
        selectable
        style={[
          textStyle,
          { marginVertical: 6 },
          node.tag === "blockquote" && {
            color: c.foregroundMuted,
            borderLeftWidth: 3,
            borderLeftColor: c.border,
            paddingLeft: 12,
          },
        ]}
      >
        {inline(node.children)}
      </Text>
    );
  }

  return (
    <ScrollView
      ref={scroll}
      testID="native-markdown-preview"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20 }}
    >
      {nodes.map(block)}
    </ScrollView>
  );
}
