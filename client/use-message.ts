import { type ToastVariant, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useRef } from "react";
import { type Translate, tZh } from "../shared/i18n";

export function repositoryLabel(id: string, t: Translate = tZh) {
  return id === "." ? t("主仓库") : id;
}

export function briefError(error: unknown) {
  const text = (error instanceof Error ? error.message : String(error)).trim();
  const firstLine = text.split(/\r?\n/, 1)[0];
  return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
}

export function useMessage() {
  const toast = useToast();
  const current = useRef(toast);
  current.current = toast;
  const alive = useRef(true);
  const recent = useRef(new Map<string, { text: string; time: number }>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return useCallback((text: string, variant: ToastVariant, mergeKey?: string) => {
    if (!alive.current) return;
    if (mergeKey) {
      const now = Date.now();
      for (const [key, previous] of recent.current)
        if (now - previous.time >= 2000) recent.current.delete(key);
      if (recent.current.get(mergeKey)?.text === text) return;
      recent.current.set(mergeKey, { text, time: now });
    }
    current.current.show(text, {
      variant,
      durationMs: variant === "error" ? 6000 : variant === "success" ? 2500 : 4000,
    });
  }, []);
}
