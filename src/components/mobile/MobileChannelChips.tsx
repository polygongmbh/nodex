import { useCallback, useRef, type PointerEvent, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Channel } from "@/types";

const LONG_PRESS_MS = 500;

interface MobileChannelChipsProps {
  /** Chips to render, already ordered (pinned first, then other channels). */
  channels: Channel[];
  /** Id of the sole exclusively-included channel, or null when Home is active. */
  activeChannelId: string | null;
  isManageActive: boolean;
  onManageOpen: () => void;
  onSelectHome: () => void;
  onSelectChannel: (channelId: string) => void;
  /** Long-press toggles pin state; `isPinned` is the current state. */
  onTogglePin: (channelId: string, isPinned: boolean) => void;
  /** Optional element placed between the menu chip and the Home chip (space selector). */
  leading?: ReactNode;
}

const chipBase =
  "shrink-0 flex items-center gap-1.5 rounded-full px-3 h-9 text-[13px] font-medium select-none transition-colors duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function chipColors(isActive: boolean) {
  return isActive
    ? "bg-primary text-primary-foreground shadow-sm"
    : "bg-muted/80 dark:bg-muted/60 text-muted-foreground/80 dark:text-muted-foreground";
}

interface ChannelChipProps {
  channel: Channel;
  isActive: boolean;
  onSelect: () => void;
  onLongPress: () => void;
}

/**
 * Tap selects the channel exclusively (tap again clears it); a long-press
 * toggles its pin state. We track the long-press with a timer and suppress the
 * trailing click so a long-press never also selects the channel. Pinned chips
 * carry a gentle tint so they read apart from the trailing discovery channels.
 */
function ChannelChip({ channel, isActive, onSelect, onLongPress }: ChannelChipProps) {
  const isPinned = channel.pinIndex !== undefined;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPressedRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(15);
      }
      onLongPress();
    }, LONG_PRESS_MS);
  }, [clearTimer, onLongPress]);

  const handleClick = useCallback(() => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    onSelect();
  }, [onSelect]);

  return (
    <button
      type="button"
      data-pinned={isPinned ? "true" : undefined}
      className={cn(
        chipBase,
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : isPinned
            ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
            : "bg-muted/80 dark:bg-muted/60 text-muted-foreground/80 dark:text-muted-foreground"
      )}
      onPointerDown={handlePointerDown}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      onClick={handleClick}
    >
      <span>#{channel.name}</span>
      {channel.usageCount ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] leading-5",
            isActive ? "bg-primary-foreground/20" : "bg-foreground/10"
          )}
        >
          {channel.usageCount}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Horizontally scrollable filter row shown under the mobile nav on every view:
 * the manage (burger) chip, a Home chip for the default unscoped state, and a
 * chip per pinned/top-used channel. Presentational — all state changes are
 * dispatched by the parent via the command props.
 */
export function MobileChannelChips({
  channels,
  activeChannelId,
  isManageActive,
  onManageOpen,
  onSelectHome,
  onSelectChannel,
  onTogglePin,
  leading,
}: MobileChannelChipsProps) {
  const { t } = useTranslation("shell");
  const isHomeActive = activeChannelId === null && !isManageActive;

  return (
    <div className="mx-2 mb-1 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        data-onboarding="mobile-nav-manage"
        data-testid="mobile-chip-menu"
        title={t("navigation.views.switchTo", { view: t("navigation.views.manage") })}
        className={cn(chipBase, "w-11 justify-center px-0", chipColors(isManageActive))}
        onClick={onManageOpen}
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      {leading}

      <button
        type="button"
        className={cn(chipBase, chipColors(isHomeActive))}
        onClick={onSelectHome}
      >
        {t("navigation.views.home")}
      </button>

      {channels.map((channel) => (
        <ChannelChip
          key={channel.id}
          channel={channel}
          isActive={activeChannelId === channel.id}
          onSelect={() => onSelectChannel(channel.id)}
          onLongPress={() => onTogglePin(channel.id, channel.pinIndex !== undefined)}
        />
      ))}
    </div>
  );
}
