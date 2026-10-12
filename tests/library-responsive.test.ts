import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const libraryPageSource = readFileSync("src/app/(main)/library/page.tsx", "utf8");
const libraryClientSource = readFileSync(
  "src/app/(main)/library/LibraryClient.tsx",
  "utf8",
);
const rowItemSource = readFileSync(
  "src/components/features/AnimeRowItem.tsx",
  "utf8",
);

test("library page collapses stats and main content for narrow screens", () => {
  assert.match(libraryPageSource, /grid-cols-1 gap-6/);
  assert.match(libraryPageSource, /lg:grid-cols-12/);
  assert.match(libraryPageSource, /order-2 grid grid-cols-1/);
  assert.match(libraryPageSource, /md:grid-cols-2/);
  assert.match(libraryPageSource, /order-1 min-w-0/);
});

test("library hero background downsizes Bangumi covers", () => {
  assert.match(libraryPageSource, /resizeBangumiImageUrl/);
  assert.match(
    libraryPageSource,
    /resizeBangumiImageUrl\(it\.anime\.coverUrl as string, "card"\)/,
  );
});

test("library controls remain usable on phone widths", () => {
  assert.match(libraryClientSource, /flex-wrap items-center gap-1 overflow-visible/);
  assert.match(libraryClientSource, /min-\[560px\]:w-fit/);
  assert.match(libraryClientSource, /grid-cols-2 gap-2/);
  assert.match(libraryClientSource, /min-\[640px\]:flex/);
  assert.match(libraryClientSource, /w-full shrink-0/);
  assert.match(libraryClientSource, /min-\[640px\]:w-auto/);
});

test("library status tabs stay fully visible on medium desktop widths", () => {
  // 并排与否看内容列宽度，不看窗口宽度：1280 窗口带左侧统计栏时内容列只有约 666px。
  assert.match(libraryClientSource, /@container mb-5/);
  assert.match(libraryClientSource, /@min-\[900px\]:flex-row @min-\[900px\]:items-start/);
  assert.match(libraryClientSource, /overflow-visible/);
  assert.match(libraryClientSource, /@min-\[900px\]:shrink-0/);
  assert.doesNotMatch(libraryClientSource, /xl:flex-nowrap/);
});

test("library wrapped toolbar rows share the same left edge until the column fits one row", () => {
  assert.match(libraryClientSource, /min-\[640px\]:justify-start/);
  assert.match(libraryClientSource, /@min-\[900px\]:ml-auto/);
  assert.match(libraryClientSource, /@min-\[900px\]:w-auto/);
  assert.match(libraryClientSource, /@min-\[900px\]:flex-nowrap/);
  assert.match(libraryClientSource, /@min-\[900px\]:justify-end/);
  assert.doesNotMatch(libraryClientSource, /xl:ml-auto/);
  assert.doesNotMatch(libraryClientSource, /\smin-\[900px\]:ml-auto/);
});

test("detail rating stars stay on one row inside the narrow side column", () => {
  const ratingNotesSource = readFileSync(
    "src/components/features/RatingNotes.tsx",
    "utf8",
  );
  assert.match(ratingNotesSource, /@container relative overflow-hidden/);
  assert.match(ratingNotesSource, /@min-\[300px\]:flex-row/);
  assert.match(ratingNotesSource, /flex min-w-0 flex-nowrap items-center gap-1/);
  assert.doesNotMatch(ratingNotesSource, /min-\[460px\]:flex-row/);
});

test("library list rows and bulk actions can wrap without page overflow", () => {
  assert.match(rowItemSource, /flex-wrap sm:flex-nowrap/);
  assert.match(rowItemSource, /w-full shrink-0/);
  assert.match(rowItemSource, /sm:w-auto/);
  assert.match(libraryClientSource, /aria-label="批量操作"/);
  assert.match(libraryClientSource, /flex w-full items-center justify-between/);
  assert.match(libraryClientSource, /flex w-full items-center justify-end/);
  assert.match(libraryClientSource, /hidden h-5 w-px/);
});
