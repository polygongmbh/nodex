import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { act } from "react";
import { useIndexOnboarding } from "./use-index-onboarding";
import { makeChannel, makePerson } from "@/test/fixtures";
import type { Channel } from "@/types";
import type { Person } from "@/types/person";

const channels: Channel[] = [
  makeChannel({ id: "general", name: "general" }),
];

const peopleSeed: Person[] = [
  makePerson({ id: "alice", name: "alice", displayName: "Alice", isSelected: true }),
  makePerson({ id: "bob", name: "bob", displayName: "Bob", isSelected: false }),
];

function Harness({
  isMobile = true,
  shouldForceAuthAfterOnboarding = false,
  initialUser = null,
}: {
  isMobile?: boolean;
  shouldForceAuthAfterOnboarding?: boolean;
  initialUser?: { pubkey?: string } | null;
}) {
  const openedWithFocusedTaskRef = useRef(false);
  const [user, setUser] = useState<{ pubkey?: string } | null>(initialUser);
  const [currentView, setCurrentView] = useState<"feed" | "tree" | "kanban" | "calendar" | "list">("tree");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>("task-1");
  const [searchQuery, setSearchQuery] = useState("draft");
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    new Map([["general", "included"]])
  );
  const [people, setPeople] = useState<Person[]>(peopleSeed);
  const [authOpen, setAuthOpen] = useState(false);

  const onboarding = useIndexOnboarding({
    user,
    isMobile,
    currentView,
    channels,
    openedWithFocusedTaskRef,
    shouldForceAuthAfterOnboarding,
    setCurrentView,
    setFocusedTaskId,
    setSearchQuery,
    setActiveRelayIds,
    setChannelFilterStates,
    setPeople,
    setIsAuthModalOpen: setAuthOpen,
  });

  return (
    <>
      <button onClick={() => onboarding.handleOnboardingStepChange({ id: "mobile-navigation-focus", stepNumber: 1 })}>
        ResetStep
      </button>
      <button onClick={() => onboarding.handleCompleteGuide(3)}>CompleteGuide</button>
      <button onClick={onboarding.handleCloseGuide}>CloseGuide</button>
      <button onClick={onboarding.handleOpenGuide}>OpenGuide</button>
      <button onClick={() => setUser({ pubkey: "signed-in" })}>SignIn</button>
      <button onClick={() => setUser(null)}>SignOut</button>
      <output data-testid="current-view">{currentView}</output>
      <output data-testid="focused-task">{focusedTaskId ?? ""}</output>
      <output data-testid="search-query">{searchQuery}</output>
      <output data-testid="relay-ids">{Array.from(activeRelayIds).sort().join(",")}</output>
      <output data-testid="channel-state">{channelFilterStates.get("general") || "neutral"}</output>
      <output data-testid="selected-people">
        {people.filter((person) => person.isSelected).map((person) => person.id).join(",")}
      </output>
      <output data-testid="auth-open">{String(authOpen)}</output>
      <output data-testid="guide-open">{String(onboarding.isOnboardingOpen)}</output>
      <output data-testid="intro-open">{String(onboarding.isOnboardingIntroOpen)}</output>
    </>
  );
}

describe("useIndexOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("resets view and filters on the mobile navigation-focus step", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "ResetStep" }));

    expect(screen.getByTestId("current-view")).toHaveTextContent("feed");
    expect(screen.getByTestId("focused-task")).toHaveTextContent("");
    expect(screen.getByTestId("search-query")).toHaveTextContent("");
    expect(screen.getByTestId("relay-ids")).toHaveTextContent("");
    expect(screen.getByTestId("channel-state")).toHaveTextContent("neutral");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("opens auth after guide close when sign-in should be forced", () => {
    render(<Harness shouldForceAuthAfterOnboarding />);

    fireEvent.click(screen.getByRole("button", { name: "CompleteGuide" }));
    fireEvent.click(screen.getByRole("button", { name: "CloseGuide" }));

    expect(screen.getByTestId("auth-open")).toHaveTextContent("true");
  });

  it("opens the guide manually", () => {
    render(<Harness isMobile={false} />);

    fireEvent.click(screen.getByRole("button", { name: "OpenGuide" }));

    expect(screen.getByTestId("guide-open")).toHaveTextContent("true");
  });

  it("does not reopen the welcome dialog after signing out later in the session", () => {
    vi.useFakeTimers();
    render(<Harness />);

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("intro-open")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "SignIn" }));
    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "SignOut" }));
    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
  });

  it("does not auto-open the welcome dialog when the app starts signed in", () => {
    render(<Harness initialUser={{ pubkey: "signed-in" }} />);

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
  });

  it("keeps the welcome dialog closed if sign-in finishes before the startup delay", () => {
    vi.useFakeTimers();
    render(<Harness />);

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "SignIn" }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("intro-open")).toHaveTextContent("false");
  });
});
