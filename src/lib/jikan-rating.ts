export interface JikanAnimeRating {
  score: number;
  scoredBy: number | null;
  fetchedAt: string;
  href: string;
}

export function parseJikanAnimeRating(
  payload: unknown,
  expectedMalId: number,
  fetchedAt: string,
): JikanAnimeRating | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return null;
  }
  const data = payload.data;
  if (!data || typeof data !== "object") return null;

  const candidate = data as {
    mal_id?: unknown;
    score?: unknown;
    scored_by?: unknown;
  };
  if (candidate.mal_id !== expectedMalId) return null;
  if (
    typeof candidate.score !== "number" ||
    !Number.isFinite(candidate.score) ||
    candidate.score <= 0 ||
    candidate.score > 10
  ) {
    return null;
  }

  return {
    score: candidate.score,
    scoredBy:
      typeof candidate.scored_by === "number" &&
      Number.isSafeInteger(candidate.scored_by) &&
      candidate.scored_by >= 0
        ? candidate.scored_by
        : null,
    fetchedAt,
    href: `https://myanimelist.net/anime/${expectedMalId}`,
  };
}
