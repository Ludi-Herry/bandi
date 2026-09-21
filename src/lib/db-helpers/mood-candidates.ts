import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { anime } from "@/db/schema";
import { currentSeason } from "@/lib/bangumi";
import {
  getCinemaLibrary,
  getCinemaWatchlist,
  type CinemaItem,
} from "@/lib/db-helpers/cinema";
import { getSeasonalBrowseResult } from "@/lib/db-helpers/browse";
import {
  getAnimeLocalLibrary,
  getLibrary,
} from "@/lib/db-helpers/library";
import type {
  MoodCandidateSource,
  MoodResourcePool,
} from "@/lib/mood-picker";

type CinemaMetadata = {
  synopsis: string | null;
  tags: string[] | null;
};

const POOL_PRIORITY: Record<Exclude<MoodResourcePool, "all">, number> = {
  local: 3,
  tracked: 2,
  catalog: 1,
};

function includesPool(
  requested: MoodResourcePool,
  candidate: Exclude<MoodResourcePool, "all">,
) {
  return requested === "all" || requested === candidate;
}

function addCandidate(
  byIdentity: Map<string, MoodCandidateSource>,
  candidate: MoodCandidateSource,
) {
  const current = byIdentity.get(candidate.identityKey);
  if (
    !current ||
    POOL_PRIORITY[candidate.resourcePool] > POOL_PRIORITY[current.resourcePool]
  ) {
    byIdentity.set(candidate.identityKey, candidate);
  }
}

function loadCinemaMetadata(items: readonly CinemaItem[]) {
  const ids = [...new Set(items.map((item) => item.id))];
  return new Map<number, CinemaMetadata>(
    ids.length > 0
      ? db
          .select({
            id: anime.id,
            synopsis: anime.synopsis,
            tags: anime.tags,
          })
          .from(anime)
          .where(inArray(anime.id, ids))
          .all()
          .map((row) => [row.id, row] as const)
      : [],
  );
}

function toCinemaCandidate(
  item: CinemaItem,
  metadata: CinemaMetadata | undefined,
  resourcePool: "local" | "tracked" | "catalog",
): MoodCandidateSource {
  return {
    localId: item.id,
    identityKey: `cinema:${item.id}`,
    resourcePool,
    mediaType: item.mediaType,
    title: item.title,
    titleJa: item.titleJa,
    coverUrl: item.posterUrl,
    synopsis: metadata?.synopsis ?? null,
    year: item.year,
    tags: metadata?.tags ?? item.tags,
    watchStatus: item.watchStatus,
    href:
      resourcePool === "local"
        ? `/cinema/${item.id}?from=local`
        : `/cinema/${item.id}?from=library`,
  };
}

export async function getMoodCandidates(
  userId: string,
  pool: MoodResourcePool,
): Promise<MoodCandidateSource[]> {
  const byIdentity = new Map<string, MoodCandidateSource>();

  if (includesPool(pool, "local")) {
    for (const item of getAnimeLocalLibrary(userId)) {
      if (item.anime.isAdult) continue;
      addCandidate(byIdentity, {
        localId: item.anime.id,
        identityKey: `anime:${item.anime.id}`,
        resourcePool: "local",
        mediaType: "anime",
        title: item.anime.title,
        titleJa: item.anime.titleJa,
        coverUrl: item.anime.coverUrl,
        synopsis: item.anime.synopsis,
        year: item.anime.year,
        tags: item.anime.tags ?? [],
        watchStatus: item.userAnime?.watchStatus ?? null,
        href: `/anime/${item.anime.id}?from=local`,
      });
    }
  }

  if (includesPool(pool, "tracked")) {
    for (const item of getLibrary(userId).filter(
      (candidate) => !candidate.anime.isAdult,
    )) {
      addCandidate(byIdentity, {
        localId: item.anime.id,
        identityKey: `anime:${item.anime.id}`,
        resourcePool: "tracked",
        mediaType: "anime",
        title: item.anime.title,
        titleJa: item.anime.titleJa,
        coverUrl: item.anime.coverUrl,
        synopsis: item.anime.synopsis,
        year: item.anime.year,
        tags: item.anime.tags ?? [],
        watchStatus: item.userAnime.watchStatus,
        href: `/anime/${item.anime.id}`,
      });
    }
  }

  const localCinema = includesPool(pool, "local")
    ? (() => {
        const library = getCinemaLibrary(userId);
        return [...library.drama, ...library.movie];
      })()
    : [];
  const nonLocalCinema =
    includesPool(pool, "tracked") || includesPool(pool, "catalog")
      ? getCinemaWatchlist(userId)
      : [];
  const cinemaMetadata = loadCinemaMetadata([
    ...localCinema,
    ...nonLocalCinema,
  ]);

  for (const item of localCinema) {
    addCandidate(
      byIdentity,
      toCinemaCandidate(item, cinemaMetadata.get(item.id), "local"),
    );
  }
  if (includesPool(pool, "tracked")) {
    for (const item of nonLocalCinema.filter(
      (candidate) => candidate.watchStatus != null,
    )) {
      addCandidate(
        byIdentity,
        toCinemaCandidate(item, cinemaMetadata.get(item.id), "tracked"),
      );
    }
  }
  if (includesPool(pool, "catalog")) {
    for (const item of nonLocalCinema.filter(
      (candidate) => candidate.watchStatus == null,
    )) {
      addCandidate(
        byIdentity,
        toCinemaCandidate(item, cinemaMetadata.get(item.id), "catalog"),
      );
    }
  }

  if (includesPool(pool, "catalog")) {
    try {
      const season = currentSeason();
      const result = await getSeasonalBrowseResult(
        userId,
        season.season,
        season.year,
      );
      for (const item of result.items) {
        const href =
          item.localAnimeId != null
            ? `/anime/${item.localAnimeId}`
            : item.bangumiId != null
              ? `/anime/bgm/${item.bangumiId}`
              : item.yucKey
                ? `/anime/yuc/${encodeURIComponent(item.yucKey)}`
                : "/browse";
        const year = item.date?.match(/^\d{4}/u)
          ? Number(item.date.slice(0, 4))
          : season.year;
        addCandidate(byIdentity, {
          localId: item.localAnimeId,
          identityKey:
            item.localAnimeId != null
              ? `anime:${item.localAnimeId}`
              : item.bangumiId != null
                ? `bgm:${item.bangumiId}`
                : item.yucKey
                  ? `yuc:${item.yucKey}`
                  : item.itemKey,
          resourcePool: "catalog",
          mediaType: "anime",
          title: item.title,
          titleJa: item.titleJa,
          coverUrl: item.coverUrl,
          synopsis: item.summary,
          year,
          tags: item.tags,
          watchStatus: null,
          href,
        });
      }
    } catch (error) {
      console.warn("[mood-picker] seasonal catalog unavailable", error);
    }
  }

  return [...byIdentity.values()];
}
