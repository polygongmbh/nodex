import React from "react";
import { AtSign, Copy, Filter, MessageSquareMore } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Person, PersonPresenceSnapshot } from "@/types/person";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hexPubkeyToNpub, isHexPubkey, isNpub, npubToHexPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import {
  getPersonShortcutIntent,
  getPlatformAlternateShortcutLabel,
  getPlatformPrimaryShortcutLabel,
  toPersonShortcutInteraction,
} from "./person-shortcuts";
import { resumePersonHoverCards, suspendPersonHoverCards } from "./PersonHoverCard";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getCompactPersonLabel } from "@/types/person";

interface PersonActionMenuProps {
  person: Person;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  enableModifierShortcuts?: boolean;
  /**
   * When true, a plain click immediately filters the feed by this person
   * (sidebar exclusive selection) instead of opening the menu. Modifier-key
   * shortcuts still take precedence so power-user flows are preserved.
   */
  directFilterOnClick?: boolean;
}

export function PersonActionMenu({
  person,
  children,
  align = "start",
  side = "bottom",
  enableModifierShortcuts = false,
  directFilterOnClick = false,
}: PersonActionMenuProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const handledPointerShortcutRef = React.useRef(false);
  const handledDirectFilterRef = React.useRef(false);
  const shouldPreventCloseAutoFocusRef = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const touchScrolledRef = React.useRef(false);
  // Pixels of finger movement after touchstart that should be treated as a scroll, not a tap.
  const TOUCH_SCROLL_THRESHOLD_PX = 8;

  const handleShortcut = (
    event: Pick<React.MouseEvent<HTMLElement>, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "preventDefault" | "stopPropagation">,
  ) => {
    if (!enableModifierShortcuts) return false;
    const intent = getPersonShortcutIntent(event);
    if (!intent) return false;

    event.preventDefault();
    event.stopPropagation();
    void dispatchFeedInteraction(toPersonShortcutInteraction(person, intent));
    return true;
  };

  const handleDirectFilter = (
    event: Pick<React.MouseEvent<HTMLElement>, "preventDefault" | "stopPropagation">,
  ) => {
    if (!directFilterOnClick) return false;

    event.preventDefault();
    event.stopPropagation();
    void dispatchFeedInteraction({ type: "person.filter.exclusive", person });
    return true;
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) {
          suspendPersonHoverCards();
          return;
        }
        resumePersonHoverCards();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          className="inline-flex"
          onTouchStart={(event: React.TouchEvent<HTMLElement>) => {
            const touch = event.touches[0];
            if (!touch) return;
            touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
            touchScrolledRef.current = false;
          }}
          onTouchMove={(event: React.TouchEvent<HTMLElement>) => {
            const start = touchStartRef.current;
            const touch = event.touches[0];
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.hypot(dx, dy) > TOUCH_SCROLL_THRESHOLD_PX) {
              touchScrolledRef.current = true;
            }
          }}
          onTouchEnd={() => {
            touchStartRef.current = null;
          }}
          onPointerDownCapture={(event: React.PointerEvent<HTMLElement>) => {
            // For touch we let the click handler decide based on touchScrolledRef,
            // so we don't preventDefault here (which would also cancel the click).
            if (event.pointerType === "touch") {
              event.stopPropagation();
              return;
            }
            if (event.button !== 0) return;
            if (handleShortcut(event)) {
              handledPointerShortcutRef.current = true;
              return;
            }
            if (handleDirectFilter(event)) {
              handledDirectFilterRef.current = true;
            }
          }}
          onMouseDownCapture={(event: React.MouseEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            if (handledDirectFilterRef.current) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (handleShortcut(event)) {
              handledPointerShortcutRef.current = true;
            }
          }}
          onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
            if (event.pointerType === "touch") return;
            event.stopPropagation();
          }}
          onClick={(event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            if (touchScrolledRef.current) {
              touchScrolledRef.current = false;
              return;
            }
            if (handledPointerShortcutRef.current) {
              handledPointerShortcutRef.current = false;
              return;
            }
            if (handledDirectFilterRef.current) {
              handledDirectFilterRef.current = false;
              return;
            }
            if (handleShortcut(event)) return;
            if (handleDirectFilter(event)) {
              return;
            }
            setOpen((prev) => !prev);
          }}
        >
          {children}
        </span>
      </DropdownMenuTrigger>
      <PersonActionMenuContent
        person={person}
        align={align}
        side={side}
        onActionSelect={(action) => {
          shouldPreventCloseAutoFocusRef.current = action === "mention" || action === "filterAndMention";
        }}
        onCloseAutoFocus={(event) => {
          if (!shouldPreventCloseAutoFocusRef.current) return;
          shouldPreventCloseAutoFocusRef.current = false;
          event.preventDefault();
        }}
      />
    </DropdownMenu>
  );
}

interface PersonActionMenuContentProps {
  person: Person;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  onActionSelect?: (action: "filterExclusive" | "mention" | "filterAndMention" | "copy") => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function PersonActionMenuContent({
  person,
  align = "start",
  side = "bottom",
  onActionSelect,
  onCloseAutoFocus,
}: PersonActionMenuContentProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const primaryShortcutLabel = getPlatformPrimaryShortcutLabel();
  const alternateShortcutLabel = getPlatformAlternateShortcutLabel();
  const isMobile = useIsMobile();
  const compactLabel = getCompactPersonLabel(person);
  const pubkeyLabel = toUserFacingPubkey(person.pubkey);
  const presence = (person as Person & { presence?: PersonPresenceSnapshot }).presence;
  const statusKey: "online" | "recent" | "offline" = presence?.state ?? "offline";

  const copyToClipboard = async (value: string, successMessageKey: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t(successMessageKey));
    } catch {
      toast.error(t("people.toasts.pubkeyCopyFailed"));
    }
  };

  const closeMenuFromElement = (element: HTMLElement) => {
    const menu = element.closest('[role="menu"]') as HTMLElement | null;
    (menu ?? element).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  };

  const npubValue = isNpub(person.pubkey) ? person.pubkey.toLowerCase() : hexPubkeyToNpub(person.pubkey);
  const hexValue = isHexPubkey(person.pubkey) ? person.pubkey.toLowerCase() : npubToHexPubkey(person.pubkey);

  // Mobile: profile preview card (replaces hover card) + two actions only
  if (isMobile) {
    return (
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={8}
        className="z-[160] w-72"
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="px-2 py-2">
          <div className="flex items-start gap-3">
            <UserAvatar
              id={person.pubkey}
              displayName={person.displayName}
              className="h-10 w-10 shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{compactLabel}</p>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(`people.status.${statusKey}`)}
                </span>
              </div>
              {person.name && person.name !== compactLabel ? (
                <p className="truncate text-xs text-muted-foreground">@{person.name}</p>
              ) : null}
              {person.nip05 ? (
                <p className="truncate text-xs text-muted-foreground">{person.nip05}</p>
              ) : null}
              <p className="break-all font-mono text-[10px] leading-snug text-muted-foreground">
                {pubkeyLabel}
              </p>
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="touch-target-sm"
          onClick={() => {
            onActionSelect?.("filterAndMention");
            void dispatchFeedInteraction({ type: "person.filterAndMention", person });
          }}
        >
          <span className="mr-2 inline-flex items-center">
            <Filter className="h-4 w-4" />
            <AtSign className="-ml-1 h-3.5 w-3.5" />
          </span>
          {t("people.actions.highlight")}
        </DropdownMenuItem>
        <div
          className="flex items-center gap-2 px-2 py-2 text-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-foreground">{t("people.actions.copyPubkey")}</span>
          <button
            type="button"
            aria-label={t("people.actions.copyPubkeyNpubAria")}
            disabled={!npubValue}
            onClick={(event) => {
              event.stopPropagation();
              onActionSelect?.("copy");
              if (!npubValue) return;
              void copyToClipboard(npubValue, "people.toasts.npubCopied");
              closeMenuFromElement(event.currentTarget);
            }}
            className="touch-target-sm rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("people.actions.copyPubkeyNpub")}
          </button>
          <button
            type="button"
            aria-label={t("people.actions.copyPubkeyHexAria")}
            disabled={!hexValue}
            onClick={(event) => {
              event.stopPropagation();
              onActionSelect?.("copy");
              if (!hexValue) return;
              void copyToClipboard(hexValue, "people.toasts.hexPubkeyCopied");
              closeMenuFromElement(event.currentTarget);
            }}
            className="touch-target-sm rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("people.actions.copyPubkeyHex")}
          </button>
        </div>
      </DropdownMenuContent>
    );
  }

  return (
    <DropdownMenuContent
      align={align}
      side={side}
      sideOffset={8}
      className="z-[160] w-64"
      onClick={(event) => event.stopPropagation()}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="px-2 py-1.5">
        <p className="truncate text-sm font-medium text-foreground">{person.displayName || person.name || toUserFacingPubkey(person.pubkey)}</p>
        <p className="truncate text-xs text-muted-foreground">{person.nip05 || `@${person.name || toUserFacingPubkey(person.pubkey)}`}</p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => {
        onActionSelect?.("filterExclusive");
        void dispatchFeedInteraction({ type: "person.filter.exclusive", person });
      }}>
        <Filter className="mr-2 h-4 w-4" />
        {t("people.actions.showOnly", { name: person.displayName || person.name })}
        <DropdownMenuShortcut>{primaryShortcutLabel}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => {
        onActionSelect?.("mention");
        void dispatchFeedInteraction({ type: "person.compose.mention", person });
      }}>
        <AtSign className="mr-2 h-4 w-4" />
        {t("people.actions.mention", { name: person.displayName || person.name })}
        <DropdownMenuShortcut>{alternateShortcutLabel}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => {
        onActionSelect?.("filterAndMention");
        void dispatchFeedInteraction({ type: "person.filterAndMention", person });
      }}>
        <span className="mr-2 inline-flex items-center">
          <Filter className="h-4 w-4" />
          <AtSign className="-ml-1 h-3.5 w-3.5" />
        </span>
        {t("people.actions.filterAndMention", { name: person.displayName || person.name })}
        <DropdownMenuShortcut>{`${primaryShortcutLabel}+${alternateShortcutLabel}`}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-foreground">{t("people.actions.copyPubkey")}</span>
        <button
          type="button"
          aria-label={t("people.actions.copyPubkeyNpubAria")}
          disabled={!npubValue}
          onClick={(event) => {
            event.stopPropagation();
            onActionSelect?.("copy");
            if (!npubValue) return;
            void copyToClipboard(npubValue, "people.toasts.npubCopied");
            closeMenuFromElement(event.currentTarget);
          }}
          className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("people.actions.copyPubkeyNpub")}
        </button>
        <button
          type="button"
          aria-label={t("people.actions.copyPubkeyHexAria")}
          disabled={!hexValue}
          onClick={(event) => {
            event.stopPropagation();
            onActionSelect?.("copy");
            if (!hexValue) return;
            void copyToClipboard(hexValue, "people.toasts.hexPubkeyCopied");
            closeMenuFromElement(event.currentTarget);
          }}
          className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("people.actions.copyPubkeyHex")}
        </button>
      </div>
      <DropdownMenuItem disabled>
        <MessageSquareMore className="mr-2 h-4 w-4" />
        {t("people.actions.privateChat")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
