type Subscription = { remove(): void };
export type NativeBackHandler = {
  addEventListener(event: "hardwareBackPress", handler: () => boolean): Subscription;
};
export type BrowserBack = {
  history: {
    state: unknown;
    pushState(state: unknown, title: string): void;
    back(): void;
  };
  addEventListener(event: "popstate", listener: () => void): void;
  removeEventListener(event: "popstate", listener: () => void): void;
};

const HISTORY_KEY = "paseoGitDiffPage";
let nextEntry = 0;
function marker(state: unknown) {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)[HISTORY_KEY]
    : undefined;
}

export function subscribeSystemBack(
  platform: string,
  native: NativeBackHandler,
  onBack: () => void,
  browser?: BrowserBack,
) {
  if (platform === "android") {
    const subscription = native.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }
  if (platform !== "web" || !browser?.history?.pushState) return;
  const { history } = browser;
  const entry = `diff-${Date.now()}-${++nextEntry}`;
  const previous = history.state;
  history.pushState(
    { ...(previous && typeof previous === "object" ? previous : {}), [HISTORY_KEY]: entry },
    "",
  );
  let returned = false;
  const pop = () => {
    if (returned || marker(history.state) === entry) return;
    returned = true;
    onBack();
  };
  browser.addEventListener("popstate", pop);
  return () => {
    browser.removeEventListener("popstate", pop);
    // The in-panel back button, view switch and unmount also retire this entry.
    // Never pop a later navigation owned by the host or another panel.
    if (!returned && marker(history.state) === entry) history.back();
  };
}
