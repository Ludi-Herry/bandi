import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { ensureDatabaseSchema } from "../src/db/bootstrap";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-home-empty-state-"));
const dbPath = join(tempDir, "home.db");
process.env.DATABASE_URL = dbPath;

const USER_ID = "home-rollover-user";
const EMPTY_USER_ID = "home-empty-user";
// 2026-10-11 本地时间：秋季刚开始，用户追的全是 2026 夏季番。
const OCTOBER_NOW = new Date(2026, 9, 11, 12, 0, 0);

function toSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

/** 12 集周播，最后一集落在 lastAiredAt。 */
function weeklyAiredDates(lastAiredAt: Date, count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(lastAiredAt);
    date.setDate(date.getDate() - (count - 1 - index) * 7);
    return date;
  });
}

function setupSeasonRolloverDb() {
  const sqlite = new Database(dbPath);
  ensureDatabaseSchema(sqlite);
  const insertUser = sqlite.prepare(
    "insert into users (id, username, password_hash) values (?, ?, ?)",
  );
  insertUser.run(USER_ID, USER_ID, "test-only");
  insertUser.run(EMPTY_USER_ID, EMPTY_USER_ID, "test-only");

  const insertAnime = sqlite.prepare(
    `insert into anime (id, title, type, status, total_episodes, season, year, media_type)
     values (?, ?, 'TV', 'airing', 12, ?, 2026, 'anime')`,
  );
  const insertEpisode = sqlite.prepare(
    "insert into episodes (anime_id, number, aired_at) values (?, ?, ?)",
  );
  const insertTracking = sqlite.prepare(
    `insert into user_anime (user_id, anime_id, watch_status, current_episode)
     values (?, ?, ?, ?)`,
  );

  const rows: Array<{
    id: number;
    title: string;
    season: string;
    lastAiredAt: Date;
    watchStatus: string;
    currentEpisode: number;
  }> = [
    // 夏季番，9/29 完结，用户看到 EP.08：换季后仍应出现在首页
    { id: 1, title: "夏季未看完", season: "summer", lastAiredAt: new Date(2026, 8, 29, 23), watchStatus: "watching", currentEpisode: 8 },
    // 夏季番，9/20 完结（三周内），已追平：近期放送窗口内仍保留
    { id: 2, title: "夏季近期完结已追平", season: "summer", lastAiredAt: new Date(2026, 8, 20, 23), watchStatus: "watching", currentEpisode: 12 },
    // 夏季番，9/11 完结（超过四周），已追平：不再占首页 Hero
    { id: 3, title: "夏季早已完结已追平", season: "summer", lastAiredAt: new Date(2026, 8, 11, 23), watchStatus: "watching", currentEpisode: 12 },
    // 春季番（两季之前）未看完：不算换季延续
    { id: 4, title: "春季未看完", season: "spring", lastAiredAt: new Date(2026, 5, 20, 23), watchStatus: "watching", currentEpisode: 3 },
    // 夏季番已弃：不进 Hero
    { id: 5, title: "夏季已弃", season: "summer", lastAiredAt: new Date(2026, 8, 29, 23), watchStatus: "dropped", currentEpisode: 2 },
  ];

  for (const row of rows) {
    insertAnime.run(row.id, row.title, row.season);
    weeklyAiredDates(row.lastAiredAt).forEach((airedAt, index) => {
      insertEpisode.run(row.id, index + 1, toSeconds(airedAt));
    });
    insertTracking.run(USER_ID, row.id, row.watchStatus, row.currentEpisode);
  }
  sqlite.close();
}

setupSeasonRolloverDb();

test("empty home points primary CTA to browse and opens search as secondary action", () => {
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
  const searchButtonSource = readFileSync(
    "src/components/features/SearchOpenButton.tsx",
    "utf8",
  );
  const searchCommandSource = readFileSync(
    "src/components/features/SearchCommand.tsx",
    "utf8",
  );
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");

  assert.match(homeSource, /<a href="\/browse">前往番剧库<\/a>/);
  assert.doesNotMatch(homeSource, /<a href="\/library">前往追番库<\/a>/);
  assert.match(homeSource, /<SearchOpenButton \/>/);
  assert.match(searchButtonSource, /variant="secondary"/);
  assert.match(searchButtonSource, /bandi:open-search/);
  assert.match(searchCommandSource, /bandi:open-search/);
  assert.match(navSource, /bandi:open-search/);
  assert.match(homeSource, /Ctrl K/);
  assert.doesNotMatch(homeSource, /⌘K/);
});

test("empty home capability copy reflects the current product structure", () => {
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(homeSource, /在番剧库发现本季新番/);
  assert.match(homeSource, /今日更新、漏看提醒和继续观看/);
  assert.match(homeSource, /扫描本地动画和影视文件/);
  assert.match(homeSource, /RSS 找源和下载管理/);
  assert.doesNotMatch(homeSource, /自动从 Bangumi\/AniList 同步集数与放送日期/);
  assert.doesNotMatch(homeSource, /配置 RSS 自动下载到 qBittorrent/);
});

test("home keeps previous-season tracked shows after a season rollover", async () => {
  const {
    getContinueWatching,
    getHeroCandidates,
    getLibraryStats,
    isHomeLibraryEmpty,
  } = await import("../src/lib/db-helpers/library");

  const heroTitles = getHeroCandidates(USER_ID, undefined, OCTOBER_NOW)
    .map((item) => item.anime.title)
    .sort();
  assert.deepEqual(heroTitles, ["夏季未看完", "夏季近期完结已追平"].sort());

  // 没有下载 / 播放记录时继续观看为空，首页仍不能退回空库
  assert.equal(getContinueWatching(USER_ID, 4).length, 0);
  assert.equal(isHomeLibraryEmpty(getLibraryStats(USER_ID)), false);
});

test("home empty state only appears when the library has no active items", async () => {
  const { getLibraryStats, isHomeLibraryEmpty } = await import(
    "../src/lib/db-helpers/library"
  );

  assert.equal(isHomeLibraryEmpty(getLibraryStats(EMPTY_USER_ID)), true);
  assert.equal(
    isHomeLibraryEmpty({ watching: 0, planning: 0, onhold: 0 }),
    true,
  );
  assert.equal(
    isHomeLibraryEmpty({ watching: 0, planning: 1, onhold: 0 }),
    false,
  );

  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
  assert.match(homeSource, /isHomeLibraryEmpty\(libraryStats\)/);
});
