/**
 * Memory diagnostic registry. Suspect stores call `registerMemdiagStore` at
 * DEV-only module load to expose their size + interesting structural counts.
 * `takeMemdiagSnapshot()` returns a JSON-serializable summary. In DEV the
 * snapshot is logged every 30s and exposed on `window.__nodex.memdiag.snapshot`
 * so a Playwright harness (scripts/memdiag-run.ts) can poll it.
 *
 * Production builds never call into this module — every call site is gated by
 * `import.meta.env.DEV`, so the registration closures are tree-shaken out and
 * production carries no overhead.
 */

const IS_DEV = import.meta.env.DEV;
const SAMPLE_INTERVAL_MS = 30_000;

export interface MemdiagStoreReading {
  size: number;
  extras?: Record<string, number>;
}

export interface MemdiagSnapshot {
  ts: number;
  uptimeMs: number;
  jsHeap: { usedMB: number; totalMB: number; limitMB: number } | null;
  stores: Record<string, MemdiagStoreReading>;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

type Reader = () => MemdiagStoreReading;

const readers = new Map<string, Reader>();
let startedAt = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function registerMemdiagStore(label: string, read: Reader): void {
  if (!IS_DEV) return;
  if (startedAt === 0) startedAt = Date.now();
  // Repeated registration overwrites the previous reader silently: under
  // React StrictMode and HMR the same hook re-runs and that's expected.
  readers.set(label, read);
  ensureWindowGlobal();
  ensureInterval();
}

function readJsHeap(): MemdiagSnapshot["jsHeap"] {
  if (typeof performance === "undefined") return null;
  const mem = (performance as unknown as { memory?: PerformanceMemory }).memory;
  if (!mem) return null;
  return {
    usedMB: toMB(mem.usedJSHeapSize),
    totalMB: toMB(mem.totalJSHeapSize),
    limitMB: toMB(mem.jsHeapSizeLimit),
  };
}

function toMB(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 100) / 100;
}

export function takeMemdiagSnapshot(): MemdiagSnapshot {
  const stores: Record<string, MemdiagStoreReading> = {};
  for (const [label, read] of readers) {
    try {
      stores[label] = read();
    } catch (err) {
      stores[label] = { size: -1, extras: { __error: 1 } };
      console.warn(`[memdiag] reader "${label}" threw`, err);
    }
  }
  const ts = Date.now();
  return {
    ts,
    uptimeMs: startedAt === 0 ? 0 : ts - startedAt,
    jsHeap: readJsHeap(),
    stores,
  };
}

function logCompactSummary(snap: MemdiagSnapshot): void {
  const parts: string[] = [];
  for (const [label, reading] of Object.entries(snap.stores)) {
    parts.push(`${label}=${reading.size}`);
  }
  const heap = snap.jsHeap ? ` heap=${snap.jsHeap.usedMB}MB/${snap.jsHeap.totalMB}MB` : "";
  console.debug(`[nostr:memdiag] t+${Math.round(snap.uptimeMs / 1000)}s ${parts.join(" ")}${heap}`);
}

function ensureInterval(): void {
  if (!IS_DEV) return;
  if (intervalHandle !== null) return;
  if (typeof window === "undefined") return;
  intervalHandle = setInterval(() => {
    logCompactSummary(takeMemdiagSnapshot());
  }, SAMPLE_INTERVAL_MS);
}

interface NodexDevGlobal {
  memdiag: {
    snapshot: () => MemdiagSnapshot;
    registered: () => string[];
  };
}

declare global {
  interface Window {
    __nodex?: NodexDevGlobal;
  }
}

function ensureWindowGlobal(): void {
  if (!IS_DEV) return;
  if (typeof window === "undefined") return;
  if (window.__nodex?.memdiag) return;
  window.__nodex = {
    ...(window.__nodex || {}),
    memdiag: {
      snapshot: takeMemdiagSnapshot,
      registered: () => Array.from(readers.keys()),
    },
  };
}
