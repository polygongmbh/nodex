import { render, screen, within } from "@testing-library/react";
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
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button")).toHaveLength(3);
    vi.useRealTimers();
  });

  it("omits the extra action when create account is unavailable", () => {
    vi.useFakeTimers();
    render(
      <WelcomeModal
        isOpen
        showCreateAccount={false}
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    advanceOpenAnimation();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    vi.useRealTimers();
  });

  it("does not render when closed", () => {
    render(
      <WelcomeModal
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
      <WelcomeModal
        isOpen
        showCreateAccount
        onStartTour={vi.fn()}
        onCreateAccount={vi.fn()}
        onSignIn={vi.fn()}
      />
    );

    rerender(
      <WelcomeModal
        isOpen={false}
        showCreateAccount
        onStartTour={vi.fn()}
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
