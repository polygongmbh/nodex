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

    const hashtag = screen.getByRole("button", { name: "#frontend" });
    const url = screen.getByRole("link", { name: "https://example.com" });

    expect(url).toHaveAttribute("href", "https://example.com");
    expect(url).toHaveAttribute("target", "_blank");

    fireEvent.click(hashtag);
    expect(onHashtagClick).toHaveBeenCalledWith("frontend");
  });

  it("renders uppercase hex tokens as inline color swatches, not as hashtag filters", () => {
    const onHashtagClick = vi.fn();
    render(<div>{linkifyContent("palette bg #FFAA00 keep #fee end", onHashtagClick)}</div>);

    expect(screen.queryByRole("button", { name: "Filter by #FFAA00" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter by #ffaa00" })).not.toBeInTheDocument();

    const swatchLabel = screen.getByText((_text, element) => element?.textContent === "#FFAA00");
    expect(swatchLabel).toBeInTheDocument();
    const swatch = swatchLabel.querySelector('[aria-hidden="true"]') as HTMLElement | null;
    expect(swatch).not.toBeNull();
    expect(swatch?.style.backgroundColor).toBe("rgb(255, 170, 0)");

    expect(screen.getByRole("button", { name: "#fee" })).toBeInTheDocument();
  });

  it("renders plain hashtags when plainHashtags is enabled", () => {
    render(<div>{linkifyContent("Ship #frontend", vi.fn(), { plainHashtags: true })}</div>);

    const hashtag = screen.getByRole("button", { name: "#frontend" });
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

    expect(screen.queryByRole("button", { name: "#frontend" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "@alice" })).toHaveLength(1);
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

    const mention = screen.getByRole("button", { name: "@averyveryveryverylongusername" });
    const hashtag = screen.getByRole("button", { name: "#averyveryveryverylongtag" });

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

    const mention = screen.getByRole("button", { name: "@alice" });
    expect(mention).toHaveTextContent("@alice");

    fireEvent.click(mention, { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "person.filter.exclusive", pubkey: alice.pubkey });
  });

  it("supports unresolved pubkey mention shortcuts via fallback person", () => {
    const unresolvedPubkey = "b".repeat(64);
    const dispatch = renderWithDispatch(linkifyContent(`Assign to @${unresolvedPubkey}`));

    fireEvent.click(screen.getByRole("button", { name: /^@npub1/ }), { altKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "person.compose.mention",
      pubkey: unresolvedPubkey,
    });
  });

  it("routes Ctrl/Cmd+Alt mention shortcuts to filter and mention before opening the menu", () => {
    const dispatch = renderWithDispatch(
      linkifyContent(`Assign to @${alice.pubkey}`, undefined, {
        people: [alice],
      })
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "@alice" }), {
      button: 0,
      ctrlKey: true,
      altKey: true,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "person.filterAndMention", pubkey: alice.pubkey });
  });

  it("linkifies nostr:npub mentions and routes modifier clicks through fallback person actions", () => {
    const unresolvedPubkey = "b".repeat(64);
    const npub = "npub1hwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwasxw04hu";
    const dispatch = renderWithDispatch(linkifyContent(`Assign to nostr:${npub}`));

    fireEvent.click(screen.getByRole("button", { name: /^@npub1/ }), { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "person.filter.exclusive",
      pubkey: unresolvedPubkey,
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

  it("keeps standalone video embeds inline without triggering preview open", () => {
    const onStandaloneMediaClick = vi.fn();

    const { container } = render(
      <div>
        {linkifyContent("https://example.com/clip.mp4", undefined, {
          onStandaloneMediaClick,
        })}
      </div>
    );

    fireEvent.click(container.querySelector("video") as HTMLVideoElement);

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

  it("linkifies non-http schemes like ssh:// and ftp://", () => {
    render(<div>{linkifyContent("connect ssh://example.com or ftp://files.example.com/a.txt")}</div>);

    expect(screen.getByRole("link", { name: "ssh://example.com" })).toHaveAttribute(
      "href",
      "ssh://example.com"
    );
    expect(
      screen.getByRole("link", { name: "ftp://files.example.com/a.txt" })
    ).toHaveAttribute("href", "ftp://files.example.com/a.txt");
  });

  it("renders mailto: and tel: links without the scheme prefix", () => {
    render(<div>{linkifyContent("write mailto:foo@bar.com or call tel:+1-202-555-0123")}</div>);

    expect(screen.getByRole("link", { name: "foo@bar.com" })).toHaveAttribute(
      "href",
      "mailto:foo@bar.com"
    );
    expect(screen.getByRole("link", { name: "+1-202-555-0123" })).toHaveAttribute(
      "href",
      "tel:+12025550123"
    );
  });

  it("auto-linkifies bare international phone numbers", () => {
    render(<div>{linkifyContent("ring +49 151 23456789 today")}</div>);

    expect(screen.getByRole("link", { name: "+49 151 23456789" })).toHaveAttribute(
      "href",
      "tel:+4915123456789"
    );
  });

  it("linkifies bare domains but leaves filename-like extensions as text", () => {
    render(<div>{linkifyContent("visit example.com but keep report.zip alone")}</div>);

    expect(screen.getByRole("link", { name: "example.com" })).toHaveAttribute(
      "href",
      "http://example.com"
    );
    expect(screen.queryByRole("link", { name: "report.zip" })).not.toBeInTheDocument();
  });

  it("does not render a javascript: link as clickable", () => {
    render(<div>{linkifyContent("danger [click](javascript:alert(1)) here")}</div>);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText((value) => value.includes("click"))).toBeInTheDocument();
  });

  it("does not autolink URLs inside inline code", () => {
    render(<div>{linkifyContent("run `ssh://example.com` now")}</div>);

    expect(screen.queryByRole("link", { name: "ssh://example.com" })).not.toBeInTheDocument();
    expect(screen.getByText("ssh://example.com").tagName).toBe("CODE");
  });

  it("does not double-link an explicit markdown link", () => {
    render(<div>{linkifyContent("see [the site](https://example.com) here")}</div>);

    const link = screen.getByRole("link", { name: "the site" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
