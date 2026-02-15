import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { linkifyContent } from "./linkify";

describe("linkifyContent interaction styles", () => {
  it("applies shared inline link class to hashtags and URLs", () => {
    const onHashtagClick = vi.fn();

    render(<p>{linkifyContent("Ship #frontend https://example.com", onHashtagClick)}</p>);

    const hashtag = screen.getByRole("button", { name: "Filter by #frontend" });
    const url = screen.getByRole("link", { name: "https://example.com" });

    expect(hashtag).toHaveClass("task-inline-link");
    expect(url).toHaveClass("task-inline-link");

    fireEvent.click(hashtag);
    expect(onHashtagClick).toHaveBeenCalledWith("frontend");
  });
});
