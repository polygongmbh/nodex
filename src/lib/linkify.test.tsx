import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { getStandaloneEmbeddableUrls, linkifyContent } from "./linkify";
import type { Person } from "@/types/person";
import { hexPubkeyToNpub } from "@/lib/nostr/user-facing-pubkey";

const alice: Person = {
  id: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  nip05: "alice@example.com",
  isOnline: true,
  isSelected: false,
};

describe("linkifyContent interaction styles", () => {
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

  it("renders @mentions with resolved @name labels and supports person click callback", () => {
    const onMentionClick = vi.fn();

    render(
      <div>
        {linkifyContent(`Assign to @${alice.id}`, undefined, {
          people: [alice],
          onMentionClick,
        })}
      </div>
    );

    const mention = screen.getByRole("button", { name: "Open user alice" });
    expect(mention).toHaveTextContent("@alice");

    fireEvent.click(mention);
    expect(onMentionClick).toHaveBeenCalledWith(alice);
  });

  it("supports unresolved pubkey mention clicks via fallback person", () => {
    const unresolvedPubkey = "b".repeat(64);
    const onMentionClick = vi.fn();

    render(
      <div>
        {linkifyContent(`Assign to @${unresolvedPubkey}`, undefined, {
          onMentionClick,
        })}
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: /open user npub1/i }));
    expect(onMentionClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: unresolvedPubkey,
        isOnline: false,
        isSelected: false,
      })
    );
  });

  it("linkifies nostr:npub mentions and routes clicks via mention callback", () => {
    const unresolvedPubkey = "b".repeat(64);
    const npub = hexPubkeyToNpub(unresolvedPubkey);
    expect(npub).toBeTruthy();
    const onMentionClick = vi.fn();

    render(
      <div>
        {linkifyContent(`Assign to nostr:${npub}`, undefined, {
          onMentionClick,
        })}
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: /open user npub1/i }));
    expect(onMentionClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: unresolvedPubkey,
      })
    );
  });

  it("keeps original mention token as hover title after resolving display label", () => {
    render(
      <div>
        {linkifyContent("Assign to @alice@example.com", undefined, {
          people: [alice],
        })}
      </div>
    );

    expect(screen.getByText("@alice")).toHaveAttribute("title", "@alice@example.com");
  });

  it("formats raw pubkey mention labels as npub", () => {
    const hexMention = "b".repeat(64);

    render(<div>{linkifyContent(`Assign to @${hexMention}`)}</div>);

    const mention = screen.getByText((value) => value.startsWith("@npub1"));
    expect(mention).toBeInTheDocument();
    expect(mention).toHaveAttribute("title", expect.stringContaining("@npub1"));
  });

  it("replaces a standalone embeddable URL line with an embed", () => {
    render(<div>{linkifyContent("https://youtu.be/dQw4w9WgXcQ")}</div>);

    expect(screen.queryByRole("link", { name: "https://youtu.be/dQw4w9WgXcQ" })).not.toBeInTheDocument();
    expect(screen.getByTitle("Embedded video")).toBeInTheDocument();
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
