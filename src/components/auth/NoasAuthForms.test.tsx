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

function ControlledNoasSignUpForm({
  onSignUp = vi.fn(async () => true),
  initialUsername = "",
  initialPassword = "",
  initialNoasHostUrl = "https://noas.example.com",
}: {
  onSignUp?: Parameters<typeof NoasSignUpForm>[0]["onSignUp"];
  initialUsername?: string;
  initialPassword?: string;
  initialNoasHostUrl?: string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);

  return (
    <NoasSignUpForm
      onSignUp={onSignUp}
      onSignIn={vi.fn()}
      username={username}
      password={password}
      isEditingHostUrl={false}
      isLoading={false}
      noasHostUrl={initialNoasHostUrl}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onToggleHostEdit={vi.fn()}
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

  it("shows the configured host as a grey inline suffix until the user types @", () => {
    render(<ControlledNoasAuthForm initialNoasHostUrl="https://custom.noas.example:8443" />);

    expect(screen.getByTestId("noas-username-suffix")).toHaveTextContent("@custom.noas.example:8443");

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@other.example" } });

    expect(screen.queryByTestId("noas-username-suffix")).not.toBeInTheDocument();
  });

  it("does not show an inline suffix when no default host is available", () => {
    render(<ControlledNoasAuthForm initialNoasHostUrl="" allowDirectHostEdit />);

    expect(screen.queryByTestId("noas-username-suffix")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice@custom.noas.example");
  });

  it("fills in the default host on submit-button press before sign-in submit", () => {
    render(<ControlledNoasAuthForm initialNoasHostUrl="https://custom.noas.example" />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.pointerDown(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice@custom.noas.example");
  });

  it("uses explicit credential semantics for username and password fields", () => {
    render(<ControlledNoasAuthForm />);

    expect(screen.getByLabelText(/^username$/i)).toHaveAttribute("name", "username");
    expect(screen.getByLabelText(/^username$/i)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("name", "password");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "current-password");
  });

  it("normalizes a full nip05 handle to https on submit when no default host is configured", () => {
    const onLogin = vi.fn(async () => true);

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        onLogin={onLogin}
        initialNoasHostUrl=""
      />
    );

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example:7443" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://custom.noas.example:7443",
    });
  });

  it("shows a handle-specific validation error for malformed full handles", () => {
    const onLogin = vi.fn(async () => true);

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        onLogin={onLogin}
        initialNoasHostUrl=""
      />
    );

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@bad host" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid full handle/i)).toBeInTheDocument();
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

  it("keeps an explicit full handle in the field after sign-in submit", () => {
    const onLogin = vi.fn(async () => true);

    render(<ControlledNoasAuthForm onLogin={onLogin} initialNoasHostUrl="https://noas.example.com" />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@other.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://other.example",
    });
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice@other.example");
  });

  it("requires a full nip05 handle when no default host is available", () => {
    const onLogin = vi.fn(async () => true);

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        onLogin={onLogin}
        initialNoasHostUrl=""
      />
    );

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/enter your full nip-05 handle/i)).toBeInTheDocument();
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

    const privateKeyInput = screen.getByRole("textbox", { name: /^private key$/i });
    expect(privateKeyInput).toHaveAttribute("name", "nostrPrivateKey");
    expect(privateKeyInput).toHaveAttribute("type", "text");
    expect(privateKeyInput).toHaveAttribute("autocomplete", "off");
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

  it("updates public key preview when private key input changes", async () => {
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

    const privateKey = "1".repeat(64);
    const privateKeyInput = screen.getByRole("textbox", { name: /^private key$/i });
    fireEvent.change(privateKeyInput, { target: { value: privateKey } });

    await waitFor(() => {
      expect(
        screen.getByText("npub1fu64hh9hes90w2808n8tjc2ajp5yhddjef0ctx4s7zmsgp6cwx4qgy4eg9")
      ).toBeInTheDocument();
    });
  });

  it("fills in the default host in the field before sign-up submit", () => {
    const onSignUp = vi.fn(async () => true);

    render(<ControlledNoasSignUpForm onSignUp={onSignUp} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^private key$/i }), {
      target: { value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    expect(onSignUp).toHaveBeenCalledWith(
      "alice",
      "password123",
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      expect.any(String),
      { baseUrl: "https://noas.example.com" }
    );
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice@noas.example.com");
  });

  it("fills in the default host on submit-button press before sign-up submit", () => {
    render(<ControlledNoasSignUpForm initialNoasHostUrl="https://noas.example.com" />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.pointerDown(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice@noas.example.com");
  });
});
