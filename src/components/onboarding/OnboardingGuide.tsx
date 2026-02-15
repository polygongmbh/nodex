import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  OnboardingInitialSection,
  OnboardingSection,
  OnboardingSectionId,
} from "./onboarding-types";
import { getOnboardingAllSteps } from "./onboarding-steps";

interface OnboardingGuideProps {
  isOpen: boolean;
  initialSection: OnboardingInitialSection;
  sections: OnboardingSection[];
  stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string }[]>;
  onClose: () => void;
  onComplete: (lastStep: number) => void;
}

export function OnboardingGuide({
  isOpen,
  initialSection,
  sections,
  stepsBySection,
  onClose,
  onComplete,
}: OnboardingGuideProps) {
  const [activeSection, setActiveSection] = useState<OnboardingInitialSection>(initialSection);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection(initialSection);
    setStepIndex(0);
  }, [isOpen, initialSection]);

  const activeSteps = useMemo(() => {
    if (!activeSection) return [];
    if (activeSection === "all") {
      return getOnboardingAllSteps(stepsBySection);
    }
    return stepsBySection[activeSection];
  }, [activeSection, stepsBySection]);

  useEffect(() => {
    if (!isOpen || !activeSection || activeSteps.length === 0) return;

    let nextIndex = stepIndex;
    while (nextIndex < activeSteps.length) {
      const step = activeSteps[nextIndex];
      if (!step.target || document.querySelector(step.target)) break;
      nextIndex += 1;
    }

    if (nextIndex !== stepIndex) {
      if (nextIndex >= activeSteps.length) {
        onClose();
        return;
      }
      setStepIndex(nextIndex);
      return;
    }

    const target = activeSteps[stepIndex]?.target
      ? document.querySelector(activeSteps[stepIndex].target!)
      : null;
    if (target && "scrollIntoView" in target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeSection, activeSteps, isOpen, onClose, stepIndex]);

  if (!isOpen) return null;

  const currentStep = activeSteps[stepIndex];
  const isLastStep = stepIndex >= activeSteps.length - 1;
  const showSectionPicker = activeSection === null;

  const handleNext = () => {
    if (isLastStep) {
      onComplete(stepIndex);
      onClose();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Onboarding guide"
        className="w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-xl p-4 sm:p-5"
      >
        {showSectionPicker ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose a guide section</h2>
              <p className="text-sm text-muted-foreground">Pick one area to start from step 1.</p>
            </div>
            <div className="grid gap-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setStepIndex(0);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted/60"
                >
                  <div className="font-medium">{section.title}</div>
                  <div className="text-xs text-muted-foreground">{section.description}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : !currentStep ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">No onboarding steps available</h2>
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Step {stepIndex + 1} of {activeSteps.length}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{currentStep.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{currentStep.description}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>Skip</Button>
                <Button variant="outline" onClick={handleBack} disabled={stepIndex === 0}>
                  Back
                </Button>
              </div>
              <Button onClick={handleNext}>{isLastStep ? "Finish" : "Next"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
