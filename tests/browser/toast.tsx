import type { PluginTheme } from "@getpaseo/plugin";
import type { ToastApi, ToastOptions } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Text, View } from "react-native";

declare const document: { body: Parameters<typeof createPortal>[1] };
type Toast = { id: number; message: string; options: ToastOptions };
const listeners = new Set<(toast: Toast) => void>();
let sequence = 0;
const api: ToastApi = {
  show(message, options = {}) {
    const toast = { id: ++sequence, message, options };
    for (const listener of listeners) listener(toast);
  },
  error(message) {
    api.show(message, { variant: "error" });
  },
};

export function useToast() {
  return api;
}

// Stand in for the host-owned toast layer when previewing outside Paseo.
export function ToastPreview({ theme }: { theme: PluginTheme }) {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.options.durationMs ?? 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  const { colors } = theme;
  const color =
    toast.options.variant === "error"
      ? colors.statusDanger
      : toast.options.variant === "warning"
        ? colors.statusWarning
        : toast.options.variant === "success"
          ? colors.statusSuccess
          : colors.accent;
  return createPortal(
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 32,
        left: 16,
        right: 16,
        zIndex: 100000,
        alignItems: "center",
      }}
    >
      <View
        key={toast.id}
        testID={`git-toast-${toast.options.variant ?? "default"}`}
        accessibilityRole={toast.options.variant === "error" ? "alert" : undefined}
        accessibilityLiveRegion="polite"
        style={{
          maxWidth: 440,
          padding: 12,
          borderRadius: 6,
          backgroundColor: colors.surface1,
          borderWidth: 1,
          borderColor: color,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>
          {toast.message}
        </Text>
      </View>
    </View>,
    document.body,
  );
}
