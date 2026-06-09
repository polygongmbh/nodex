import { create } from "zustand";

/**
 * Day selected in the home view's mini calendar, as a `yyyy-MM-dd` key.
 * Scopes the home timeline and my-tasks panel only — other views ignore it —
 * so it is deliberately not part of useFilterStore and never persisted.
 */
interface HomeDayStoreState {
  selectedDayKey: string | null;
  toggleSelectedDay: (dayKey: string) => void;
  clearSelectedDay: () => void;
}

export const useHomeDayStore = create<HomeDayStoreState>()((set) => ({
  selectedDayKey: null,
  toggleSelectedDay: (dayKey) =>
    set((state) => ({
      selectedDayKey: state.selectedDayKey === dayKey ? null : dayKey,
    })),
  clearSelectedDay: () => set({ selectedDayKey: null }),
}));
