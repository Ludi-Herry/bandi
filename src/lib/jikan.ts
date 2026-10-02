import "server-only";

import { unstable_cache } from "next/cache";
import { parseJikanAnimeRating } from "@/lib/jikan-rating";

/** Jikan is an unofficial, upstream-scraped MAL API; never title-search here. */
async function fetchJikanRatingByMalId(malId: number) {
  if (!Number.isSafeInteger(malId) || malId <= 0) return null;

  const response = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`jikan_http_${response.status}`);

  return parseJikanAnimeRating(
    await response.json(),
    malId,
    new Date().toISOString(),
  );
}

export const getJikanRatingByMalId = unstable_cache(
  fetchJikanRatingByMalId,
  ["jikan-anime-rating-v1"],
  { revalidate: 6 * 60 * 60 },
);
