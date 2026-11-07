import { describe, expect, it, vi } from "vitest";
import {
  type BrowserBack,
  type NativeBackHandler,
  subscribeSystemBack,
} from "../client/system-back";

function browserHistory() {
  const states: unknown[] = [{ route: "workspace" }, { route: "plugin", key: "host-key", idx: 1 }];
  let index = 1;
  const listeners = new Set<() => void>();
  const browser: BrowserBack = {
    history: {
      get state() {
        return states[index];
      },
      pushState(state) {
        states.splice(++index, states.length, state);
      },
      back: vi.fn(() => {
        if (!index) return;
        index--;
        for (const listener of listeners) listener();
      }),
    },
    addEventListener: (_event, listener) => void listeners.add(listener),
    removeEventListener: (_event, listener) => void listeners.delete(listener),
  };
  return browser;
}

const noNative: NativeBackHandler = {
  addEventListener() {
    throw new Error("Native back must not be used on this platform");
  },
};

describe("system back from a compact file page", () => {
  it("consumes Android back while registered and removes the handler on exit", () => {
    let press: (() => boolean) | null = null;
    const onBack = vi.fn();
    const native: NativeBackHandler = {
      addEventListener(event, handler) {
        expect(event).toBe("hardwareBackPress");
        press = handler;
        return {
          remove() {
            press = null;
          },
        };
      },
    };
    const dispose = subscribeSystemBack("android", native, onBack);
    expect((press as unknown as () => boolean)()).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();
    dispose?.();
    expect(press).toBeNull();
  });

  it("returns to the list on browser back without consuming the host's next back", () => {
    const browser = browserHistory();
    const onBack = vi.fn();
    const dispose = subscribeSystemBack("web", noNative, onBack, browser);
    expect(browser.history.state).toMatchObject({ route: "plugin", key: "host-key", idx: 1 });
    browser.history.back();
    expect(onBack).toHaveBeenCalledOnce();
    expect(browser.history.state).toEqual({ route: "plugin", key: "host-key", idx: 1 });
    dispose?.();
    browser.history.back();
    expect(onBack).toHaveBeenCalledOnce();
    expect(browser.history.state).toEqual({ route: "workspace" });
  });

  it("retires its history entry when returning with the in-panel button", () => {
    const browser = browserHistory();
    const onBack = vi.fn();
    const dispose = subscribeSystemBack("web", noNative, onBack, browser);
    dispose?.();
    expect(onBack).not.toHaveBeenCalled();
    expect(browser.history.state).toEqual({ route: "plugin", key: "host-key", idx: 1 });
    browser.history.back();
    expect(browser.history.state).toEqual({ route: "workspace" });
  });

  it("preserves a later navigation owned by the host during cleanup", () => {
    const browser = browserHistory();
    const onBack = vi.fn();
    const dispose = subscribeSystemBack("web", noNative, onBack, browser);
    browser.history.pushState({ route: "another workspace" }, "");
    dispose?.();
    expect(browser.history.back).not.toHaveBeenCalled();
    expect(browser.history.state).toEqual({ route: "another workspace" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("leaves unsupported native platforms and hosts without browser history alone", () => {
    const onBack = vi.fn();
    expect(subscribeSystemBack("ios", noNative, onBack)).toBeUndefined();
    expect(subscribeSystemBack("web", noNative, onBack)).toBeUndefined();
    expect(onBack).not.toHaveBeenCalled();
  });
});
