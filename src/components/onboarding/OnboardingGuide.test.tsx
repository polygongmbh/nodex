import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingGuide } from "./OnboardingGuide";
import type { OnboardingSection, OnboardingSectionId } from "./onboarding-types";

const sections: OnboardingSection[] = [
  { id: "navigation", title: "Navigation", description: "Navigation help" },
  { id: "filters", title: "Filters", description: "Filter help" },
  { id: "compose", title: "Compose", description: "Compose help" },
];

const baseStepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string }[]> = {
  navigation: [
    {
      id: "navigation-focus",
      title: "Open task context",
      description: "Open a task context.",
      target: '[data-onboarding="task-list"]',
    },
    {
      id: "navigation-breadcrumb",
      title: "Use breadcrumbs",
      description: "Use breadcrumb navigation.",
      target: '[data-onboarding="focused-breadcrumb"]',
    },
    {
      id: "navigation-next",
      title: "Next area",
      description: "Moved forward.",
      target: '[data-onboarding="task-list"]',
    },
  ],
  filters: [],
  compose: [],
};

describe("OnboardingGuide breadcrumb transitions", () => {
  it("auto-advances from step 2 once breadcrumb becomes visible", () => {
    vi.useFakeTimers();
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        width: 320,
        height: 40,
        top: 0,
        left: 0,
        right: 320,
        bottom: 40,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const { rerender } = render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText("Open task context")).toBeInTheDocument();

    rerender(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <div data-onboarding="focused-breadcrumb">Breadcrumb row</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.useRealTimers();
  });

  it("auto-advances to next step when breadcrumb row is no longer visible", () => {
    vi.useFakeTimers();
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        width: 320,
        height: 40,
        top: 0,
        left: 0,
        right: 320,
        bottom: 40,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const { rerender } = render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <div data-onboarding="focused-breadcrumb">Breadcrumb row</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();

    rerender(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <div data-onboarding="focused-breadcrumb" style={{ display: "none" }}>
          Breadcrumb row
        </div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Next area")).toBeInTheDocument();
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.useRealTimers();
  });

  it("shows click hint text in each step card", () => {
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(
      screen.getByText("Click the highlighted area, or use Next.")
    ).toBeInTheDocument();
  });

  it("renders a visual target arrow indicator for targeted steps", () => {
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(screen.getByTestId("onboarding-target-arrow")).toBeInTheDocument();
  });

  it("keeps skip disabled for a few seconds on first step", () => {
    vi.useFakeTimers();
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    const skipButton = screen.getByRole("button", { name: "Skip" });
    expect(skipButton).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(skipButton).toBeEnabled();
    vi.useRealTimers();
  });

  it("reports step metadata when current step changes", () => {
    const onStepChange = vi.fn();
    const stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string }[]> = {
      navigation: [{ id: "navigation-step", title: "Nav", description: "Nav step" }],
      filters: [{ id: "filters-step", title: "Filters", description: "Filters step" }],
      compose: [{ id: "compose-step", title: "Compose", description: "Compose step" }],
    };

    render(
      <OnboardingGuide
        isOpen
        initialSection="all"
        sections={sections}
        stepsBySection={stepsBySection}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onStepChange={onStepChange}
      />
    );

    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "navigation-step",
        stepNumber: 1,
        totalSteps: 3,
        section: "all",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "filters-step",
        stepNumber: 2,
        totalSteps: 3,
        section: "all",
      })
    );
  });
});
