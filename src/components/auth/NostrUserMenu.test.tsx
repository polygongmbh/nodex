import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NostrUserMenu } from "./NostrAuthModal";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: (e: Event) => void }) => (
    <button onClick={() => onSelect?.(new Event("select"))}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({
    user: {
      pubkey: "abc123",
      npub: "npub1abcdeffedcba",
      profile: { displayName: "Guest User" },
    },
    authMethod: "guest",
    logout: vi.fn(),
    getGuestPrivateKey: () => "f".repeat(64),
  }),
}));

describe("NostrUserMenu key display", () => {
  it("keeps full key in a narrow scrollable field", () => {
    render(<NostrUserMenu onSignInClick={() => {}} />);

    const keyField = screen.getByTestId("desktop-guest-key-field");
    expect(keyField).toHaveClass("overflow-x-auto");
    expect(keyField).toHaveClass("whitespace-nowrap");
    expect(keyField).toHaveClass("max-w-[10rem]");
    expect(keyField).not.toHaveClass("text-ellipsis");
  });
});
