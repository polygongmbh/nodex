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

const DEBUG_ASYNC_LEAKS = process.env.VITEST_DEBUG_ASYNC_LEAKS === "true";
const activeTimeouts = new Map<unknown, string>();
const activeIntervals = new Map<unknown, string>();
const activeAnimationFrames = new Map<unknown, string>();
const activeEventListeners = new Map<string, string>();
const activeMutationObservers = new Map<object, string>();
const activeResizeObservers = new Map<object, string>();
const activeIntersectionObservers = new Map<object, string>();

const originalSetTimeout = window.setTimeout.bind(window);
const originalClearTimeout = window.clearTimeout.bind(window);
const originalSetInterval = window.setInterval.bind(window);
const originalClearInterval = window.clearInterval.bind(window);
const originalRequestAnimationFrame = (callback: FrameRequestCallback) =>
  originalSetTimeout(() => callback(Date.now()), 16);
const originalCancelAnimationFrame = (handle: ReturnType<typeof originalSetTimeout>) =>
  originalClearTimeout(handle);
const originalWindowAddEventListener = window.addEventListener.bind(window);
const originalWindowRemoveEventListener = window.removeEventListener.bind(window);
const originalDocumentAddEventListener = document.addEventListener.bind(document);
const originalDocumentRemoveEventListener = document.removeEventListener.bind(document);
const originalMutationObserver = globalThis.MutationObserver;
const originalResizeObserver = globalThis.ResizeObserver;
const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalWindowSetTimeout = window.setTimeout;
const originalWindowClearTimeout = window.clearTimeout;
const originalWindowSetInterval = window.setInterval;
const originalWindowClearInterval = window.clearInterval;
const originalWindowRequestAnimationFrame = window.requestAnimationFrame;
const originalWindowCancelAnimationFrame = window.cancelAnimationFrame;
const originalGlobalSetTimeout = globalThis.setTimeout;
const originalGlobalClearTimeout = globalThis.clearTimeout;
const originalGlobalSetInterval = globalThis.setInterval;
const originalGlobalClearInterval = globalThis.clearInterval;
const originalGlobalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalGlobalCancelAnimationFrame = globalThis.cancelAnimationFrame;

const listenerIds = new WeakMap<EventListenerOrEventListenerObject, number>();
let nextListenerId = 1;

function captureStack(): string {
  return new Error().stack?.split("\n").slice(2, 8).join("\n") ?? "stack unavailable";
}

function getListenerId(listener: EventListenerOrEventListenerObject | null): string {
  if (!listener) return "null";
  if (typeof listener === "function") {
    if (!listenerIds.has(listener)) {
      listenerIds.set(listener, nextListenerId++);
    }
    return `fn:${listenerIds.get(listener)}`;
  }
  if (!listenerIds.has(listener)) {
    listenerIds.set(listener, nextListenerId++);
  }
  return `obj:${listenerIds.get(listener)}`;
}

function resolveCapture(options?: boolean | AddEventListenerOptions | EventListenerOptions): boolean {
  if (typeof options === "boolean") return options;
  return Boolean(options?.capture);
}

function buildListenerKey(
  target: "window" | "document",
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions | EventListenerOptions
): string {
  return `${target}:${type}:${getListenerId(listener)}:${resolveCapture(options)}`;
}

function installTrackedTimerWrappers(): void {
  const trackedSetTimeout: typeof window.setTimeout = ((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ): number => {
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

  const trackedSetInterval: typeof window.setInterval = ((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ): number => {
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

function installTrackedEventListenerWrappers(): void {
  type WindowAddEventListenerArgs = Parameters<typeof window.addEventListener>;
  type WindowRemoveEventListenerArgs = Parameters<typeof window.removeEventListener>;
  type DocumentAddEventListenerArgs = Parameters<typeof document.addEventListener>;
  type DocumentRemoveEventListenerArgs = Parameters<typeof document.removeEventListener>;

  window.addEventListener = ((
    type: WindowAddEventListenerArgs[0],
    listener: WindowAddEventListenerArgs[1],
    options?: WindowAddEventListenerArgs[2]
  ) => {
    activeEventListeners.set(buildListenerKey("window", type, listener, options), captureStack());
    return originalWindowAddEventListener(type, listener, options);
  }) as typeof window.addEventListener;

  window.removeEventListener = ((
    type: WindowRemoveEventListenerArgs[0],
    listener: WindowRemoveEventListenerArgs[1],
    options?: WindowRemoveEventListenerArgs[2]
  ) => {
    activeEventListeners.delete(buildListenerKey("window", type, listener, options));
    return originalWindowRemoveEventListener(type, listener, options);
  }) as typeof window.removeEventListener;

  document.addEventListener = ((
    type: DocumentAddEventListenerArgs[0],
    listener: DocumentAddEventListenerArgs[1],
    options?: DocumentAddEventListenerArgs[2]
  ) => {
    activeEventListeners.set(buildListenerKey("document", type, listener, options), captureStack());
    return originalDocumentAddEventListener(type, listener, options);
  }) as typeof document.addEventListener;

  document.removeEventListener = ((
    type: DocumentRemoveEventListenerArgs[0],
    listener: DocumentRemoveEventListenerArgs[1],
    options?: DocumentRemoveEventListenerArgs[2]
  ) => {
    activeEventListeners.delete(buildListenerKey("document", type, listener, options));
    return originalDocumentRemoveEventListener(type, listener, options);
  }) as typeof document.removeEventListener;
}

function installTrackedObserverWrappers(): void {
  if (originalMutationObserver) {
    class TrackedMutationObserver extends originalMutationObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        activeMutationObservers.set(this, captureStack());
      }

      override disconnect(): void {
        activeMutationObservers.delete(this);
        super.disconnect();
      }
    }

    globalThis.MutationObserver = TrackedMutationObserver as typeof MutationObserver;
  }

  if (originalResizeObserver) {
    class TrackedResizeObserver extends originalResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        activeResizeObservers.set(this, captureStack());
      }

      override disconnect(): void {
        activeResizeObservers.delete(this);
        super.disconnect();
      }
    }

    globalThis.ResizeObserver = TrackedResizeObserver as typeof ResizeObserver;
  }

  if (originalIntersectionObserver) {
    class TrackedIntersectionObserver extends originalIntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        activeIntersectionObservers.set(this, captureStack());
      }

      override disconnect(): void {
        activeIntersectionObservers.delete(this);
        super.disconnect();
      }
    }

    globalThis.IntersectionObserver = TrackedIntersectionObserver as typeof IntersectionObserver;
  }
}

function clearTrackedAsyncWork(): {
  timeouts: string[];
  intervals: string[];
  animationFrames: string[];
  eventListeners: string[];
  mutationObservers: string[];
  resizeObservers: string[];
  intersectionObservers: string[];
} {
  const shouldIgnoreStack = (stack: string) =>
    stack.includes("@testing-library/dom/dist/wait-for.js") ||
    stack.includes("vitest/dist/chunks/vi.");

  const leaked = {
    timeouts: Array.from(activeTimeouts.values()).filter((stack) => !shouldIgnoreStack(stack)),
    intervals: Array.from(activeIntervals.values()).filter((stack) => !shouldIgnoreStack(stack)),
    animationFrames: Array.from(activeAnimationFrames.values()).filter((stack) => !shouldIgnoreStack(stack)),
    eventListeners: Array.from(activeEventListeners.values()).filter((stack) => !shouldIgnoreStack(stack)),
    mutationObservers: Array.from(activeMutationObservers.values()).filter((stack) => !shouldIgnoreStack(stack)),
    resizeObservers: Array.from(activeResizeObservers.values()).filter((stack) => !shouldIgnoreStack(stack)),
    intersectionObservers: Array.from(activeIntersectionObservers.values()).filter((stack) => !shouldIgnoreStack(stack)),
  };
  activeTimeouts.forEach((handle) => originalClearTimeout(handle));
  activeIntervals.forEach((handle) => originalClearInterval(handle));
  activeAnimationFrames.forEach((handle) => originalCancelAnimationFrame(handle));
  activeMutationObservers.forEach((_stack, observer) => {
    if ("disconnect" in observer && typeof observer.disconnect === "function") {
      observer.disconnect();
    }
  });
  activeResizeObservers.forEach((_stack, observer) => {
    if ("disconnect" in observer && typeof observer.disconnect === "function") {
      observer.disconnect();
    }
  });
  activeIntersectionObservers.forEach((_stack, observer) => {
    if ("disconnect" in observer && typeof observer.disconnect === "function") {
      observer.disconnect();
    }
  });
  activeTimeouts.clear();
  activeIntervals.clear();
  activeAnimationFrames.clear();
  activeEventListeners.clear();
  activeMutationObservers.clear();
  activeResizeObservers.clear();
  activeIntersectionObservers.clear();
  if (DEBUG_ASYNC_LEAKS) {
    const leakCount = Object.values(leaked).reduce((count, entries) => count + entries.length, 0);
    if (leakCount > 0) {
      console.warn("[test-cleanup] Cleared leaked async work", leaked);
    }
  }
  return leaked;
}

installTrackedTimerWrappers();
installTrackedEventListenerWrappers();
installTrackedObserverWrappers();

// Mock matchMedia for tests
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null as MediaQueryList["onchange"],
    addListener: (_listener: ((event: MediaQueryListEvent) => void) | null): void => {},
    removeListener: (_listener: ((event: MediaQueryListEvent) => void) | null): void => {},
    addEventListener: (_type: string, _listener: EventListenerOrEventListenerObject | null): void => {},
    removeEventListener: (_type: string, _listener: EventListenerOrEventListenerObject | null): void => {},
    dispatchEvent: (_event: Event): boolean => false,
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
  window.setTimeout = originalWindowSetTimeout;
  window.clearTimeout = originalWindowClearTimeout;
  window.setInterval = originalWindowSetInterval;
  window.clearInterval = originalWindowClearInterval;
  window.requestAnimationFrame = originalWindowRequestAnimationFrame;
  window.cancelAnimationFrame = originalWindowCancelAnimationFrame;
  globalThis.setTimeout = originalGlobalSetTimeout;
  globalThis.clearTimeout = originalGlobalClearTimeout;
  globalThis.setInterval = originalGlobalSetInterval;
  globalThis.clearInterval = originalGlobalClearInterval;
  globalThis.requestAnimationFrame = originalGlobalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalGlobalCancelAnimationFrame;
  window.addEventListener = originalWindowAddEventListener as typeof window.addEventListener;
  window.removeEventListener = originalWindowRemoveEventListener as typeof window.removeEventListener;
  document.addEventListener = originalDocumentAddEventListener as typeof document.addEventListener;
  document.removeEventListener = originalDocumentRemoveEventListener as typeof document.removeEventListener;
  if (originalMutationObserver) {
    globalThis.MutationObserver = originalMutationObserver;
  }
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  }
  if (originalIntersectionObserver) {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
  vi.restoreAllMocks();
});
