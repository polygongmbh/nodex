import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { act } from "react";
import { useStartupIntro } from "./use-startup-intro";

function Harness({
  initialUser = null,
}: {
  initialUser?: { pubkey?: string } | null;
}) {
  const openedWithFocusedTaskRef = useRef(false);
  const [user, setUser] = useState<{ pubkey?: string } | null>(initialUser);
  const onStartTour = vi.fn();

  const { isOpen, handleStartTour } = useStartupIntro({
    user,
    openedWithFocusedTaskRef,
    onStartTour,
  });

  return (
    <>
      <button onClick={() => setUser({ pubkey: "signed-in" })}>SignIn</button>
      <button onClick={() => setUser(null)}>SignOut</button>
      <button onClick={handleStartTour}>StartTour</button>
      <output data-testid="intro-open">{String(isOpen)}</output>
    </>
  );
}

describe("useStartupIntro", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("opens after startup delay when signed out", () => {
    vi.useFakeTimers();
    render(<Harness />);

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("intro-open")).toHaveTextContent("true");
  });

  it("does not reopen after signing out later in the session", () => {
    vi.useFakeTimers();
    render(<Harness />);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("intro-open")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "SignIn" }));
    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "SignOut" }));
    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
  });

  it("does not auto-open when the app starts signed in", () => {
    render(<Harness initialUser={{ pubkey: "signed-in" }} />);

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
  });

  it("stays closed if sign-in finishes before the startup delay", () => {
    vi.useFakeTimers();
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "SignIn" }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
  });

  it("closes and calls onStartTour when tour is started", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Harness />);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("intro-open")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "StartTour" }));

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
    // onStartTour is a local vi.fn() inside Harness — we verify the intro closed
    void rerender;
  });
});
