import type { PluginTheme } from "@getpaseo/plugin";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, type View } from "react-native";
import { Icon, type IconName } from "./icons";
import { panelTokens } from "./theme";

// RN Web filters the HTML title prop. Apply it to the resolved native element so
// icon tooltips remain available without portals, clipping, or layout changes.
export function setWebTitle(node: unknown, title: string) {
  if (Platform.OS === "web")
    (node as { setAttribute?(name: string, value: string): void } | null)?.setAttribute?.(
      "title",
      title,
    );
}

export function ToolButton({
  label,
  icon,
  onPress,
  theme,
  active,
  disabled = false,
  busy = false,
  text,
}: {
  label: string;
  icon?: IconName;
  onPress(): void;
  theme: PluginTheme;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  text?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = panelTokens(theme);
  const color = active ? colors.accent : colors.foregroundMuted;
  const buttonRef = useRef<View | null>(null);
  const titleRef = useCallback(
    (node: View | null) => {
      buttonRef.current = node;
      setWebTitle(node, label);
    },
    [label],
  );
  return (
    <Pressable
      ref={titleRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={label}
      accessibilityState={{
        ...(Platform.OS !== "web" && active !== undefined ? { selected: active } : {}),
        disabled: disabled || busy,
        busy,
      }}
      {...(Platform.OS === "web"
        ? { title: label, ...(active !== undefined ? { "aria-pressed": active } : {}) }
        : {})}
      disabled={disabled || busy}
      onPress={() => {
        if (Platform.OS === "web") buttonRef.current?.focus();
        onPress();
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minWidth: 28,
        minHeight: 28,
        paddingHorizontal: text ? 7 : 5,
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 3,
        borderWidth: 1,
        borderColor: focused ? colors.accent : "transparent",
        backgroundColor: active ? colors.selection : hovered ? colors.surface2 : "transparent",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator size={14} color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} size={16} />
      ) : null}
      {text ? (
        <Text numberOfLines={1} style={{ color: active ? colors.foreground : color, fontSize: 11 }}>
          {text}
        </Text>
      ) : null}
    </Pressable>
  );
}
