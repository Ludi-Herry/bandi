import "server-only";

import { unstable_cache } from "next/cache";
import {
  getMediaByRomajiTitle,
  getMediaRatingById,
} from "@/lib/anilist";
import { isStrictAniListIdentityMatch } from "@/lib/anilist-identity";
import { getSubjectRating } from "@/lib/bangumi";

export interface AnimeCommunityRatings {
  bangumi: {
    score: number;
    total: number | null;
    rank: number | null;
    fetchedAt: string;
    href: string;
  } | null;
  anilist: {
    averageScore: number;
    meanScore: number | null;
    popularity: number | null;
    fetchedAt: string;
    href: string;
  } | null;
  /** AniList's cross-reference, used only for an exact-ID Jikan lookup. */
  malId: number | null;
  douban: {
    score: number;
    fetchedAt: string | null;
    href: string;
  } | null;
}

export async function getAnimeCommunityRatings({
  bangumiId,
  anilistId,
  title,
  titleJa,
  year,
  doubanId,
  doubanRating,
  doubanRatingFetchedAt,
}: {
  bangumiId: number | null;
  anilistId: number | null;
  title: string;
  titleJa: string | null;
  year: number | null;
  doubanId: string | null;
  doubanRating: number | null;
  doubanRatingFetchedAt: Date | null;
}): Promise<AnimeCommunityRatings> {
  const [bangumi, anilist] = await Promise.all([
    bangumiId ? getSubjectRating(bangumiId) : Promise.resolve(null),
    anilistId
      ? getMediaRatingById(anilistId)
      : getAniListRatingByIdentity(title, titleJa, year),
  ]);
  const mappedMalId = anilist?.idMal;

  return {
    bangumi:
      bangumi && bangumiId
        ? {
            ...bangumi,
            href: `https://bangumi.tv/subject/${bangumiId}`,
          }
        : null,
    anilist:
      anilist && anilist.averageScore != null
        ? {
            averageScore: anilist.averageScore,
            meanScore: anilist.meanScore,
            popularity: anilist.popularity,
            fetchedAt: anilist.fetchedAt,
            href: anilist.siteUrl || `https://anilist.co/anime/${anilist.id}`,
          }
        : null,
    malId:
      typeof mappedMalId === "number" &&
      Number.isSafeInteger(mappedMalId) &&
      mappedMalId > 0
        ? mappedMalId
        : null,
    douban:
      doubanId &&
      /^\d+$/.test(doubanId) &&
      doubanRating != null &&
      Number.isFinite(doubanRating) &&
      doubanRating > 0 &&
      doubanRating <= 10
        ? {
            score: doubanRating,
            fetchedAt: doubanRatingFetchedAt?.toISOString() ?? null,
            href: `https://movie.douban.com/subject/${encodeURIComponent(doubanId)}/`,
          }
        : null,
  };
}

const getAniListRatingByIdentity = unstable_cache(
  async (title: string, titleJa: string | null, year: number | null) => {
    const queries = [...new Set([titleJa, title].filter(Boolean))] as string[];
    for (const query of queries) {
      const media = await getMediaByRomajiTitle(query, {
        revalidate: 6 * 60 * 60,
      });
      if (!isStrictAniListIdentityMatch(media, { title, titleJa, year })) {
        continue;
      }
      return media
        ? {
            id: media.id,
            idMal: media.idMal ?? null,
            averageScore: media.averageScore,
            meanScore: media.meanScore,
            popularity: media.popularity,
            siteUrl: media.siteUrl,
            fetchedAt: new Date().toISOString(),
          }
        : null;
    }
    return null;
  },
  ["anilist-rating-identity-v2"],
  { revalidate: 6 * 60 * 60 },
);
