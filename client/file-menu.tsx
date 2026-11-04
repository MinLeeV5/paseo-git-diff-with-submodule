import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Icon } from "./icons";
import { panelTokens } from "./theme";

export type FileMenuTarget = { repositoryId: string; path: string; x: number; y: number };
export function FileMenu({
  target,
  theme,
  revealLabel,
  canReveal,
  canPreview,
  onReveal,
  onPreview,
  onClose,
}: {
  target: FileMenuTarget;
  theme: PluginTheme;
  revealLabel: string;
  canReveal: boolean;
  canPreview: boolean;
  onReveal(): void;
  onPreview(): void;
  onClose(): void;
}) {
  const c = panelTokens(theme);
  const { width, height } = useWindowDimensions();
  const first = useRef<View>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const menuWidth = Math.min(252, width - 16);
  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityLabel="关闭文件菜单"
          onPress={onClose}
          style={{ position: "absolute", inset: 0 }}
        />
        <View
          accessibilityRole="menu"
          accessibilityLabel={`${target.path} 文件操作`}
          {...(Platform.OS === "web"
            ? {
                onKeyDown: (event: { key: string }) => {
                  if (event.key === "Escape") onClose();
                },
              }
            : {})}
          style={{
            position: "absolute",
            left: Math.max(8, Math.min(target.x, width - menuWidth - 8)),
            top: Math.max(8, Math.min(target.y, height - (canPreview ? 125 : 90))),
            width: menuWidth,
            padding: 4,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surface1,
            boxShadow: "0 4px 18px #00000044",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: c.foregroundMuted,
              fontSize: 10,
              paddingHorizontal: 8,
              paddingVertical: 6,
            }}
          >
            {target.path}
          </Text>
          <Pressable
            ref={first}
            accessibilityRole="menuitem"
            accessibilityLabel={revealLabel}
            disabled={!canReveal}
            accessibilityState={{ disabled: !canReveal }}
            onPress={onReveal}
            onHoverIn={() => setHovered("reveal")}
            onHoverOut={() => setHovered(null)}
            onFocus={() => setHovered("reveal")}
            onBlur={() => setHovered(null)}
            style={{
              minHeight: 32,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              paddingHorizontal: 8,
              borderRadius: 3,
              opacity: canReveal ? 1 : 0.45,
              backgroundColor: hovered === "reveal" ? c.selection : "transparent",
            }}
          >
            <Icon name="reveal" color={c.foregroundMuted} size={15} />
            <Text style={{ color: c.foreground, fontSize: 12 }}>{revealLabel}</Text>
          </Pressable>
          {canPreview ? (
            <Pressable
              accessibilityRole="menuitem"
              accessibilityLabel="打开文件预览"
              onPress={onPreview}
              onHoverIn={() => setHovered("preview")}
              onHoverOut={() => setHovered(null)}
              onFocus={() => setHovered("preview")}
              onBlur={() => setHovered(null)}
              style={{
                minHeight: 32,
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                paddingHorizontal: 8,
                borderRadius: 3,
                backgroundColor: hovered === "preview" ? c.selection : "transparent",
              }}
            >
              <Icon name="preview" color={c.foregroundMuted} size={15} />
              <Text style={{ color: c.foreground, fontSize: 12 }}>打开预览</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
