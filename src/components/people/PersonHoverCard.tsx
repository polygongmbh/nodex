import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/user-avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Person } from "@/types/person";
import { toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { getCompactPersonLabel } from "@/types/person";
import { cn } from "@/lib/utils";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { getTrimmedFirstTaskContentLine } from "@/lib/task-content-preview";
import { useIsMobile } from "@/hooks/use-mobile";

interface PersonHoverCardProps {
  person: Person;
  children: ReactNode;
  openDelay?: number;
  side?: "top" | "right" | "bottom" | "left";
  triggerClassName?: string;
  sideOffset?: number;
}

type HoverCardOpenSource = "focus" | "hover";

let activeHoverCardId: string | null = null;
let activeHoverCardSource: HoverCardOpenSource | null = null;
let hoverCardsSuspendedCount = 0;
const hoverCardSubscribers = new Set<() => void>();

function emitHoverCardStore() {
  hoverCardSubscribers.forEach((subscriber) => subscriber());
}

function subscribeToHoverCardStore(subscriber: () => void) {
  hoverCardSubscribers.add(subscriber);
  return () => {
    hoverCardSubscribers.delete(subscriber);
  };
}

function getActiveHoverCardId() {
  return activeHoverCardId;
}

function getActiveHoverCardSource() {
  return activeHoverCardSource;
}

function areHoverCardsSuspended() {
  return hoverCardsSuspendedCount > 0;
}

function setActiveHoverCard(nextId: string | null, nextSource: HoverCardOpenSource | null) {
  if (activeHoverCardId === nextId && activeHoverCardSource === nextSource) return;
  activeHoverCardId = nextId;
  activeHoverCardSource = nextSource;
  emitHoverCardStore();
}

export function suspendPersonHoverCards() {
  hoverCardsSuspendedCount += 1;
  setActiveHoverCard(null, null);
  emitHoverCardStore();
}

export function resumePersonHoverCards() {
  hoverCardsSuspendedCount = Math.max(0, hoverCardsSuspendedCount - 1);
  emitHoverCardStore();
}

function getStatusKey(person: Person): "online" | "recent" | "offline" {
  if (person.onlineStatus) return person.onlineStatus;
  return person.isOnline ? "online" : "offline";
}

export function PersonHoverCard({
  person,
  children,
  openDelay = 450,
  side = "bottom",
  triggerClassName,
  sideOffset = 8,
}: PersonHoverCardProps) {
  const { t, i18n } = useTranslation("tasks");
  const { allTasks } = useFeedTaskViewModel();
  const hoverCardId = useId();
  const openSourceRef = useRef<HoverCardOpenSource>("focus");
  const activeId = useSyncExternalStore(
    subscribeToHoverCardStore,
    getActiveHoverCardId,
    getActiveHoverCardId,
  );
  const activeSource = useSyncExternalStore(
    subscribeToHoverCardStore,
    getActiveHoverCardSource,
    getActiveHoverCardSource,
  );
  const suspended = useSyncExternalStore(
    subscribeToHoverCardStore,
    areHoverCardsSuspended,
    areHoverCardsSuspended,
  );
  const [requestedOpen, setRequestedOpen] = useState(false);
  const compactLabel = getCompactPersonLabel(person);
  const pubkeyLabel = toUserFacingPubkey(person.id);
  const statusKey = getStatusKey(person);
  const resolvedPresenceTaskTitle = person.presenceTaskId
    ? getTrimmedFirstTaskContentLine(
        allTasks.find((task) => task.id === person.presenceTaskId)?.content
      )
    : "";
  const presenceViewLabel = person.presenceView
    ? t(`shell:navigation.views.${person.presenceView}`, {
        defaultValue: person.presenceView,
      })
    : null;
  const viewingLabel = resolvedPresenceTaskTitle || presenceViewLabel;
  const open = !suspended && requestedOpen && activeId === hoverCardId;

  useEffect(() => {
    if (requestedOpen && (suspended || (activeId !== null && activeId !== hoverCardId))) {
      setRequestedOpen(false);
    }
  }, [activeId, hoverCardId, requestedOpen, suspended]);

  useEffect(() => {
    return () => {
      if (getActiveHoverCardId() === hoverCardId) {
        setActiveHoverCard(null, null);
      }
    };
  }, [hoverCardId]);

  const shouldPreferOpenSource = (nextSource: HoverCardOpenSource) => {
    if (activeId === null || activeId === hoverCardId) return true;
    const activePriority = activeSource === "hover" ? 2 : 1;
    const nextPriority = nextSource === "hover" ? 2 : 1;
    return nextPriority >= activePriority;
  };

  const handleHoverIntent = () => {
    openSourceRef.current = "hover";
    if (suspended) return;
    if (activeId !== null && activeId !== hoverCardId && activeSource === "focus") {
      setRequestedOpen(true);
      setActiveHoverCard(hoverCardId, "hover");
    }
  };

  return (
    <HoverCard
      open={open}
      openDelay={openDelay}
      onOpenChange={(nextOpen) => {
        if (nextOpen && suspended) return;
        setRequestedOpen(nextOpen);
        if (nextOpen) {
          const nextSource = openSourceRef.current;
          if (shouldPreferOpenSource(nextSource)) {
            setActiveHoverCard(hoverCardId, nextSource);
          }
          return;
        }
        if (getActiveHoverCardId() === hoverCardId) {
          setActiveHoverCard(null, null);
        }
      }}
    >
      <HoverCardTrigger asChild>
        <span
          className={cn("inline align-baseline", triggerClassName)}
          onMouseOver={handleHoverIntent}
          onPointerOver={handleHoverIntent}
          onFocusCapture={() => {
            openSourceRef.current = "focus";
          }}
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        sideOffset={sideOffset}
        align="start"
        className="w-80 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <UserAvatar
            id={person.id}
            displayName={person.displayName}
            avatarUrl={person.avatar}
            className="h-11 w-11 shrink-0"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{compactLabel}</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(`people.status.${statusKey}`)}
              </span>
            </div>
            {person.name && person.name !== compactLabel ? (
              <p className="truncate text-xs text-muted-foreground">@{person.name}</p>
            ) : null}
            {person.nip05 ? (
              <p className="truncate text-xs text-muted-foreground">{person.nip05}</p>
            ) : null}
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              {pubkeyLabel}
            </p>
          </div>
        </div>
        {person.lastPresenceAtMs || viewingLabel ? (
          <div className="mt-3 rounded-md border border-border/60 bg-muted/40 p-3">
            <div className="grid gap-2 text-xs text-muted-foreground">
              {person.lastPresenceAtMs ? (
                <div className="flex items-start justify-between gap-3">
                  <span>{t("people.presence.lastSeen")}</span>
                  <span className="text-right text-foreground">
                    {new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(person.lastPresenceAtMs))}
                  </span>
                </div>
              ) : null}
              {viewingLabel ? (
                <div className="flex items-start justify-between gap-3">
                  <span>{t("people.presence.viewing")}</span>
                  <span
                    className="max-w-[12rem] text-right text-foreground"
                    title={resolvedPresenceTaskTitle || presenceViewLabel || person.presenceTaskId || ""}
                  >
                    {viewingLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {person.about ? (
          <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
            {person.about}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
