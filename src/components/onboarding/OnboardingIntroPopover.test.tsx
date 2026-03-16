import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingIntroPopover } from "./OnboardingIntroPopover";

describe("OnboardingIntroPopover", () => {
  it("renders intro copy and actions when open", () => {
    render(
      <OnboardingIntroPopover
        isOpen
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Welcome to Nodex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the Tour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("calls handlers for all actions", () => {
    const onStartTour = vi.fn();
    const onCreateAccount = vi.fn();
    const onSignIn = vi.fn();

    render(
      <OnboardingIntroPopover
        isOpen
        onStartTour={onStartTour}
        onCreateAccount={onCreateAccount}
        onSignIn={onSignIn}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start the Tour" }));
    expect(onStartTour).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("does not render when closed", () => {
    render(
      <OnboardingIntroPopover
        isOpen={false}
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
