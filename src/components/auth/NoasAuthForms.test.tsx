import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";

function ControlledNoasAuthForm({
  onLogin = vi.fn(async () => true),
  onNoasHostUrlChange,
  initialUsername = "",
  initialPassword = "",
  initialNoasHostUrl = "https://noas.example.com",
  error,
  allowDirectHostEdit = false,
}: {
  onLogin?: Parameters<typeof NoasAuthForm>[0]["onLogin"];
  onNoasHostUrlChange?: (value: string) => void;
  initialUsername?: string;
  initialPassword?: string;
  initialNoasHostUrl?: string;
  error?: string;
  allowDirectHostEdit?: boolean;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);
  const [noasHostUrl, setNoasHostUrl] = useState(initialNoasHostUrl);
  const [isEditingHostUrl, setIsEditingHostUrl] = useState(false);

  return (
    <NoasAuthForm
      onLogin={onLogin}
      onSignUp={vi.fn()}
      onBack={vi.fn()}
      username={username}
      password={password}
      isEditingHostUrl={isEditingHostUrl}
      allowDirectHostEdit={allowDirectHostEdit}
      isLoading={false}
      error={error}
      noasHostUrl={noasHostUrl}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onNoasHostUrlChange={(value) => {
        setNoasHostUrl(value);
        onNoasHostUrlChange?.(value);
      }}
      onToggleHostEdit={() => setIsEditingHostUrl((current) => !current)}
    />
  );
}

describe("Noas auth forms", () => {
  it("shows a more options button on the sign-in form", () => {
    render(
      <ControlledNoasAuthForm />
    );

    expect(screen.getByRole("button", { name: /nostr authentication options/i })).toBeInTheDocument();
  });

  it("edits the noas host in the username row only after enabling the pencil control", () => {
    const onNoasHostUrlChange = vi.fn();

    render(<ControlledNoasAuthForm onNoasHostUrlChange={onNoasHostUrlChange} />);

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: /edit noas host/i }));
    expect(hostInput).not.toHaveAttribute("readonly");
    expect(hostInput).toHaveFocus();
    expect(screen.queryByRole("button", { name: /edit noas host/i })).not.toBeInTheDocument();

    fireEvent.change(hostInput, { target: { value: "https://custom.noas.example/api" } });
    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://custom.noas.example/api");
  });

  it("keeps username@host inline and uses the simplified host placeholder", () => {
    render(<ControlledNoasAuthForm initialNoasHostUrl="" />);

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput).toHaveAttribute("placeholder", "example.com");

    const atDivider = screen.getByText("@");
    expect(atDivider.className).not.toContain("hidden");
  });

  it("preserves the port in the displayed and edited noas host", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <ControlledNoasAuthForm
        onNoasHostUrlChange={onNoasHostUrlChange}
        initialNoasHostUrl="https://custom.noas.example:8443"
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput.value).toBe("https://custom.noas.example:8443");

    fireEvent.click(screen.getByRole("button", { name: /edit noas host/i }));
    fireEvent.change(hostInput, { target: { value: "https://other.noas.example:9443/custom/path" } });

    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://other.noas.example:9443/custom/path");
  });

  it("shows an unlocked empty host field without the pencil control when direct host edit is allowed", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        initialNoasHostUrl=""
        onNoasHostUrlChange={onNoasHostUrlChange}
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput.value).toBe("");
    expect(hostInput).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /edit noas host/i })).not.toBeInTheDocument();

    fireEvent.change(hostInput, { target: { value: "https://custom.noas.example:7443/custom/path" } });
    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://custom.noas.example:7443/custom/path");
  });

  it("submits matching noas auth url and nip05 domain", async () => {
    const onLogin = vi.fn(async () => true);

    render(<ControlledNoasAuthForm onLogin={onLogin} initialNoasHostUrl="https://custom.noas.example" />);

    const usernameInput = screen.getByLabelText(/^username$/i);
    fireEvent.change(usernameInput, { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.submit(usernameInput.closest("form") as HTMLFormElement);

    expect(onLogin).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://custom.noas.example",
    });
  });

  it("uses explicit credential semantics for username and password fields", () => {
    render(<ControlledNoasAuthForm />);

    expect(screen.getByLabelText(/^username$/i)).toHaveAttribute("name", "username");
    expect(screen.getByLabelText(/^username$/i)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("name", "password");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "current-password");
  });

  it("normalizes a bare custom host to https on submit", () => {
    const onLogin = vi.fn(async () => true);

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        onLogin={onLogin}
        initialNoasHostUrl="custom.noas.example:7443/api"
      />
    );

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://custom.noas.example:7443/api",
    });
  });

  it("keeps long custom URLs intact in the editable host field", () => {
    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        initialNoasHostUrl="http://localhost:3000/custom/noas/path?mode=dev"
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput.value).toBe("http://localhost:3000/custom/noas/path?mode=dev");
    expect(hostInput).toHaveAttribute("title", "http://localhost:3000/custom/noas/path?mode=dev");
  });

  it("shows a host-specific validation error for malformed custom URLs", () => {
    const onLogin = vi.fn(async () => true);

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        onLogin={onLogin}
        initialNoasHostUrl="https://bad host"
      />
    );

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid host url/i)).toBeInTheDocument();
  });

  it("validates sign-in username with sign-up rules before submitting", () => {
    const onLogin = vi.fn(async () => true);

    render(<ControlledNoasAuthForm onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "ab" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/username must be 3-32 characters/i)).toBeInTheDocument();
  });

  it("accepts dashed usernames for Noas sign-in", () => {
    const onLogin = vi.fn(async () => true);

    render(<ControlledNoasAuthForm onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice-test" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).toHaveBeenCalledWith("alice-test", "password123", {
      baseUrl: "https://noas.example.com",
    });
  });

  it("shows only one sign-in error message when submit failure also returns a parent error", async () => {
    const onLogin = vi.fn(async () => false);
    const parentError = "Noas sign-in failed. Please check your username and password.";

    render(
      <ControlledNoasAuthForm
        onLogin={onLogin}
        initialUsername="alice"
        initialPassword="password123"
        error={parentError}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(screen.getAllByText(parentError)).toHaveLength(1);
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("keeps sign-up compact without a more options button", () => {
    render(
      <NoasSignUpForm
        onSignUp={vi.fn(async () => true)}
        onSignIn={vi.fn()}
        username=""
        password=""
        isEditingHostUrl={false}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onToggleHostEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /more options/i })).not.toBeInTheDocument();
  });

  it("marks the private-key field as non-credential autofill content", () => {
    render(
      <NoasSignUpForm
        onSignUp={vi.fn(async () => true)}
        onSignIn={vi.fn()}
        username=""
        password=""
        isEditingHostUrl={false}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onToggleHostEdit={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/private key/i)).toHaveAttribute("name", "privateKey");
    expect(screen.getByLabelText(/private key/i)).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows shared tabs on the sign-up form and lets users switch back to sign-in", () => {
    render(
      <NoasSignUpForm
        onSignUp={vi.fn(async () => true)}
        onSignIn={vi.fn()}
        username=""
        password=""
        isEditingHostUrl={false}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onToggleHostEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^sign up$/i }).length).toBeGreaterThan(0);
  });
});
