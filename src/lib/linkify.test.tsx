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

    render(<p>{linkifyContent("Ship #frontend https://example.com", onHashtagClick)}</p>);

    const hashtag = screen.getByRole("button", { name: "Filter by #frontend" });
    const url = screen.getByRole("link", { name: "https://example.com" });

    expect(url).toHaveAttribute("href", "https://example.com");
    expect(url).toHaveAttribute("target", "_blank");

    fireEvent.click(hashtag);
    expect(onHashtagClick).toHaveBeenCalledWith("frontend");
  });

  it("renders plain hashtags when plainHashtags is enabled", () => {
    render(<p>{linkifyContent("Ship #frontend", vi.fn(), { plainHashtags: true })}</p>);

    const hashtag = screen.getByRole("button", { name: "Filter by #frontend" });
    expect(hashtag).toBeInTheDocument();
  });

  it("renders @mentions with resolved @name labels and supports person click callback", () => {
    const onMentionClick = vi.fn();

    render(
      <p>
        {linkifyContent(`Assign to @${alice.id}`, undefined, {
          people: [alice],
          onMentionClick,
        })}
      </p>
    );

    const mention = screen.getByRole("button", { name: "Open user alice" });
    expect(mention).toHaveTextContent("@alice");

    fireEvent.click(mention);
    expect(onMentionClick).toHaveBeenCalledWith(alice);
  });

  it("keeps original mention token as hover title after resolving display label", () => {
    render(
      <p>
        {linkifyContent("Assign to @alice@example.com", undefined, {
          people: [alice],
        })}
      </p>
    );

    expect(screen.getByText("@alice")).toHaveAttribute("title", "@alice@example.com");
  });
});
