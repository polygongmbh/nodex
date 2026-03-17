import type { MouseEvent } from "react";
import { decodeGeohash, buildPreferredMapLink } from "@/infrastructure/nostr/geohash-location";
import { featureDebugLog } from "@/lib/feature-debug";

interface TaskLocationChipProps {
  geohash: string;
  className?: string;
}

function formatDistanceMeters(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
  return `${Math.round(value)}m`;
}

export function TaskLocationChip({ geohash, className }: TaskLocationChipProps) {
  const decoded = decodeGeohash(geohash);
  if (!decoded) {
    return (
      <span className={className}>
        {`📍 ${geohash}`}
      </span>
    );
  }

  const approxLat = decoded.latitude.toFixed(2);
  const approxLon = decoded.longitude.toFixed(2);
  const roughRegion = `${approxLat}, ${approxLon}`;
  const radiusLabel = formatDistanceMeters(decoded.radiusMeters);

  const openMap = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (typeof window === "undefined") return;
    const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const target = buildPreferredMapLink(decoded.latitude, decoded.longitude, userAgent);
    featureDebugLog("location-chip", "Opening location chip map link", {
      geohash,
      latitude: decoded.latitude,
      longitude: decoded.longitude,
      target,
    });
    const isMobileDeepLink = /android|iphone|ipad|ipod/i.test(userAgent) || target.startsWith("geo:");
    if (isMobileDeepLink) {
      window.location.assign(target);
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={openMap}
      className={className}
      aria-label={`Open map near ${roughRegion}`}
      title={`Approx ${roughRegion} (${radiusLabel} area). Open in maps.`}
    >
      {`📍 ${roughRegion}`}
    </button>
  );
}
