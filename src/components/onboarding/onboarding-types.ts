export type OnboardingSectionId = "views" | "filters" | "focus" | "compose";
export type OnboardingInitialSection = OnboardingSectionId | "all" | null;
export type OnboardingRequiredAction = "click-target" | "focus-target";

export interface OnboardingSection {
  id: OnboardingSectionId;
  title: string;
  description: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target?: string;
  requiredAction?: OnboardingRequiredAction;
  actionPrompt?: string;
}
