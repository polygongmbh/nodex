import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingGuide } from "./OnboardingGuide";
import type { OnboardingSection, OnboardingSectionId, OnboardingStep } from "./onboarding-types";

const sections: OnboardingSection[] = [
  {
    id: "views",
    title: "Views",
    description: "Learn view switching",
  },
  {
    id: "filters",
    title: "Filters",
    description: "Learn filters",
  },
];

const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
  views: [
    {
      id: "views-1",
      title: "View switcher",
      description: "Switch views here",
      target: '[data-onboarding="view-switcher"]',
    },
  ],
  filters: [
    {
      id: "filters-1",
      title: "Channels",
      description: "Filter channels here",
      target: '[data-onboarding="channels-section"]',
    },
  ],
  focus: [],
  compose: [],
};

describe("OnboardingGuide", () => {
  it("auto mode starts from first step when section is preset", () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    render(
      <>
        <div data-onboarding="view-switcher" />
        <OnboardingGuide
          isOpen
          initialSection="all"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={onClose}
          onComplete={onComplete}
        />
      </>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("View switcher")).toBeInTheDocument();
  });

  it("manual mode opens section picker and starts selected section at step 1", () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    render(
      <>
        <div data-onboarding="channels-section" />
        <OnboardingGuide
          isOpen
          initialSection={null}
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={onClose}
          onComplete={onComplete}
        />
      </>
    );

    expect(screen.getByText("Choose a guide section")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.getByText("Channels")).toBeInTheDocument();
  });

  it("marks complete when final step is reached", () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    render(
      <>
        <div data-onboarding="view-switcher" />
        <OnboardingGuide
          isOpen
          initialSection="views"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={onClose}
          onComplete={onComplete}
        />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("skips missing targets safely", () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    render(
      <OnboardingGuide
        isOpen
        initialSection="views"
        sections={sections}
        stepsBySection={{
          views: [
            {
              id: "missing",
              title: "Missing",
              description: "Missing target",
              target: '[data-onboarding="missing-target"]',
            },
            {
              id: "fallback",
              title: "Fallback",
              description: "Valid target",
              target: undefined,
            },
          ],
          filters: [],
          focus: [],
          compose: [],
        }}
        onClose={onClose}
        onComplete={onComplete}
      />
    );

    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
