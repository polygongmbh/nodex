import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getOnboardingSections } from "@/components/onboarding/onboarding-sections";
import { getOnboardingStepsBySection } from "@/components/onboarding/onboarding-steps";
import type { OnboardingInitialSection, OnboardingSectionId } from "@/components/onboarding/onboarding-types";
import { shouldForceComposeForGuide } from "@/lib/onboarding-guide";
import {
  isComposeGuideStep,
  isFilterResetStep,
  isNavigationFocusStep,
  shouldForceFeedAndResetFiltersOnStep,
} from "@/lib/onboarding-step-rules";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useComposerSignalsStore } from "@/features/feed-page/stores/composer-signals-store";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useOnboardingStore } from "@/components/onboarding/onboarding-store";

interface UseOnboardingOptions {
  user: { pubkey?: string } | null | undefined;
  isMobile: boolean;
  currentView: ViewType;
  onBeforeResetFocusedTaskScope?: () => void;
}

export function useOnboarding({
  user,
  isMobile,
  currentView,
  onBeforeResetFocusedTaskScope,
}: UseOnboardingOptions) {
  const { t } = useTranslation("onboarding");
  const { setActiveRelayIds, setChannelFilterStates, setSearchQuery, clearSelectedPeople } = useFilterStore();
  const setIsAuthModalOpen = useAuthModalStore((s) => s.setIsOpen);
  const dispatch = useFeedInteractionDispatch();
  const isOnboardingOpen = useOnboardingStore((s) => s.isOpen);
  const closeOnboarding = useOnboardingStore((s) => s.closeGuide);

  // Onboarding drives navigation through the interaction bus (like every other
  // caller) rather than raw setters, so the hook needs no navigation props.
  const setCurrentView = useCallback(
    (view: ViewType) => { void dispatch({ type: "ui.view.change", view }); },
    [dispatch]
  );
  const setFocusedTaskId = useCallback(
    (taskId: string | null) => { void dispatch({ type: "task.focus.change", taskId }); },
    [dispatch]
  );

  const [onboardingInitialSection] = useState<OnboardingInitialSection>(isMobile ? "all" : null);
  const [activeOnboardingStepId, setActiveOnboardingStepId] = useState<string | null>(null);
  const [composeGuideActivationSignal, setComposeGuideActivationSignal] = useState(0);

  const onboardingSections = useMemo(
    () => getOnboardingSections(isMobile, currentView, t),
    [currentView, isMobile, t]
  );
  const onboardingStepsBySection = useMemo(
    () => getOnboardingStepsBySection(isMobile, currentView, t),
    [currentView, isMobile, t]
  );

  const handleCloseGuide = useCallback(() => {
    closeOnboarding();
    if (!user) {
      setIsAuthModalOpen(true);
    }
  }, [closeOnboarding, setIsAuthModalOpen, user]);

  // why: signing in dismisses the guide (the auth modal / real UI takes over).
  useEffect(() => {
    if (!user) return;
    closeOnboarding();
  }, [user, closeOnboarding]);

  const lastHandledStepIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOnboardingOpen) {
      setActiveOnboardingStepId(null);
      lastHandledStepIdRef.current = null;
    }
  }, [isOnboardingOpen]);

  const handleOnboardingStepChange = useCallback((payload: {
    id: string;
    stepNumber: number;
  }) => {
    setActiveOnboardingStepId(payload.id);

    // Side effects (view switch, filter reset) should only fire when the step
    // actually changes — not on every callback re-creation triggered by parent
    // state updates. Otherwise selections made during the step are perpetually
    // undone in a loop.
    if (lastHandledStepIdRef.current === payload.id) return;
    lastHandledStepIdRef.current = payload.id;

    const isDedicatedViewGuide = !isMobile && (currentView === "kanban" || currentView === "calendar");
    if (isComposeGuideStep(payload.id) && !isDedicatedViewGuide) {
      setComposeGuideActivationSignal((previous) => previous + 1);
      if (!isMobile && currentView !== "feed") {
        setCurrentView("feed");
      }
    }

    if (shouldForceFeedAndResetFiltersOnStep(payload.id, isMobile)) {
      setCurrentView("feed");
      onBeforeResetFocusedTaskScope?.();
      setFocusedTaskId(null);
      setSearchQuery("");
      setActiveRelayIds(new Set());
      setChannelFilterStates(new Map());
      clearSelectedPeople();
      return;
    }

    if (isNavigationFocusStep(payload.id)) {
      setCurrentView("feed");
      return;
    }
    if (!isFilterResetStep(payload.id)) return;

    onBeforeResetFocusedTaskScope?.();
    setFocusedTaskId(null);
    setSearchQuery("");
    setActiveRelayIds(new Set());
    setChannelFilterStates(new Map());
    clearSelectedPeople();
  }, [
    currentView,
    isMobile,
    onBeforeResetFocusedTaskScope,
    setActiveRelayIds,
    setChannelFilterStates,
    setCurrentView,
    setFocusedTaskId,
    clearSelectedPeople,
    setSearchQuery,
  ]);

  const handleOnboardingActiveSectionChange = useCallback((section: OnboardingSectionId | null) => {
    const isDedicatedViewGuide = !isMobile && (currentView === "kanban" || currentView === "calendar");
    if (section === "compose" && !isDedicatedViewGuide) {
      setComposeGuideActivationSignal((previous) => previous + 1);
    }
    if (!isMobile && section === "compose" && !isDedicatedViewGuide && currentView !== "feed") {
      setCurrentView("feed");
    }
  }, [currentView, isMobile, setCurrentView]);

  const forceShowComposeForGuide = shouldForceComposeForGuide({
    isOnboardingOpen,
    activeOnboardingStepId,
    isMobile,
    currentView,
  });

  // why: publish the guide's composer signals to the store the composers read,
  // so views force the composer open / re-activate it during the compose guide.
  useEffect(() => {
    useComposerSignalsStore.getState().setForceShowComposer(forceShowComposeForGuide);
  }, [forceShowComposeForGuide]);
  useEffect(() => {
    useComposerSignalsStore.getState().setComposeGuideActivationSignal(composeGuideActivationSignal);
  }, [composeGuideActivationSignal]);

  return {
    isOnboardingOpen,
    onboardingInitialSection,
    onboardingManualStart: true,
    onboardingSections,
    onboardingStepsBySection,
    handleCloseGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  };
}
