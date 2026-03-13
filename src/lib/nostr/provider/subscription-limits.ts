import type { NDKFilter } from "@nostr-dev-kit/ndk";

type PerformanceClass = "low" | "medium" | "high" | "very-high";

interface NavigatorPerformanceSnapshot {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

interface LimitDecision {
  filters: NDKFilter[];
  cap: number;
  performanceClass: PerformanceClass;
  changed: boolean;
}

const PERFORMANCE_CAPS: Record<PerformanceClass, number> = {
  low: 100,
  medium: 250,
  high: 500,
  "very-high": 1000,
};

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function classifySystemPerformance(snapshot?: NavigatorPerformanceSnapshot): PerformanceClass {
  const cores = isFinitePositiveNumber(snapshot?.hardwareConcurrency) ? snapshot.hardwareConcurrency : null;
  const memory = isFinitePositiveNumber(snapshot?.deviceMemory) ? snapshot.deviceMemory : null;

  if ((cores !== null && cores <= 2) || (memory !== null && memory <= 2)) {
    return "low";
  }
  if ((cores !== null && cores <= 4) || (memory !== null && memory <= 4)) {
    return "medium";
  }
  if ((cores !== null && cores >= 12) || (memory !== null && memory >= 16)) {
    return "very-high";
  }
  return "high";
}

export function getPerformanceBasedSubscriptionCap(snapshot?: NavigatorPerformanceSnapshot): number {
  return PERFORMANCE_CAPS[classifySystemPerformance(snapshot)];
}

function hasTagFilters(filter: NDKFilter): boolean {
  return Object.keys(filter).some((key) => key.startsWith("#"));
}

function isBroadBackfillFilter(filter: NDKFilter): boolean {
  return !filter.ids && !filter.authors && !filter.search && !hasTagFilters(filter);
}

export function applyPerformanceAwareSubscriptionLimits(
  filters: NDKFilter[],
  snapshot?: NavigatorPerformanceSnapshot
): LimitDecision {
  const performanceClass = classifySystemPerformance(snapshot);
  const cap = PERFORMANCE_CAPS[performanceClass];
  let changed = false;

  const nextFilters = filters.map((filter) => {
    if (typeof filter.limit === "number") {
      if (filter.limit <= cap) return filter;
      changed = true;
      return { ...filter, limit: cap };
    }

    if (!isBroadBackfillFilter(filter)) {
      return filter;
    }

    changed = true;
    return { ...filter, limit: cap };
  });

  return {
    filters: nextFilters,
    cap,
    performanceClass,
    changed,
  };
}
