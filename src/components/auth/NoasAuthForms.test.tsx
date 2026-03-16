import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";

describe("Noas auth forms", () => {
  it("shows alternative sign-in methods on the sign-in form", () => {
    render(
      <NoasAuthForm
        onLogin={vi.fn(async () => true)}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        onChooseExtension={vi.fn()}
        onChooseSigner={vi.fn()}
        onChoosePrivateKey={vi.fn()}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        noasDomain="noas.example.com"
      />
    );

    expect(screen.getByRole("button", { name: /signer extension/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /signer app/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /private key/i })).toBeInTheDocument();
  });

  it("edits the noas domain in the username row only after enabling the pencil control", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <NoasAuthForm
        onLogin={vi.fn(async () => true)}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        onChooseExtension={vi.fn()}
        onChooseSigner={vi.fn()}
        onChoosePrivateKey={vi.fn()}
        onNoasHostUrlChange={onNoasHostUrlChange}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        noasDomain="noas.example.com"
      />
    );

    const domainInput = screen.getByLabelText(/domain/i);
    expect(domainInput).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: /edit noas url/i }));
    expect(domainInput).not.toHaveAttribute("readonly");

    fireEvent.change(domainInput, { target: { value: "custom.noas.example" } });
    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://custom.noas.example");
  });

  it("hides alternative sign-in methods on the sign-up form", () => {
    render(
      <NoasSignUpForm
        onSignUp={vi.fn(async () => true)}
        onSignIn={vi.fn()}
        onBack={vi.fn()}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        noasDomain="noas.example.com"
      />
    );

    expect(screen.queryByRole("button", { name: /signer extension/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /signer app/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /private key/i })).not.toBeInTheDocument();
  });
});
