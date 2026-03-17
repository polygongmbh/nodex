import "@testing-library/jest-dom";
import "@/lib/i18n/config";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

function installStorageFallbackIfNeeded(): void {
  const candidate = (window as Window & { localStorage?: unknown }).localStorage as Partial<Storage> | undefined;
  const hasUsableStorage =
    Boolean(candidate) &&
    typeof candidate?.getItem === "function" &&
    typeof candidate?.setItem === "function" &&
    typeof candidate?.removeItem === "function" &&
    typeof candidate?.clear === "function";

  if (hasUsableStorage) return;

  const store = new Map<string, string>();
  const fallbackStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: fallbackStorage,
  });
}

installStorageFallbackIfNeeded();

const activeTimeouts = new Map<unknown, string>();
const activeIntervals = new Map<unknown, string>();
const activeAnimationFrames = new Map<unknown, string>();

const originalSetTimeout = window.setTimeout.bind(window);
const originalClearTimeout = window.clearTimeout.bind(window);
const originalSetInterval = window.setInterval.bind(window);
const originalClearInterval = window.clearInterval.bind(window);
const originalRequestAnimationFrame = (callback: FrameRequestCallback) =>
  originalSetTimeout(() => callback(Date.now()), 16);
const originalCancelAnimationFrame = (handle: ReturnType<typeof originalSetTimeout>) =>
  originalClearTimeout(handle);

function installTrackedTimerWrappers(): void {
  const captureStack = () => new Error().stack?.split("\n").slice(2, 8).join("\n") ?? "stack unavailable";

  const trackedSetTimeout: typeof window.setTimeout = ((handler, timeout, ...args) => {
    const handle = originalSetTimeout(((...callbackArgs: unknown[]) => {
      activeTimeouts.delete(handle);
      if (typeof handler === "function") {
        handler(...callbackArgs);
        return;
      }
      globalThis.eval(handler);
    }) as TimerHandler, timeout, ...args);
    activeTimeouts.set(handle, captureStack());
    return handle;
  }) as typeof window.setTimeout;

  const trackedClearTimeout: typeof window.clearTimeout = ((handle?: number) => {
    if (handle !== undefined && handle !== null) {
      activeTimeouts.delete(handle);
    }
    return originalClearTimeout(handle);
  }) as typeof window.clearTimeout;

  const trackedSetInterval: typeof window.setInterval = ((handler, timeout, ...args) => {
    const handle = originalSetInterval(handler, timeout, ...args);
    activeIntervals.set(handle, captureStack());
    return handle;
  }) as typeof window.setInterval;

  const trackedClearInterval: typeof window.clearInterval = ((handle?: number) => {
    if (handle !== undefined && handle !== null) {
      activeIntervals.delete(handle);
    }
    return originalClearInterval(handle);
  }) as typeof window.clearInterval;

  const trackedRequestAnimationFrame: typeof window.requestAnimationFrame = ((callback) => {
    const handle = originalRequestAnimationFrame((timestamp) => {
      activeAnimationFrames.delete(handle);
      callback(timestamp);
    });
    activeAnimationFrames.set(handle, captureStack());
    return handle;
  }) as typeof window.requestAnimationFrame;

  const trackedCancelAnimationFrame: typeof window.cancelAnimationFrame = ((handle: number) => {
    activeAnimationFrames.delete(handle);
    return originalCancelAnimationFrame(handle);
  }) as typeof window.cancelAnimationFrame;

  window.setTimeout = trackedSetTimeout;
  window.clearTimeout = trackedClearTimeout;
  window.setInterval = trackedSetInterval;
  window.clearInterval = trackedClearInterval;
  window.requestAnimationFrame = trackedRequestAnimationFrame;
  window.cancelAnimationFrame = trackedCancelAnimationFrame;
  globalThis.setTimeout = trackedSetTimeout;
  globalThis.clearTimeout = trackedClearTimeout;
  globalThis.setInterval = trackedSetInterval;
  globalThis.clearInterval = trackedClearInterval;
  globalThis.requestAnimationFrame = trackedRequestAnimationFrame;
  globalThis.cancelAnimationFrame = trackedCancelAnimationFrame;
}

function clearTrackedAsyncWork(): { timeouts: string[]; intervals: string[]; animationFrames: string[] } {
  const shouldIgnoreStack = (stack: string) =>
    stack.includes("@testing-library/dom/dist/wait-for.js") ||
    stack.includes("vitest/dist/chunks/vi.");

  const leaked = {
    timeouts: Array.from(activeTimeouts.values()).filter((stack) => !shouldIgnoreStack(stack)),
    intervals: Array.from(activeIntervals.values()).filter((stack) => !shouldIgnoreStack(stack)),
    animationFrames: Array.from(activeAnimationFrames.values()).filter((stack) => !shouldIgnoreStack(stack)),
  };
  activeTimeouts.forEach((handle) => originalClearTimeout(handle));
  activeIntervals.forEach((handle) => originalClearInterval(handle));
  activeAnimationFrames.forEach((handle) => originalCancelAnimationFrame(handle));
  activeTimeouts.clear();
  activeIntervals.clear();
  activeAnimationFrames.clear();
  return leaked;
}

installTrackedTimerWrappers();

// Mock matchMedia for tests
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock WebSocket for nostr relay tests
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event("open"));
      }
    }, 0);
  }

  send(data: string) {
    // Mock implementation - can be extended in tests
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code, reason }));
    }
  }
}

Object.defineProperty(window, "WebSocket", {
  writable: true,
  value: MockWebSocket,
});

const originalConsoleError = console.error;
const shouldSuppressConsoleError = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return (
    value.includes("not wrapped in act") ||
    value.includes("Task submit failed") ||
    value.includes("network down")
  );
};

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (args.some(shouldSuppressConsoleError)) return;
    originalConsoleError(...args);
  });
});

afterEach(() => {
  cleanup();
  clearTrackedAsyncWork();
  vi.useRealTimers();
});

afterAll(() => {
  clearTrackedAsyncWork();
  vi.restoreAllMocks();
});
