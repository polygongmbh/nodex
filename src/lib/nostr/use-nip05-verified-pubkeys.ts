import { useState, useEffect, useContext } from "react";
import { NDKContext } from "@/infrastructure/nostr/provider/ndk-provider";

interface PersonWithNip05 {
  pubkey: string;
  nip05?: string;
}

export function useNip05VerifiedPubkeys(people: PersonWithNip05[]): Set<string> {
  const ndk = useContext(NDKContext)?.ndk ?? null;
  const [verifiedPubkeys, setVerifiedPubkeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ndk) return;
    let cancelled = false;

    for (const person of people) {
      if (!person.nip05) continue;
      const { pubkey, nip05 } = person;
      ndk.getUser({ pubkey }).validateNip05(nip05).then((result) => {
        if (!cancelled && result === true) {
          setVerifiedPubkeys((prev) => {
            if (prev.has(pubkey)) return prev;
            const next = new Set(prev);
            next.add(pubkey);
            return next;
          });
        }
      }).catch(() => {});
    }

    return () => { cancelled = true; };
  }, [ndk, people]);

  return verifiedPubkeys;
}
