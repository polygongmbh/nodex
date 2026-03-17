export const ONBOARDING_VERSION = 1;
import { ONBOARDING_STATE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
export { ONBOARDING_STATE_STORAGE_KEY };

export interface OnboardingState {
  version: number;
  completed: boolean;
  lastStep?: number;
}

function defaultState(): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    completed: false,
    lastStep: undefined,
  };
}

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STATE_STORAGE_KEY);
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (parsed.version !== ONBOARDING_VERSION) {
      return defaultState();
    }

    return {
      version: ONBOARDING_VERSION,
      completed: parsed.completed === true,
      lastStep: typeof parsed.lastStep === "number" ? parsed.lastStep : undefined,
    };
  } catch {
    return defaultState();
  }
}

export function markOnboardingCompleted(lastStep?: number): void {
  try {
    localStorage.setItem(
      ONBOARDING_STATE_STORAGE_KEY,
      JSON.stringify({
        version: ONBOARDING_VERSION,
        completed: true,
        lastStep,
      } satisfies OnboardingState)
    );
  } catch {
    // Ignore persistence errors and continue.
  }
}

export function resetOnboardingState(): void {
  try {
    localStorage.removeItem(ONBOARDING_STATE_STORAGE_KEY);
  } catch {
    // Ignore persistence errors and continue.
  }
}
