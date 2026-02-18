interface ShouldAutoStartOnboardingParams {
  onboardingCompleted: boolean;
  openedWithFocusedTask: boolean;
}

export function shouldAutoStartOnboarding({
  onboardingCompleted,
  openedWithFocusedTask,
}: ShouldAutoStartOnboardingParams): boolean {
  if (onboardingCompleted) return false;
  if (openedWithFocusedTask) return false;
  return true;
}

