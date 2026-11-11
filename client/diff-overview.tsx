import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { setWebTitle } from "./controls";
import {
  type DiffChangeRange,
  type DiffRowLayout,
  diffOverviewMarkers,
} from "./diff-overview-model";
import { panelTokens } from "./theme";

export const DIFF_OVERVIEW_WIDTH = 18;

export function DiffOverview({
  ranges,
  sizes,
  theme,
  onSelect,
}: {
  ranges: DiffChangeRange[];
  sizes: DiffRowLayout[];
  theme: PluginTheme;
  onSelect(range: DiffChangeRange): void;
}) {
  const [height, setHeight] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const c = panelTokens(theme);
  const markers = useMemo(
    () => diffOverviewMarkers(ranges, sizes, height),
    [ranges, sizes, height],
  );
  return (
    <View
      testID="diff-overview"
      accessibilityLabel="差异位置：红色为删除，绿色为新增，点击跳转"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{
        width: DIFF_OVERVIEW_WIDTH,
        flexShrink: 0,
        alignSelf: "stretch",
        borderLeftWidth: 1,
        borderLeftColor: c.border,
        backgroundColor: c.surface1,
      }}
    >
      {markers.map((marker) => {
        const added = marker.kind === "added";
        const line =
          marker.firstLine === marker.lastLine
            ? `${marker.firstLine}`
            : `${marker.firstLine}–${marker.lastLine}`;
        const label = `${added ? "新增 · 修改" : "删除 · 原始"}第 ${line} 行，点击跳转`;
        const key = `${marker.kind}:${marker.start}`;
        return (
          <Pressable
            key={key}
            ref={(node) => setWebTitle(node, label)}
            testID={`diff-marker-${marker.kind}-${marker.start}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(marker)}
            onHoverIn={() => setHovered(key)}
            onHoverOut={() => setHovered(null)}
            onFocus={() => setFocused(key)}
            onBlur={() => setFocused(null)}
            style={({ pressed }) => ({
              position: "absolute",
              top: marker.top,
              height: marker.height,
              left: added ? 9 : 1,
              width: 7,
              borderRadius: 1,
              backgroundColor: added ? c.statusSuccess : c.statusDanger,
              opacity: hovered === key || focused === key || pressed ? 1 : 0.8,
              borderWidth: focused === key ? 1 : 0,
              borderColor: c.foreground,
            })}
          />
        );
      })}
    </View>
  );
}
