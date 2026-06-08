import { useMemo } from "react";
import { useNostrProfiles } from "@/infrastructure/nostr/use-nostr-profiles";
import { getCompactPersonLabel } from "@/types/person";

interface ReactionReactorListProps {
  // Sorted `[emoji, reactor pubkeys[]]`, mirroring the chip order.
  entries: [string, string[]][];
  targetId: string;
}

/**
 * The "who reacted" popup body: one line per emoji, the emoji followed by the
 * reactor names. Mounts only when the popup is open, so the profile lookup is
 * lazy. Unknown profiles fall back to a short npub via getCompactPersonLabel.
 */
export function ReactionReactorList({ entries, targetId }: ReactionReactorListProps) {
  const allPubkeys = useMemo(() => {
    const seen = new Set<string>();
    for (const [, pubkeys] of entries) {
      for (const pubkey of pubkeys) seen.add(pubkey);
    }
    return [...seen];
  }, [entries]);

  const { getProfile } = useNostrProfiles(allPubkeys);

  return (
    <div className="flex flex-col gap-1 text-xs" data-testid={`reactions-who-list-${targetId}`}>
      {entries.map(([emoji, pubkeys]) => (
        <div
          key={emoji}
          className="flex items-start gap-1.5"
          data-testid={`reactions-who-${targetId}-${emoji}`}
        >
          <span className="shrink-0 leading-5">{emoji}</span>
          <span className="min-w-0 leading-5 text-muted-foreground">
            {pubkeys.map((pubkey) => {
              const profile = getProfile(pubkey);
              const label = getCompactPersonLabel({
                pubkey,
                displayName: profile?.displayName ?? "",
                name: profile?.name ?? "",
              });
              return (
                <span key={pubkey} className="mr-1.5 inline-block whitespace-nowrap">
                  {label}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
