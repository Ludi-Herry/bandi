import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isStrictAniListIdentityMatch } from "../src/lib/anilist-identity";
import { parseJikanAnimeRating } from "../src/lib/jikan-rating";

const anilistMedia = {
  id: 37965,
  title: {
    romaji: "Kaze ga Tsuyoku Fuiteiru",
    native: "風が強く吹いている",
    english: "Run with the Wind",
  },
  episodes: 23,
  seasonYear: 2018,
  season: "FALL" as const,
  coverImage: { extraLarge: null, large: null },
  description: null,
  status: "FINISHED",
  format: "TV",
  averageScore: 82,
  meanScore: 82,
  popularity: 120000,
  siteUrl: "https://anilist.co/anime/37965",
};

test("anime detail reuses existing Bangumi and AniList clients for separate ratings", () => {
  const pageSource = readFileSync(
    "src/app/(main)/anime/[id]/page.tsx",
    "utf8",
  );
  const cardSource = readFileSync(
    "src/components/features/AnimeCommunityRatingCard.tsx",
    "utf8",
  );
  const aggregateSource = readFileSync(
    "src/lib/anime-community-ratings.ts",
    "utf8",
  );
  const anilistSource = readFileSync("src/lib/anilist.ts", "utf8");
  const bangumiSource = readFileSync("src/lib/bangumi.ts", "utf8");

  assert.match(pageSource, /AnimeCommunityRatingCard/);
  assert.match(pageSource, /communityRatingsPromise/);
  assert.match(pageSource, /getJikanRatingByMalId\(ratings\.malId\)\.catch\(\(\) => null\)/);
  assert.match(cardSource, /社区口碑/);
  assert.match(cardSource, /Bangumi/);
  assert.match(cardSource, /AniList/);
  assert.match(cardSource, /MyAnimeList/);
  assert.match(cardSource, /Jikan API/);
  assert.match(cardSource, /<Suspense fallback=\{null\}>/);
  assert.match(cardSource, /豆瓣电影/);
  assert.match(cardSource, /text-\[26px\] font-bold leading-none text-\[color:var\(--accent\)\]/);
  assert.match(cardSource, /text-\[13px\] font-semibold text-\[color:var\(--text-primary\)\]/);
  assert.match(cardSource, /各来源保留原评分尺度，不计算综合分/);
  assert.match(cardSource, /人评分/);
  assert.match(cardSource, /人气/);
  assert.match(cardSource, /更新于/);
  assert.match(aggregateSource, /getSubjectRating/);
  assert.match(aggregateSource, /getMediaRatingById/);
  assert.match(aggregateSource, /doubanRating > 0/);
  assert.match(aggregateSource, /doubanRating <= 10/);
  assert.match(anilistSource, /averageScore/);
  assert.match(anilistSource, /idMal/);
  assert.match(anilistSource, /popularity/);
  assert.match(bangumiSource, /bangumi-subject-rating-v1/);
  assert.doesNotMatch(aggregateSource, /MyAnimeList|Anime Corner|IMDb/u);
});

test("Jikan ratings require the AniList-linked MAL ID and a valid score", () => {
  const fetchedAt = "2026-09-21T12:00:00.000Z";
  assert.deepEqual(
    parseJikanAnimeRating(
      {
        data: {
          mal_id: 1,
          score: 8.75,
          scored_by: 1_068_728,
          url: "https://untrusted.example/anime/1",
        },
      },
      1,
      fetchedAt,
    ),
    {
      score: 8.75,
      scoredBy: 1_068_728,
      fetchedAt,
      href: "https://myanimelist.net/anime/1",
    },
  );
  assert.equal(
    parseJikanAnimeRating({ data: { mal_id: 2, score: 8.75 } }, 1, fetchedAt),
    null,
  );
  assert.equal(
    parseJikanAnimeRating({ data: { mal_id: 1, score: 0 } }, 1, fetchedAt),
    null,
  );
  assert.equal(
    parseJikanAnimeRating({ data: { mal_id: 1, score: "8.75" } }, 1, fetchedAt),
    null,
  );
  const jikanSource = readFileSync("src/lib/jikan.ts", "utf8");
  assert.match(jikanSource, /api\.jikan\.moe\/v4\/anime\/\$\{malId\}/);
  assert.match(jikanSource, /AbortSignal\.timeout\(8_000\)/);
  assert.doesNotMatch(jikanSource, /\?q=/);
});

test("AniList title fallback requires exact identity and a compatible year", () => {
  assert.equal(
    isStrictAniListIdentityMatch(anilistMedia, {
      title: "强风吹拂",
      titleJa: "風が強く吹いている",
      year: 2018,
    }),
    true,
  );
  assert.equal(
    isStrictAniListIdentityMatch(anilistMedia, {
      title: "强风吹拂",
      titleJa: "風が強く吹いている",
      year: 2024,
    }),
    false,
  );
  assert.equal(
    isStrictAniListIdentityMatch(anilistMedia, {
      title: "强风吹拂 第二季",
      titleJa: "風が強く吹いている 第2期",
      year: 2018,
    }),
    false,
  );
});
