import { useEffect, useState } from "react";
import { resolveNip05Identifier } from "./nip05-resolver";

interface PersonWithNip05 {
  pubkey: string;
  nip05?: string;
}

export function useNip05VerifiedPubkeys(people: PersonWithNip05[]): Set<string> {
  const [verifiedPubkeys, setVerifiedPubkeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    for (const { pubkey, nip05 } of people) {
      if (!pubkey || !nip05) continue;
      const normalizedPubkey = pubkey.trim().toLowerCase();
      resolveNip05Identifier(nip05).then((resolved) => {
        if (cancelled) return;
        if (resolved !== normalizedPubkey) return;
        setVerifiedPubkeys((prev) => {
          if (prev.has(pubkey)) return prev;
          const next = new Set(prev);
          next.add(pubkey);
          return next;
        });
      });
    }
    return () => { cancelled = true; };
  }, [people]);

  return verifiedPubkeys;
}
