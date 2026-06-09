import { useEffect, useRef, useState } from "react";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

export interface SidebarFocusableItem {
  type: "relay" | "channel" | "person";
  id: string;
}

interface UseSidebarKeyboardNavOptions {
  isFocused: boolean;
  focusableItems: SidebarFocusableItem[];
}

/**
 * Vim-style keyboard navigation over the sidebar's focusable rows: j/k or
 * arrows to move, space to toggle the row's filter, g/G for top/bottom,
 * l/right/enter/escape to hand focus back to the task views. The returned ref
 * must be attached to the sidebar element so the focused row scrolls into
 * view (rows are located via their data-sidebar-item attribute).
 */
export function useSidebarKeyboardNav({ isFocused, focusableItems }: UseSidebarKeyboardNavOptions) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [focusedItemIndex, setFocusedItemIndex] = useState(0);
  const sidebarRef = useRef<HTMLElement>(null);

  // why: entering sidebar focus always restarts navigation at the top row.
  useEffect(() => {
    if (isFocused) {
      setFocusedItemIndex(0);
    }
  }, [isFocused]);

  // why: while the sidebar is focused, a window-level keydown handler drives
  // the row cursor and dispatches toggle/focus interactions for the user.
  useEffect(() => {
    if (!isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const items = focusableItems;
      const key = e.key.toLowerCase();

      // L or ArrowRight or Enter - return focus to tasks
      if (key === "l" || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        void dispatchFeedInteraction({ type: "ui.focusTasks" });
        return;
      }

      // J or ArrowDown - move down
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedItemIndex(prev => Math.min(prev + 1, items.length - 1));
        return;
      }

      // K or ArrowUp - move up
      if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedItemIndex(prev => Math.max(prev - 1, 0));
        return;
      }

      // Space - toggle current item
      if (e.key === " ") {
        e.preventDefault();
        const item = items[focusedItemIndex];
        if (item) {
          if (item.type === "relay") {
            void dispatchFeedInteraction({ type: "sidebar.relay.toggle", relayId: item.id });
          } else if (item.type === "channel") {
            void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: item.id });
          } else if (item.type === "person") {
            void dispatchFeedInteraction({ type: "sidebar.person.toggle", personId: item.id });
          }
        }
        return;
      }

      // G - go to top
      if (key === "g" && !e.shiftKey) {
        e.preventDefault();
        setFocusedItemIndex(0);
        return;
      }

      // Shift+G - go to bottom
      if (e.shiftKey && e.key === "G") {
        e.preventDefault();
        setFocusedItemIndex(items.length - 1);
        return;
      }

      // Escape - return to tasks
      if (e.key === "Escape") {
        void dispatchFeedInteraction({ type: "ui.focusTasks" });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocused, focusedItemIndex, focusableItems, dispatchFeedInteraction]);

  // why: keeps the keyboard-focused row visible by scrolling it into view
  // whenever the cursor or the row list changes.
  useEffect(() => {
    if (isFocused && sidebarRef.current) {
      const item = focusableItems[focusedItemIndex];
      if (item) {
        const element = sidebarRef.current.querySelector(`[data-sidebar-item="${item.type}-${item.id}"]`);
        if (element) {
          element.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  }, [isFocused, focusedItemIndex, focusableItems]);

  return {
    focusedItem: isFocused ? focusableItems[focusedItemIndex] ?? null : null,
    sidebarRef,
  };
}
