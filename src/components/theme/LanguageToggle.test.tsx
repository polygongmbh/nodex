import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n, { DEFAULT_LANGUAGE } from "@/lib/i18n/config";
import { LanguageToggle } from "./LanguageToggle";

describe("LanguageToggle", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it("shows the full current language label in the mobile variant trigger", () => {
    render(<LanguageToggle showLabelOnMobile />);

    const trigger = screen.getByLabelText(/language/i);

    expect(trigger).toHaveTextContent("English");
  });
});
