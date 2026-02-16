import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarHeader } from "./Sidebar";

describe("SidebarHeader", () => {
  it("links Nodex title to the startpage", () => {
    render(<SidebarHeader />);

    const brandLink = screen.getByRole("link", { name: "Nodex" });
    expect(brandLink).toHaveAttribute("href", "/");
  });

  it("shows a semantic version hint on hover", () => {
    render(<SidebarHeader />);

    const brandLink = screen.getByRole("link", { name: "Nodex" });
    expect(brandLink).toHaveAttribute("title", "Nodex v1.1.0");
  });
});
