import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isStrictAniListIdentityMatch } from "../src/lib/anilist-identity";

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
  assert.match(cardSource, /社区口碑/);
  assert.match(cardSource, /Bangumi/);
  assert.match(cardSource, /AniList/);
  assert.match(cardSource, /各来源保留原评分尺度，不计算综合分/);
  assert.match(cardSource, /人评分/);
  assert.match(cardSource, /人气/);
  assert.match(cardSource, /更新于/);
  assert.match(aggregateSource, /getSubjectRating/);
  assert.match(aggregateSource, /getMediaRatingById/);
  assert.match(anilistSource, /averageScore/);
  assert.match(anilistSource, /popularity/);
  assert.match(bangumiSource, /bangumi-subject-rating-v1/);
  assert.doesNotMatch(aggregateSource, /MyAnimeList|Anime Corner|IMDb/u);
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
