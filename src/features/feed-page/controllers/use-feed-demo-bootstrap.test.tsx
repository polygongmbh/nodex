import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useFeedDemoBootstrap } from "./use-feed-demo-bootstrap";
import { makeTask } from "@/test/fixtures";
import type { Task } from "@/types";

function Harness({
  totalTasks = 0,
  demoFeedActive = false,
}: {
  totalTasks?: number;
  demoFeedActive?: boolean;
}) {
  const [guideDemoFeedEnabled, setGuideDemoFeedEnabled] = useState(false);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));
  const navigateRef = useRef(vi.fn());
  const seedCachedKind0EventsRef = useRef(vi.fn());

  const { ensureGuideDataAvailable } = useFeedDemoBootstrap({
    totalTasks,
    demoFeedActive,
    demoRelayId: "demo",
    getDemoSeedTasks: () => [makeTask({ id: "demo-task" })],
    demoKind0Events: [{ kind: 0 }],
    setGuideDemoFeedEnabled,
    setLocalTasks,
    seedCachedKind0Events: seedCachedKind0EventsRef.current,
    setActiveRelayIds,
    navigate: navigateRef.current,
  });

  return (
    <>
      <button onClick={ensureGuideDataAvailable}>Bootstrap</button>
      <output data-testid="guide-demo-enabled">{String(guideDemoFeedEnabled)}</output>
      <output data-testid="local-task-count">{String(localTasks.length)}</output>
      <output data-testid="active-relays">{Array.from(activeRelayIds).join(",")}</output>
      <output data-testid="navigate-count">{String(navigateRef.current.mock.calls.length)}</output>
      <output data-testid="seed-kind0-count">{String(seedCachedKind0EventsRef.current.mock.calls.length)}</output>
    </>
  );
}

describe("useFeedDemoBootstrap", () => {
  it("hydrates the demo feed and navigates when onboarding needs seed data", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Bootstrap" }));

    expect(screen.getByTestId("guide-demo-enabled")).toHaveTextContent("true");
    expect(screen.getByTestId("local-task-count")).toHaveTextContent("1");
    expect(screen.getByTestId("active-relays")).toHaveTextContent("relay-one,demo");
    expect(screen.getByTestId("navigate-count")).toHaveTextContent("1");
    expect(screen.getByTestId("seed-kind0-count")).toHaveTextContent("1");
  });

  it("does nothing when tasks already exist", () => {
    render(<Harness totalTasks={2} />);

    fireEvent.click(screen.getByRole("button", { name: "Bootstrap" }));

    expect(screen.getByTestId("guide-demo-enabled")).toHaveTextContent("false");
    expect(screen.getByTestId("local-task-count")).toHaveTextContent("0");
    expect(screen.getByTestId("active-relays")).toHaveTextContent("relay-one");
    expect(screen.getByTestId("navigate-count")).toHaveTextContent("0");
    expect(screen.getByTestId("seed-kind0-count")).toHaveTextContent("0");
  });
});
