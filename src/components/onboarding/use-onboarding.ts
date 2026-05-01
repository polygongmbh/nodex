import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
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
import { mapPeopleSelection } from "@/domain/content/filter-state-utils";
import type { SelectablePerson } from "@/types/person";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";

interface UseOnboardingOptions {
  user: { pubkey?: string } | null | undefined;
  isMobile: boolean;
  currentView: ViewType;
  onBeforeResetFocusedTaskScope?: () => void;
  setCurrentView: (view: ViewType) => void;
  setFocusedTaskId: (taskId: string | null) => void;
  setPeople: Dispatch<SetStateAction<SelectablePerson[]>>;
}

export function useOnboarding({
  user,
  isMobile,
  currentView,
  onBeforeResetFocusedTaskScope,
  setCurrentView,
  setFocusedTaskId,
  setPeople,
}: UseOnboardingOptions) {
  const { t } = useTranslation("onboarding");
  const { setActiveRelayIds, setChannelFilterStates } = useFilterStore();
  const setSearchQuery = usePreferencesStore((s) => s.setSearchQuery);
  const setIsAuthModalOpen = useAuthModalStore((s) => s.setIsOpen);

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingInitialSection, setOnboardingInitialSection] = useState<OnboardingInitialSection>(null);
  const [onboardingManualStart, setOnboardingManualStart] = useState(false);
  const [activeOnboardingSection, setActiveOnboardingSection] = useState<OnboardingSectionId | null>(null);
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

  const openGuideAsStartup = useCallback(() => {
    setOnboardingManualStart(false);
    setOnboardingInitialSection("all");
    setActiveOnboardingSection(null);
    setIsOnboardingOpen(true);
  }, []);

  const handleOpenGuide = useCallback(() => {
    const initialSectionForOpen: OnboardingInitialSection = isMobile ? "all" : null;
    setOnboardingManualStart(true);
    setOnboardingInitialSection(initialSectionForOpen);
    setActiveOnboardingSection(null);
    setIsOnboardingOpen(true);
  }, [isMobile]);

  const handleCloseGuide = useCallback(() => {
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
    if (!user) {
      setIsAuthModalOpen(true);
    }
  }, [setIsAuthModalOpen, user]);

  useEffect(() => {
    if (!user) return;
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
  }, [user]);

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
      setPeople((prev) => mapPeopleSelection(prev, () => false));
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
    setPeople((prev) => mapPeopleSelection(prev, () => false));
  }, [
    currentView,
    isMobile,
    onBeforeResetFocusedTaskScope,
    setActiveRelayIds,
    setChannelFilterStates,
    setCurrentView,
    setFocusedTaskId,
    setPeople,
    setSearchQuery,
  ]);

  const handleOnboardingActiveSectionChange = useCallback((section: OnboardingSectionId | null) => {
    setActiveOnboardingSection(section);
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

  return {
    isOnboardingOpen,
    onboardingInitialSection,
    onboardingManualStart,
    activeOnboardingSection,
    activeOnboardingStepId,
    onboardingSections,
    onboardingStepsBySection,
    forceShowComposeForGuide,
    composeGuideActivationSignal,
    openGuideAsStartup,
    handleOpenGuide,
    handleCloseGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  };
}
