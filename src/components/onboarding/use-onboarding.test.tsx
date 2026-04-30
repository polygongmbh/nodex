import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { useOnboarding } from "./use-onboarding";
import { makePerson } from "@/test/fixtures";
import type { Person } from "@/types/person";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";

const peopleSeed: Person[] = [
  makePerson({ pubkey: "alice", name: "alice", displayName: "Alice", isSelected: true }),
  makePerson({ pubkey: "bob", name: "bob", displayName: "Bob", isSelected: false }),
];

function Harness({
  isMobile = true,
  initialUser = null,
}: {
  isMobile?: boolean;
  initialUser?: { pubkey?: string } | null;
}) {
  const [user, setUser] = useState<{ pubkey?: string } | null>(initialUser);
  const [currentView, setCurrentView] = useState<"feed" | "tree" | "kanban" | "calendar" | "list">("tree");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>("task-1");
  const [people, setPeople] = useState<Person[]>(peopleSeed);

  const storeRelayIds = useFilterStore((s) => s.activeRelayIds);
  const storeChannelStates = useFilterStore((s) => s.channelFilterStates);
  const storeSearchQuery = usePreferencesStore((s) => s.searchQuery);
  const authOpen = useAuthModalStore((s) => s.isOpen);

  const onboarding = useOnboarding({
    user,
    isMobile,
    currentView,
    setCurrentView,
    setFocusedTaskId,
    setPeople,
  });

  return (
    <>
      <button onClick={() => onboarding.handleOnboardingStepChange({ id: "mobile-navigation-focus", stepNumber: 1 })}>
        ResetStep
      </button>
      <button onClick={onboarding.handleCloseGuide}>CloseGuide</button>
      <button onClick={onboarding.handleOpenGuide}>OpenGuide</button>
      <button onClick={() => setUser({ pubkey: "signed-in" })}>SignIn</button>
      <button onClick={() => setUser(null)}>SignOut</button>
      <output data-testid="current-view">{currentView}</output>
      <output data-testid="focused-task">{focusedTaskId ?? ""}</output>
      <output data-testid="search-query">{storeSearchQuery}</output>
      <output data-testid="relay-ids">{Array.from(storeRelayIds).sort().join(",")}</output>
      <output data-testid="channel-state">{storeChannelStates.get("general") || "neutral"}</output>
      <output data-testid="selected-people">
        {people.filter((person) => person.isSelected).map((person) => person.pubkey).join(",")}
      </output>
      <output data-testid="auth-open">{String(authOpen)}</output>
      <output data-testid="guide-open">{String(onboarding.isOnboardingOpen)}</output>
    </>
  );
}

describe("useOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFilterStore.setState({
      activeRelayIds: new Set(["relay-one"]),
      channelFilterStates: new Map([["general", "included"]]),
    });
    usePreferencesStore.setState({ searchQuery: "draft" });
    useAuthModalStore.setState({ isOpen: false });
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

  it("opens auth after guide close when user is signed out", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "CloseGuide" }));

    expect(screen.getByTestId("auth-open")).toHaveTextContent("true");
  });

  it("opens the guide manually", () => {
    render(<Harness isMobile={false} />);

    fireEvent.click(screen.getByRole("button", { name: "OpenGuide" }));

    expect(screen.getByTestId("guide-open")).toHaveTextContent("true");
  });

});
