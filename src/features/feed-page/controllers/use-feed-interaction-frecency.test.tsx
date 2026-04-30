import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMemo } from "react";
import { createFeedInteractionBus } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedInteractionProvider, useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedInteractionFrecency } from "./use-feed-interaction-frecency";

function Harness() {
  const { channelFrecencyState, personFrecencyState, interactionEffects } = useFeedInteractionFrecency();
  const bus = useMemo(
    () =>
      createFeedInteractionBus({
        handlers: {
          "sidebar.channel.toggle": async () => {},
          "filter.applyAuthorExclusive": async () => {},
        },
        effects: interactionEffects,
      }),
    [interactionEffects]
  );

  return (
    <FeedInteractionProvider bus={bus}>
      <DispatchButtons />
      <output data-testid="channel-score">{String(channelFrecencyState.ops?.score ?? 0)}</output>
      <output data-testid="person-score">{String(personFrecencyState.alice?.score ?? 0)}</output>
    </FeedInteractionProvider>
  );
}

function DispatchButtons() {
  const dispatch = useFeedInteractionDispatch();

  return (
    <>
      <button onClick={() => void dispatch({ type: "sidebar.channel.toggle", channelId: "ops" })}>
        ToggleChannel
      </button>
      <button
        onClick={() =>
          void dispatch({
            type: "filter.applyAuthorExclusive",
            author: {
              pubkey: "alice",
              name: "alice",
              displayName: "Alice",
              isSelected: false,
            },
          })
        }
      >
        AuthorExclusive
      </button>
    </>
  );
}

describe("useFeedInteractionFrecency", () => {
  it("updates frecency from handled interaction intents", async () => {
    render(<Harness />);

    expect(screen.getByTestId("channel-score")).toHaveTextContent("0");
    expect(screen.getByTestId("person-score")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "ToggleChannel" }));
    fireEvent.click(screen.getByRole("button", { name: "AuthorExclusive" }));

    await waitFor(() => {
      expect(Number(screen.getByTestId("channel-score").textContent || "0")).toBeGreaterThan(0);
      expect(Number(screen.getByTestId("person-score").textContent || "0")).toBeGreaterThan(0);
    });
  });
});
