import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReactionsRow } from "./ReactionsRow";
import {
  __resetReactionsRegistryForTests,
  getReactionsForTarget,
  mergeReactionEvents,
} from "@/features/feed-page/stores/reactions-registry";
import { NostrEventKind } from "@/lib/nostr/types";

const TARGET = "task-a";

function reaction(id: string, pubkey: string, content: string) {
  return { id, pubkey, content, tags: [["e", TARGET]], kind: NostrEventKind.Reaction };
}

function renderRow() {
  mergeReactionEvents([
    reaction("r1", "alice", "👍"),
    reaction("r2", "bob", "👍"),
    reaction("r3", "carol", "❤️"),
  ]);
  return render(
    <ReactionsRow
      targetId={TARGET}
      reactions={getReactionsForTarget(TARGET)}
      onReact={() => {}}
      onUnreact={() => {}}
    />,
  );
}

beforeEach(() => {
  __resetReactionsRegistryForTests();
});

afterEach(() => {
  cleanup();
});

describe("ReactionsRow who-reacted popup", () => {
  it("stays closed until a chip is hovered", () => {
    renderRow();
    expect(screen.queryByTestId(`reactions-who-${TARGET}`)).toBeNull();
  });

  it("opens a popup listing every emoji regardless of which chip is hovered", () => {
    renderRow();
    fireEvent.pointerEnter(screen.getByTestId(`reaction-chip-${TARGET}-👍`), { pointerType: "mouse" });

    expect(screen.getByTestId(`reactions-who-${TARGET}`)).toBeTruthy();
    const heartRow = screen.getByTestId(`reactions-who-${TARGET}-❤️`);
    const thumbRow = screen.getByTestId(`reactions-who-${TARGET}-👍`);
    expect(heartRow).toBeTruthy();
    // The 👍 line should carry both reactors' labels (non-empty beyond the emoji).
    expect(thumbRow.textContent?.replace("👍", "").trim().length ?? 0).toBeGreaterThan(0);
  });

  it("closes the popup when the chip is no longer hovered", async () => {
    renderRow();
    const chip = screen.getByTestId(`reaction-chip-${TARGET}-👍`);
    fireEvent.pointerEnter(chip, { pointerType: "mouse" });
    expect(screen.getByTestId(`reactions-who-${TARGET}`)).toBeTruthy();
    fireEvent.pointerLeave(chip, { pointerType: "mouse" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByTestId(`reactions-who-${TARGET}`)).toBeNull();
  });
});
