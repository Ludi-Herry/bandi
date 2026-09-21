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
}

export async function getAnimeCommunityRatings({
  bangumiId,
  anilistId,
  title,
  titleJa,
  year,
}: {
  bangumiId: number | null;
  anilistId: number | null;
  title: string;
  titleJa: string | null;
  year: number | null;
}): Promise<AnimeCommunityRatings> {
  const [bangumi, anilist] = await Promise.all([
    bangumiId ? getSubjectRating(bangumiId) : Promise.resolve(null),
    anilistId
      ? getMediaRatingById(anilistId)
      : getAniListRatingByIdentity(title, titleJa, year),
  ]);

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
  ["anilist-rating-identity-v1"],
  { revalidate: 6 * 60 * 60 },
);
