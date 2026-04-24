import React from "react";
import { AtSign, Copy, Filter, MessageSquareMore } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Person } from "@/types/person";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import {
  getPersonShortcutIntent,
  getPlatformAlternateShortcutLabel,
  getPlatformPrimaryShortcutLabel,
  toPersonShortcutInteraction,
} from "./person-shortcuts";
import { resumePersonHoverCards, suspendPersonHoverCards } from "./PersonHoverCard";

interface PersonActionMenuProps {
  person: Person;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  enableModifierShortcuts?: boolean;
}

export function PersonActionMenu({
  person,
  children,
  align = "start",
  side = "bottom",
  enableModifierShortcuts = false,
}: PersonActionMenuProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const handledPointerShortcutRef = React.useRef(false);
  const pointerOpenedMenuRef = React.useRef(false);
  const shouldPreventCloseAutoFocusRef = React.useRef(false);

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

  return (
    <DropdownMenu
      onOpenChange={(open) => {
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
          onPointerDownCapture={(event: React.PointerEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            if (handleShortcut(event)) {
              handledPointerShortcutRef.current = true;
            }
          }}
          onMouseDownCapture={(event: React.MouseEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            if (handleShortcut(event)) {
              handledPointerShortcutRef.current = true;
            }
          }}
          onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
            event.stopPropagation();
          }}
          onClick={(event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            if (handledPointerShortcutRef.current) {
              handledPointerShortcutRef.current = false;
              return;
            }
            if (handleShortcut(event)) return;
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

  const copyPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(person.id);
      toast.success(t("people.toasts.pubkeyCopied"));
    } catch {
      toast.error(t("people.toasts.pubkeyCopyFailed"));
    }
  };

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
        <p className="truncate text-sm font-medium text-foreground">{person.displayName || person.name || toUserFacingPubkey(person.id)}</p>
        <p className="truncate text-xs text-muted-foreground">{person.nip05 || `@${person.name || toUserFacingPubkey(person.id)}`}</p>
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
      <DropdownMenuItem onClick={() => {
        onActionSelect?.("copy");
        void copyPublicKey();
      }}>
        <Copy className="mr-2 h-4 w-4" />
        {t("people.actions.copyPubkey")}
      </DropdownMenuItem>
      <DropdownMenuItem disabled>
        <MessageSquareMore className="mr-2 h-4 w-4" />
        {t("people.actions.privateChat")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
