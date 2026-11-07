import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";
import { type BrowserBack, subscribeSystemBack } from "./system-back";

export function useSystemBack(enabled: boolean, onBack: () => void) {
  const callback = useRef(onBack);
  callback.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    return subscribeSystemBack(
      Platform.OS,
      BackHandler,
      () => callback.current(),
      Platform.OS === "web" ? (globalThis as unknown as BrowserBack) : undefined,
    );
  }, [enabled]);
}
