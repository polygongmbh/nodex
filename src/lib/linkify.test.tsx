import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { linkifyContent } from "./linkify";
import type { Person } from "@/types";

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
});
