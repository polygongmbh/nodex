import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTaskPublishControls } from "./use-task-publish-controls";
import { makeRelay, makeTask } from "@/test/fixtures";
import type { Relay, Task } from "@/types";

vi.mock("@/lib/notifications", () => ({
  notifyDisconnectedSelectedFeeds: vi.fn(),
  notifyNeedSigninModify: vi.fn(),
  notifyNeedSigninPost: vi.fn(),
}));

function Harness({
  canModifyContent = true,
  relays = [makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" })],
  tasks = [makeTask({ id: "a".repeat(64), relays: ["relay-one"] }) as Task],
  effectiveActiveRelayIds = new Set(["relay-one"]),
}: {
  canModifyContent?: boolean;
  relays?: Relay[];
  tasks?: Task[];
  effectiveActiveRelayIds?: Set<string>;
}) {
  const [authCount, setAuthCount] = useState(0);
  const [publishCount, setPublishCount] = useState(0);
  const controls = useTaskPublishControls({
    allTasks: tasks,
    relays,
    effectiveActiveRelayIds,
    demoFeedActive: false,
    canModifyContent,
    handleOpenAuthModal: () => setAuthCount((count) => count + 1),
    publishEvent: async () => {
      setPublishCount((count) => count + 1);
      return { success: true };
    },
    t: ((key: string) => key) as unknown as TFunction,
  });

  return (
    <>
      <button onClick={() => controls.guardInteraction("modify")}>GuardModify</button>
      <button onClick={() => controls.publishTaskStateUpdate("a".repeat(64), "done")}>PublishState</button>
      <output data-testid="interaction-blocked">{String(controls.isInteractionBlocked)}</output>
      <output data-testid="relay-url">{controls.resolveTaskOriginRelay("a".repeat(64)).relayUrls.join(",")}</output>
      <output data-testid="publish-count">{String(publishCount)}</output>
      <output data-testid="auth-count">{String(authCount)}</output>
    </>
  );
}

describe("useTaskPublishControls", () => {
  it("resolves the origin relay for a task", () => {
    render(<Harness />);
    expect(screen.getByTestId("relay-url")).toHaveTextContent("wss://relay.one");
  });

  it("opens auth when interaction is attempted while signed out", () => {
    render(<Harness canModifyContent={false} />);
    fireEvent.click(screen.getByRole("button", { name: "GuardModify" }));
    expect(screen.getByTestId("auth-count")).toHaveTextContent("1");
    expect(screen.getByTestId("interaction-blocked")).toHaveTextContent("true");
  });

  it("publishes task state updates via the resolved relay", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "PublishState" }));
    await waitFor(() => {
      expect(screen.getByTestId("publish-count")).toHaveTextContent("1");
    });
  });
});
