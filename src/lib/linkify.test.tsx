import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { getStandaloneEmbeddableUrls, linkifyContent } from "./linkify";
import type { Person } from "@/types/person";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

const alice: Person = {
  pubkey: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  nip05: "alice@example.com",
};

describe("linkifyContent interaction styles", () => {
  const renderWithDispatch = (content: ReactNode) => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });
    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <div>{content}</div>
      </FeedInteractionProvider>
    );
    return dispatch;
  };

  it("parses hashtags and URLs and triggers hashtag filtering", () => {
    const onHashtagClick = vi.fn();

    render(<div>{linkifyContent("Ship #frontend https://example.com", onHashtagClick)}</div>);

    const hashtag = screen.getByRole("button", { name: "Filter by #frontend" });
    const url = screen.getByRole("link", { name: "https://example.com" });

    expect(url).toHaveAttribute("href", "https://example.com");
    expect(url).toHaveAttribute("target", "_blank");

    fireEvent.click(hashtag);
    expect(onHashtagClick).toHaveBeenCalledWith("frontend");
  });

  it("renders plain hashtags when plainHashtags is enabled", () => {
    render(<div>{linkifyContent("Ship #frontend", vi.fn(), { plainHashtags: true })}</div>);

    const hashtag = screen.getByRole("button", { name: "Filter by #frontend" });
    expect(hashtag).toBeInTheDocument();
  });

  it("does not linkify hashtags or mentions that are attached to non-whitespace prefixes", () => {
    render(
      <div>
        {linkifyContent("Ship(#frontend) email@alice.test and @alice@example.com", undefined, {
          people: [alice],
        })}
      </div>
    );

    expect(screen.queryByRole("button", { name: "Filter by #frontend" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Person actions for alice" })).toHaveLength(1);
    expect(screen.getByText((value) => value.includes("Ship(#frontend)"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "email@alice.test" })).toHaveAttribute("href", "mailto:email@alice.test");
  });

  it("keeps long inline hashtag and mention tokens breakable for clamped content", () => {
    render(
      <div>
        {linkifyContent("Ping @averyveryveryverylongusername about #averyveryveryverylongtag", undefined, {
          people: [{
            ...alice,
            pubkey: "c".repeat(64),
            name: "averyveryveryverylongusername",
            displayName: "Avery Long",
          }],
        })}
      </div>
    );

    const mention = screen.getByRole("button", { name: "Person actions for averyveryveryverylongusername" });
    const hashtag = screen.getByRole("button", { name: "Filter by #averyveryveryverylongtag" });

    expect(mention.className).toContain("break-all");
    expect(mention.className).toContain("inline");
    expect(hashtag.className).toContain("break-all");
    expect(hashtag.className).toContain("inline");
  });

  it("renders @mentions with resolved @name labels and supports modifier shortcuts", () => {
    const dispatch = renderWithDispatch(
      linkifyContent(`Assign to @${alice.pubkey}`, undefined, {
        people: [alice],
      })
    );

    const mention = screen.getByRole("button", { name: "Person actions for alice" });
    expect(mention).toHaveTextContent("@alice");

    fireEvent.click(mention, { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "person.filter.exclusive", person: alice });
  });

  it("supports unresolved pubkey mention shortcuts via fallback person", () => {
    const unresolvedPubkey = "b".repeat(64);
    const dispatch = renderWithDispatch(linkifyContent(`Assign to @${unresolvedPubkey}`));

    fireEvent.click(screen.getByRole("button", { name: /person actions for npub1/i }), { altKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "person.compose.mention",
      person: expect.objectContaining({
        pubkey: unresolvedPubkey,
      }),
    });
  });

  it("routes Ctrl/Cmd+Alt mention shortcuts to filter and mention before opening the menu", () => {
    const dispatch = renderWithDispatch(
      linkifyContent(`Assign to @${alice.pubkey}`, undefined, {
        people: [alice],
      })
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Person actions for alice" }), {
      button: 0,
      ctrlKey: true,
      altKey: true,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "person.filterAndMention", person: alice });
  });

  it("linkifies nostr:npub mentions and routes modifier clicks through fallback person actions", () => {
    const unresolvedPubkey = "b".repeat(64);
    const npub = "npub1hwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwasxw04hu";
    const dispatch = renderWithDispatch(linkifyContent(`Assign to nostr:${npub}`));

    fireEvent.click(screen.getByRole("button", { name: /person actions for npub1/i }), { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "person.filter.exclusive",
      person: expect.objectContaining({
        pubkey: unresolvedPubkey,
      }),
    });
  });

  it("does not add a tooltip when the mention opens a profile popover", () => {
    render(
      <div>
        {linkifyContent("Assign to @alice@example.com", undefined, {
          people: [alice],
        })}
      </div>
    );

    expect(screen.getByText("@alice")).not.toHaveAttribute("title");
  });

  it("formats raw pubkey mention labels as npub", () => {
    const hexMention = "b".repeat(64);

    render(<div>{linkifyContent(`Assign to @${hexMention}`)}</div>);

    const mention = screen.getByText((value) => value.startsWith("@npub1"));
    expect(mention).toBeInTheDocument();
    expect(mention).not.toHaveAttribute("title");
  });

  it("replaces a standalone embeddable URL line with an embed", () => {
    render(<div>{linkifyContent("https://youtu.be/dQw4w9WgXcQ")}</div>);

    expect(screen.queryByRole("link", { name: "https://youtu.be/dQw4w9WgXcQ" })).not.toBeInTheDocument();
    expect(screen.getByTitle("Embedded video")).toBeInTheDocument();
  });

  it("keeps standalone audio embeds inline without triggering preview open", () => {
    const onStandaloneMediaClick = vi.fn();

    const { container } = render(
      <div>
        {linkifyContent("https://example.com/voice-note.mp3", undefined, {
          onStandaloneMediaClick,
        })}
      </div>
    );

    fireEvent.click(container.querySelector("audio") as HTMLAudioElement);

    expect(onStandaloneMediaClick).not.toHaveBeenCalled();
  });

  it("preserves multiline rendering and basic markdown formatting", () => {
    render(<div>{linkifyContent("first line\n**bold** and *italic* and `code`")}</div>);

    const bold = screen.getByText("bold");
    expect(bold.tagName).toBe("STRONG");
    expect(bold.parentElement).toHaveTextContent("first line");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("renders markdown heading syntax as a heading-like inline token", () => {
    render(<div>{linkifyContent("# headline")}</div>);

    const headline = screen.getByText("headline");
    expect(headline.tagName).toBe("SPAN");
    expect(headline).toBeInTheDocument();
  });

  it("renders consecutive markdown bullet items inside a single list", () => {
    const { container } = render(<div>{linkifyContent("Overview\n- first item\n- second item")}</div>);

    const list = container.querySelector("ul");
    expect(list).toBeInTheDocument();
    expect(list).toHaveClass("list-disc");
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(within(list as HTMLUListElement).getByText("first item")).toBeInTheDocument();
    expect(within(list as HTMLUListElement).getByText("second item")).toBeInTheDocument();
  });

  it("keeps loose markdown list items from adding extra paragraph spacing", () => {
    const { container } = render(<div>{linkifyContent("- first item\n\n- second item")}</div>);

    const list = container.querySelector("ul");
    const listItems = container.querySelectorAll("li");

    expect(list).toHaveClass("space-y-0.5");
    expect(listItems).toHaveLength(2);
    expect(listItems[0]).toHaveClass("[&>p]:mb-0");
    expect(within(listItems[0] as HTMLLIElement).getByText("first item")).toBeInTheDocument();
    expect(within(listItems[1] as HTMLLIElement).getByText("second item")).toBeInTheDocument();
  });

  it("renders long nostr identifiers as mention tokens inside a breakable markdown block", () => {
    const npub = `nostr:npub1${"q".repeat(58)}`;
    const { container } = render(<div>{linkifyContent(`Assign to ${npub}`)}</div>);

    expect(screen.getByText((value) => value.startsWith("@npub1"))).toBeInTheDocument();
    expect(container.querySelector(".break-words")).toBeInTheDocument();
    expect(container.querySelector(".whitespace-normal")).toBeInTheDocument();
  });

  it("returns standalone embeddable urls only", () => {
    const urls = getStandaloneEmbeddableUrls(
      [
        "intro text",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://example.com",
        "https://example.com/photo.png",
      ].join("\n")
    );

    expect(urls).toEqual([
      "https://youtu.be/dQw4w9WgXcQ",
      "https://example.com/photo.png",
    ]);
  });
});
