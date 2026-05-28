import { create } from "zustand";

interface HydrationStatusState {
  isHydrating: boolean;
  setIsHydrating: (value: boolean) => void;
}

/**
 * One boolean: are we still inside the initial subscription backfill window.
 * Owner: `useNostrEventRouter` (at Index) pushes; leaves read via
 * `useIsHydrating()`.
 */
export const useHydrationStatusStore = create<HydrationStatusState>((set) => ({
  isHydrating: false,
  setIsHydrating: (value) => set({ isHydrating: value }),
}));

export const useIsHydrating = () => useHydrationStatusStore((s) => s.isHydrating);
