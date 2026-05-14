import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/config";
import { FeedTaskMenu } from "./FeedTaskMenu";
import { makeComment, makeTask } from "@/test/fixtures";
import { NostrEventKind } from "@/lib/nostr/types";

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));
vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchMock,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, className }: { children: ReactNode; onSelect?: (event: Event) => void; className?: string }) => (
    <button type="button" className={className} onClick={() => onSelect?.(new Event("select"))}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? <div role="alertdialog">{children}</div> : null),
  AlertDialogAction: ({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) => (
    <button type="button" className={className} onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderMenu(overrides: Partial<Parameters<typeof FeedTaskMenu>[0]> = {}) {
  const props: Parameters<typeof FeedTaskMenu>[0] = {
    task: makeTask({
      author: { pubkey: "owner-pub", name: "owner", displayName: "Owner", avatar: "" },
      timestamp: new Date(),
    }),
    currentUserPubkey: "owner-pub",
    hasChildren: false,
    onReact: vi.fn(),
    onCopyPermalink: vi.fn(),
    onRecompose: vi.fn(),
    onDelete: vi.fn(),
    pinned: true,
    ...overrides,
  };
  return {
    props,
    ...render(
      <I18nextProvider i18n={i18n}>
        <FeedTaskMenu {...props} />
      </I18nextProvider>
    ),
  };
}

describe("FeedTaskMenu", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
  });

  it("shows recompose and delete for the recent owner-authored post", () => {
    renderMenu();
    expect(screen.getByText("Copy link")).toBeInTheDocument();
    expect(screen.getByText("Re-compose…")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("hides recompose and delete when the user is not the owner", () => {
    renderMenu({ currentUserPubkey: "someone-else" });
    expect(screen.getByText("Copy link")).toBeInTheDocument();
    expect(screen.queryByText("Re-compose…")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("hides recompose and delete when the post already has replies", () => {
    renderMenu({ hasChildren: true });
    expect(screen.queryByText("Re-compose…")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("calls onCopyPermalink when the copy link item is activated", () => {
    const onCopyPermalink = vi.fn();
    renderMenu({ onCopyPermalink });
    fireEvent.click(screen.getByText("Copy link"));
    expect(onCopyPermalink).toHaveBeenCalledTimes(1);
  });

  it("swaps the menu for the emoji grid when React is selected", () => {
    const onReact = vi.fn();
    const { props } = renderMenu({ onReact });
    fireEvent.click(screen.getByText("Add reaction"));
    const grid = screen.getByTestId(`feed-task-menu-react-${props.task.id}`);
    expect(grid).toBeInTheDocument();
    expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
    fireEvent.click(grid.querySelector("button[class*='h-8']")!);
    expect(onReact).toHaveBeenCalledTimes(1);
  });

  it("offers due-date and priority editors for editable tasks", () => {
    renderMenu();
    expect(screen.getByText("Set due date")).toBeInTheDocument();
    expect(screen.getByText("Set priority")).toBeInTheDocument();
  });

  it("hides due-date and priority editors when the post is not a task", () => {
    renderMenu({
      task: makeComment({
        author: { pubkey: "owner-pub", name: "owner", displayName: "Owner", avatar: "" },
        timestamp: new Date(),
      }),
    });
    expect(screen.queryByText("Set due date")).not.toBeInTheDocument();
    expect(screen.queryByText("Set priority")).not.toBeInTheDocument();
  });

  it("dispatches a priority update when a priority option is chosen", () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText("Set priority"));
    const view = screen.getByTestId(`feed-task-menu-priority-${props.task.id}`);
    const p3 = view.querySelector("button:nth-of-type(4)");
    fireEvent.click(p3!);
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "task.updatePriority", taskId: props.task.id, priority: 60 }),
    );
  });

  it("requires confirmation before invoking onDelete", () => {
    const onDelete = vi.fn();
    renderMenu({ onDelete });
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Delete", { selector: "button.bg-destructive" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
