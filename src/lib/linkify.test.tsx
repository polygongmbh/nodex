import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { linkifyContent } from "./linkify";

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
});
