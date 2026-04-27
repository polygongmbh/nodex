import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { getOnboardingSections } from "@/components/onboarding/onboarding-sections";
import { getOnboardingStepsBySection } from "@/components/onboarding/onboarding-steps";
import type { OnboardingInitialSection, OnboardingSectionId } from "@/components/onboarding/onboarding-types";
import { getOnboardingBehaviorGateId, shouldForceComposeForGuide } from "@/lib/onboarding-guide";
import {
  isComposeGuideStep,
  isFilterResetStep,
  isNavigationFocusStep,
  shouldForceFeedAndResetFiltersOnStep,
} from "@/lib/onboarding-step-rules";
import { mapPeopleSelection, setAllChannelFilters } from "@/domain/content/filter-state-utils";
import type { Channel } from "@/types";
import type { Person } from "@/types/person";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

const STARTUP_ONBOARDING_INTRO_DELAY_MS = 300;

interface UseIndexOnboardingOptions {
  user: { pubkey?: string } | null | undefined;
  isMobile: boolean;
  currentView: ViewType;
  channels: Channel[];
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
  onBeforeResetFocusedTaskScope?: () => void;
  setCurrentView: (view: ViewType) => void;
  setFocusedTaskId: (taskId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  setChannelFilterStates: Dispatch<SetStateAction<Map<string, Channel["filterState"]>>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
  setIsAuthModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function useIndexOnboarding({
  user,
  isMobile,
  currentView,
  channels,
  openedWithFocusedTaskRef,
  onBeforeResetFocusedTaskScope,
  setCurrentView,
  setFocusedTaskId,
  setSearchQuery,
  setActiveRelayIds,
  setChannelFilterStates,
  setPeople,
  setIsAuthModalOpen,
}: UseIndexOnboardingOptions) {
  const { t } = useTranslation("onboarding");
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOnboardingIntroOpen, setIsOnboardingIntroOpen] = useState(false);
  const [onboardingInitialSection, setOnboardingInitialSection] = useState<OnboardingInitialSection>(null);
  const [onboardingManualStart, setOnboardingManualStart] = useState(false);
  const [activeOnboardingSection, setActiveOnboardingSection] = useState<OnboardingSectionId | null>(null);
  const [activeOnboardingStepId, setActiveOnboardingStepId] = useState<string | null>(null);
  const [composeGuideActivationSignal, setComposeGuideActivationSignal] = useState(0);
  const lastHandledOnboardingStepRef = useRef<string | null>(null);
  const handledStartupIntroRef = useRef(false);

  const onboardingSections = useMemo(
    () => getOnboardingSections(isMobile, currentView, t),
    [currentView, isMobile, t]
  );
  const onboardingStepsBySection = useMemo(
    () => getOnboardingStepsBySection(isMobile, currentView, t),
    [currentView, isMobile, t]
  );

  const queueOnboardingIntro = useCallback((
    manualStart: boolean,
    initialSection: OnboardingInitialSection,
    showIntro = true
  ) => {
    setOnboardingManualStart(manualStart);
    setOnboardingInitialSection(initialSection);
    setActiveOnboardingSection(null);
    setIsOnboardingIntroOpen(showIntro);
    setIsOnboardingOpen(!showIntro);
  }, []);

  const handleStartOnboardingTour = useCallback(() => {
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(true);
  }, []);

  const handleOpenGuide = useCallback(() => {
    const initialSectionForOpen: OnboardingInitialSection = isMobile ? "all" : null;
    setOnboardingManualStart(true);
    setOnboardingInitialSection(initialSectionForOpen);
    setActiveOnboardingSection(null);
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(true);
  }, [isMobile]);

  const handleCloseGuide = useCallback(() => {
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
    if (!user) {
      setIsAuthModalOpen(true);
    }
  }, [setIsAuthModalOpen, user]);

  useEffect(() => {
    if (handledStartupIntroRef.current) return;
    handledStartupIntroRef.current = true;

    if (!openedWithFocusedTaskRef.current && !user) {
      const introTimeout = window.setTimeout(() => {
        queueOnboardingIntro(false, "all", !user);
      }, STARTUP_ONBOARDING_INTRO_DELAY_MS);

      return () => {
        window.clearTimeout(introTimeout);
      };
    }
  }, [openedWithFocusedTaskRef, queueOnboardingIntro, user]);

  useEffect(() => {
    if (!user) return;
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
  }, [user]);

  useEffect(() => {
    if (!isOnboardingOpen) {
      lastHandledOnboardingStepRef.current = null;
      setActiveOnboardingStepId(null);
    }
  }, [isOnboardingOpen]);

  const handleOnboardingStepChange = useCallback((payload: {
    id: string;
    stepNumber: number;
  }) => {
    setActiveOnboardingStepId(payload.id);

    const stepKey = getOnboardingBehaviorGateId(payload.id);
    if (lastHandledOnboardingStepRef.current === stepKey) return;
    lastHandledOnboardingStepRef.current = stepKey;

    // Re-pulse the compose activation signal whenever a compose-guide step is
    // (re-)entered, so the composer re-expands even if the previous step had
    // already pre-opened it (e.g. user clicked outside, collapsing it).
    const isDedicatedViewGuide = !isMobile && (currentView === "kanban" || currentView === "calendar");
    if (isComposeGuideStep(payload.id) && !isDedicatedViewGuide) {
      setComposeGuideActivationSignal((previous) => previous + 1);
    }

    if (shouldForceFeedAndResetFiltersOnStep(payload.id, isMobile)) {
      setCurrentView("feed");
      onBeforeResetFocusedTaskScope?.();
      setFocusedTaskId(null);
      setSearchQuery("");
      setActiveRelayIds(new Set());
      setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
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
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setPeople((prev) => mapPeopleSelection(prev, () => false));
  }, [
    channels,
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
    isOnboardingIntroOpen,
    onboardingInitialSection,
    onboardingManualStart,
    activeOnboardingSection,
    activeOnboardingStepId,
    onboardingSections,
    onboardingStepsBySection,
    forceShowComposeForGuide,
    composeGuideActivationSignal,
    handleStartOnboardingTour,
    handleOpenGuide,
    handleCloseGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  };
}
