import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  collectCinemaYears,
  filterCinemaItems,
  parseCinemaYearFilter,
} from "../src/lib/cinema-filters";

const items = [
  { id: 1, title: "海街日记", titleJa: "Our Little Sister", year: 2015 },
  { id: 2, title: "重启人生", titleJa: "ブラッシュアップライフ", year: 2023 },
  { id: 3, title: "无年份样本", titleJa: null, year: null },
];

test("local cinema filters title, original title, and exact year in ordinary code", () => {
  assert.deepEqual(
    filterCinemaItems(items, { query: " 海街 ", year: null }).map(
      (item) => item.id,
    ),
    [1],
  );
  assert.deepEqual(
    filterCinemaItems(items, { query: "ブラッシュアップ", year: 2023 }).map(
      (item) => item.id,
    ),
    [2],
  );
  assert.deepEqual(
    filterCinemaItems(items, { query: "海街", year: 2023 }),
    [],
  );
});

test("local cinema year options are unique, descending, and URL parsing fails closed", () => {
  assert.deepEqual(collectCinemaYears([...items, items[0]]), [2023, 2015]);
  assert.equal(parseCinemaYearFilter("2023"), 2023);
  assert.equal(parseCinemaYearFilter("23"), null);
  assert.equal(parseCinemaYearFilter("2023x"), null);
  assert.equal(parseCinemaYearFilter(undefined), null);
});

test("local cinema page exposes query and year controls without Jev coupling", () => {
  const clientSource = readFileSync(
    "src/app/(main)/cinema/CinemaClient.tsx",
    "utf8",
  );
  const pageSource = readFileSync("src/app/(main)/cinema/page.tsx", "utf8");

  assert.match(clientSource, /placeholder="搜索片名或原名"/);
  assert.match(clientSource, /aria-label="按年份筛选本地影视"/);
  assert.match(clientSource, /filterCinemaItems/);
  assert.match(clientSource, /params\.set\("q", trimmedQuery\)/);
  assert.match(clientSource, /params\.set\("year", String\(year\)\)/);
  assert.match(pageSource, /initialQuery=\{sp\.q\}/);
  assert.match(pageSource, /initialYear=\{sp\.year\}/);
  assert.doesNotMatch(clientSource, /jev|typesafe|systemone/i);
});
