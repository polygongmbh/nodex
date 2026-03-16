import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";

describe("Noas auth forms", () => {
  it("shows a more options button on the sign-in form", () => {
    render(
      <NoasAuthForm
        onLogin={vi.fn(async () => true)}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
      />
    );

    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
  });

  it("edits the noas host in the username row only after enabling the pencil control", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <NoasAuthForm
        onLogin={vi.fn(async () => true)}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        onNoasHostUrlChange={onNoasHostUrlChange}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i);
    expect(hostInput).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: /edit noas host/i }));
    expect(hostInput).not.toHaveAttribute("readonly");

    fireEvent.change(hostInput, { target: { value: "custom.noas.example" } });
    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://custom.noas.example");
  });

  it("preserves the port in the displayed and edited noas host", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <NoasAuthForm
        onLogin={vi.fn(async () => true)}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        onNoasHostUrlChange={onNoasHostUrlChange}
        isLoading={false}
        noasHostUrl="https://custom.noas.example:8443"
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput.value).toBe("custom.noas.example:8443");

    fireEvent.click(screen.getByRole("button", { name: /edit noas host/i }));
    fireEvent.change(hostInput, { target: { value: "other.noas.example:9443" } });

    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://other.noas.example:9443");
  });

  it("submits matching noas auth url and nip05 domain", async () => {
    const onLogin = vi.fn(async () => true);

    render(
      <NoasAuthForm
        onLogin={onLogin}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        onNoasHostUrlChange={vi.fn()}
        isLoading={false}
        noasHostUrl="https://custom.noas.example"
      />
    );

    const usernameInput = screen.getByLabelText(/^username$/i);
    fireEvent.change(usernameInput, { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.submit(usernameInput.closest("form") as HTMLFormElement);

    expect(onLogin).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://custom.noas.example",
    });
  });

  it("validates sign-in username with sign-up rules before submitting", () => {
    const onLogin = vi.fn(async () => true);

    render(
      <NoasAuthForm
        onLogin={onLogin}
        onSignUp={vi.fn()}
        onBack={vi.fn()}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
      />
    );

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "ab" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/3-32 characters/i)).toBeInTheDocument();
  });

  it("shows a more options button on the sign-up form", () => {
    render(
      <NoasSignUpForm
        onSignUp={vi.fn(async () => true)}
        onSignIn={vi.fn()}
        onBack={vi.fn()}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
      />
    );

    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
  });
});
