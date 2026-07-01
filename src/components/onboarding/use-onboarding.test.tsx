import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useOnboarding } from "./use-onboarding";
import { useOnboardingStore } from "./onboarding-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

const dispatch = vi.fn();
vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatch,
}));

function Harness({
  isMobile = true,
  initialUser = null,
}: {
  isMobile?: boolean;
  initialUser?: { pubkey?: string } | null;
}) {
  const [user, setUser] = useState<{ pubkey?: string } | null>(initialUser);
  const [currentView] = useState<ViewType>("tree");

  const searchQuery = useFilterStore((s) => s.searchQuery);
  const storeRelayIds = useFilterStore((s) => s.activeRelayIds);
  const storeChannelStates = useFilterStore((s) => s.channelFilterStates);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const authOpen = useAuthModalStore((s) => s.isOpen);

  const onboarding = useOnboarding({
    user,
    isMobile,
    currentView,
    onBeforeResetFocusedTaskScope: () => {},
  });

  return (
    <>
      <button onClick={() => onboarding.handleOnboardingStepChange({ id: "mobile-navigation-focus", stepNumber: 1 })}>
        ResetStep
      </button>
      <button onClick={onboarding.handleCloseGuide}>CloseGuide</button>
      <button onClick={() => setUser({ pubkey: "signed-in" })}>SignIn</button>
      <button onClick={() => setUser(null)}>SignOut</button>
      <output data-testid="search-query">{searchQuery}</output>
      <output data-testid="relay-ids">{Array.from(storeRelayIds).sort().join(",")}</output>
      <output data-testid="channel-state">{storeChannelStates.get("general") || "neutral"}</output>
      <output data-testid="selected-people">
        {Array.from(selectedPubkeys).join(",")}
      </output>
      <output data-testid="auth-open">{String(authOpen)}</output>
      <output data-testid="guide-open">{String(onboarding.isOnboardingOpen)}</output>
    </>
  );
}

describe("useOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    dispatch.mockClear();
    useOnboardingStore.getState().closeGuide();
    useFilterStore.setState({
      activeRelayIds: new Set(["relay-one"]),
      channelFilterStates: new Map([["general", "included"]]),
      searchQuery: "draft",
      selectedPubkeys: new Set(["alice"]),
    });
    useAuthModalStore.setState({ isOpen: false });
  });

  it("resets view and filters on the mobile navigation-focus step", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "ResetStep" }));

    // View + focus reset go through the interaction bus; filters reset directly.
    expect(dispatch).toHaveBeenCalledWith({ type: "ui.view.change", view: "feed" });
    expect(dispatch).toHaveBeenCalledWith({ type: "task.focus.change", taskId: null });
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

  it("reflects the store's open state", () => {
    render(<Harness isMobile={false} />);

    act(() => {
      useOnboardingStore.getState().openGuide();
    });

    expect(screen.getByTestId("guide-open")).toHaveTextContent("true");
  });
});
