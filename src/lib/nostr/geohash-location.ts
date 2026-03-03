const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const GEOHASH_PATTERN = /^[0123456789bcdefghjkmnpqrstuvwxyz]+$/;
export const DEFAULT_GEOHASH_PRECISION = 7;

export function normalizeGeohash(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (!GEOHASH_PATTERN.test(normalized)) return undefined;
  return normalized;
}

export function buildGeohashTag(value: string | undefined): string[] | undefined {
  const geohash = normalizeGeohash(value);
  if (!geohash) return undefined;
  return ["g", geohash];
}

export function parseFirstGeohashTag(tags: string[][]): string | undefined {
  for (const tag of tags) {
    if (tag[0]?.toLowerCase() !== "g") continue;
    const geohash = normalizeGeohash(tag[1]);
    if (geohash) return geohash;
  }
  return undefined;
}

export function encodeGeohash(latitude: number, longitude: number, precision = DEFAULT_GEOHASH_PRECISION): string {
  let latMin = -90.0;
  let latMax = 90.0;
  let lonMin = -180.0;
  let lonMax = 180.0;

  let geohash = "";
  let bit = 0;
  let ch = 0;
  let isEven = true;

  while (geohash.length < precision) {
    if (isEven) {
      const midpoint = (lonMin + lonMax) / 2;
      if (longitude >= midpoint) {
        ch = (ch << 1) + 1;
        lonMin = midpoint;
      } else {
        ch = ch << 1;
        lonMax = midpoint;
      }
    } else {
      const midpoint = (latMin + latMax) / 2;
      if (latitude >= midpoint) {
        ch = (ch << 1) + 1;
        latMin = midpoint;
      } else {
        ch = ch << 1;
        latMax = midpoint;
      }
    }

    isEven = !isEven;
    bit += 1;

    if (bit === 5) {
      geohash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

