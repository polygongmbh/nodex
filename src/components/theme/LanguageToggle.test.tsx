import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageToggle } from "./LanguageToggle";

describe("LanguageToggle", () => {
  it("shows the full current language label in the mobile variant trigger", () => {
    render(<LanguageToggle showLabelOnMobile />);

    const trigger = screen.getByLabelText(/language/i);

    expect(trigger.textContent?.trim()).toMatch(/\S{3,}/);
    expect(trigger).not.toHaveTextContent(/^[A-Z]{2}$/);
  });
});
