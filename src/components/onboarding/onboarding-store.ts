import { create } from "zustand";

/**
 * Open/close state for the onboarding guide. It lives in a store because the
 * guide is opened from outside its own component tree — the sidebar / mobile
 * "Guide" buttons dispatch `ui.openGuide`, whose bus handler flips this. Every
 * other piece of onboarding state is owned locally by OnboardingController.
 */
interface OnboardingStore {
  isOpen: boolean;
  openGuide: () => void;
  closeGuide: () => void;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  isOpen: false,
  openGuide: () => set({ isOpen: true }),
  closeGuide: () => set({ isOpen: false }),
}));
