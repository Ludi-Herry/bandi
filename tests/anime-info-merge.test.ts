import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { selectAnimeInfoFacts } from "../src/components/features/YucAnimeInfo";
import type { YucDetailMatch } from "../src/lib/yuc/detail";

const anime = {
  titleJa: "メダリスト",
  type: "TV" as const,
  status: "airing" as const,
  totalEpisodes: 13,
  year: 2025,
  airingDay: null,
  airingTime: null,
};

const match: YucDetailMatch = {
  matchedBy: "metadata",
  entry: {
    sourceKey: "yuc:season:202501:test",
    sourceKind: "season",
    sourceUrl: "https://yuc.wiki/202501/",
    title: "金牌得主",
    titleJa: "メダリスト",
    coverUrl: null,
    premiereRaw: "1/4周六深夜",
    premiereDate: "2025-01-04",
    weeklyDay: 6,
    weeklyTime: null,
    scheduleRaw: "1/4周六深夜",
    totalEpisodes: 13,
    format: "TV",
    tags: [],
    staff: [],
    cast: ["声优甲", "声优乙"],
    studio: "ENGI",
    original: "漫画原作",
    officialUrl: "https://example.com/official",
    pvUrl: "https://example.com/pv",
    providers: [{
      label: "大陆",
      service: "播放平台",
      url: "https://example.com/watch",
    }],
    seasonYear: 2025,
    seasonMonth: 1,
  },
};

test("merged info has one episode row and preserves basic plus YUC facts", () => {
  const facts = selectAnimeInfoFacts(anime, match);
  assert.deepEqual(facts.slice(0, 6), [
    ["原名", "メダリスト"],
    ["类型", "TV 动画"],
    ["状态", "连载中"],
    ["集数", "13 集"],
    ["开播日期", "2025 · 1/4周六深夜"],
    ["每周播出", "周六"],
  ]);
  assert.equal(facts.filter(([label]) => label === "集数").length, 1);
  assert.deepEqual(facts.slice(6), [
    ["制作公司", "ENGI"],
    ["原作", "漫画原作"],
    ["声优", "声优甲、声优乙"],
  ]);

  const source = readFileSync("src/components/features/YucAnimeInfo.tsx", "utf8");
  const page = readFileSync("src/app/(main)/anime/[id]/page.tsx", "utf8");
  assert.match(source, /作品资料/);
  for (const text of ["正版播放", "动画官网", "观看 PV", "长门番堂 · CC BY-NC-SA 4.0", "来源页"]) {
    assert.ok(source.includes(text), `${text} remains in the merged card`);
  }
  assert.match(page, /fallback=\{<YucAnimeInfo anime=\{anime\} match=\{null\} \/>\}/);
  assert.doesNotMatch(page, />\s*基本信息\s*</);
});

test("basic info remains available without YUC and YUC count fills a missing local count", () => {
  const fallbackFacts = selectAnimeInfoFacts(anime, null);
  assert.deepEqual(fallbackFacts.slice(3), [
    ["集数", "13 集"],
    ["首播", "2025"],
    ["更新时间", "—"],
  ]);
  const missingLocalCount = selectAnimeInfoFacts(
    { ...anime, totalEpisodes: null },
    match,
  );
  assert.deepEqual(missingLocalCount.find(([label]) => label === "集数"), [
    "集数",
    "13 话",
  ]);
  const yearInSource = selectAnimeInfoFacts(anime, {
    ...match,
    entry: { ...match.entry, premiereRaw: "2026/1/4上映" },
  });
  assert.deepEqual(yearInSource.find(([label]) => label === "开播日期"), [
    "开播日期",
    "2026/1/4上映",
  ]);
});
