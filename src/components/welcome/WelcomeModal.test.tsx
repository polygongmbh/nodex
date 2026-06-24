import { fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { WelcomeModal } from "./WelcomeModal";

describe("WelcomeModal", () => {
  const advanceOpenAnimation = () => {
    act(() => {
      vi.advanceTimersByTime(32);
    });
  };

  it("renders the extra action when create account is available", () => {
    vi.useFakeTimers();
    render(
      <WelcomeModal
        isOpen
        showCreateAccount
        onDismiss={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();

    const dialog = screen.getByRole("dialog");
    // dismiss (X) + create account + sign in
    expect(within(dialog).getAllByRole("button")).toHaveLength(3);
    vi.useRealTimers();
  });

  it("omits the extra action when create account is unavailable", () => {
    vi.useFakeTimers();
    render(
      <WelcomeModal
        isOpen
        showCreateAccount={false}
        onDismiss={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();

    const dialog = screen.getByRole("dialog");
    // dismiss (X) + sign in
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    vi.useRealTimers();
  });

  it("dismisses via the close button", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WelcomeModal
        isOpen
        showCreateAccount
        onDismiss={onDismiss}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();
    fireEvent.click(screen.getByTestId("welcome-dismiss"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("dismisses when clicking the overlay scrim", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WelcomeModal
        isOpen
        showCreateAccount
        onDismiss={onDismiss}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();
    const scrim = document.querySelector(".bg-overlay-scrim") as HTMLElement;
    fireEvent.click(scrim);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not render when closed", () => {
    render(
      <WelcomeModal
        isOpen={false}
        showCreateAccount
        onDismiss={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog mounted briefly while fading out", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <WelcomeModal
        isOpen
        showCreateAccount
        onDismiss={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    rerender(
      <WelcomeModal
        isOpen={false}
        showCreateAccount
        onDismiss={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
