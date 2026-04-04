import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingIntroPopover } from "./OnboardingIntroPopover";

describe("OnboardingIntroPopover", () => {
  const advanceOpenAnimation = () => {
    act(() => {
      vi.advanceTimersByTime(32);
    });
  };

  it("renders intro copy and actions when open", () => {
    vi.useFakeTimers();
    render(
      <OnboardingIntroPopover
        isOpen
        showCreateAccount
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Welcome to Nodex" })).toHaveAttribute("data-state", "closed");

    advanceOpenAnimation();

    expect(screen.getByRole("dialog", { name: "Welcome to Nodex" })).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("button", { name: "Start the Tour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("calls handlers for all actions", () => {
    vi.useFakeTimers();
    const onStartTour = vi.fn();
    const onCreateAccount = vi.fn();
    const onSignIn = vi.fn();

    render(
      <OnboardingIntroPopover
        isOpen
        showCreateAccount
        onStartTour={onStartTour}
        onCreateAccount={onCreateAccount}
        onSignIn={onSignIn}
      />
    );

    advanceOpenAnimation();

    fireEvent.click(screen.getByRole("button", { name: "Start the Tour" }));
    expect(onStartTour).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("hides create account when Noas sign-up is not configured", () => {
    vi.useFakeTimers();
    render(
      <OnboardingIntroPopover
        isOpen
        showCreateAccount={false}
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();

    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not render when closed", () => {
    render(
      <OnboardingIntroPopover
        isOpen={false}
        showCreateAccount
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog mounted briefly while fading out", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <OnboardingIntroPopover
        isOpen
        showCreateAccount
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    rerender(
      <OnboardingIntroPopover
        isOpen={false}
        showCreateAccount
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Welcome to Nodex" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Welcome to Nodex" })).toHaveAttribute("data-state", "closed");

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
