import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { mapWithConcurrency } from "../src/lib/bangumi";
import { createYucCache } from "../src/lib/yuc/cache";
import { runSequentially } from "../src/lib/yuc/client";

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function yucRequest(
  key: string,
  options: { forceRefresh?: boolean } = {},
) {
  return {
    key,
    sourceUrl: "https://yuc.wiki/202607/",
    ttlMs: 100,
    parserVersion: 2,
    parse: (source: string) => [source],
    ...options,
  };
}

test("forced YUC refresh waits for the new snapshot instead of returning stale immediately", async () => {
  let now = 1_000;
  let fetchCount = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const cache = createYucCache({
    now: () => now,
    staleRefreshWaitMs: 0,
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 1) return htmlResponse("first");
      await gate;
      return htmlResponse("second");
    },
  });

  await cache.get(yucRequest("season:202607"));
  now += 1_000;
  let settled = false;
  const forced = cache
    .get(yucRequest("season:202607", { forceRefresh: true }))
    .then((result) => {
      settled = true;
      return result;
    });
  await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
  assert.equal(settled, false);

  release();
  const result = await forced;
  assert.equal(result.status, "fresh");
  assert.deepEqual(result.items, ["second"]);
});

test("YUC quarter aggregation serializes source pages without locking the cache", async () => {
  let active = 0;
  let maxActive = 0;
  const values = await runSequentially(
    ["season", "future", "special"].map((value) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 10));
      active -= 1;
      return value;
    }),
  );
  assert.equal(maxActive, 1);
  assert.deepEqual(values, ["season", "future", "special"]);

  const clientSource = readFileSync(
    resolve(process.cwd(), "src/lib/yuc/client.ts"),
    "utf8",
  );
  assert.match(clientSource, /forceRefresh\s*\?\s*undefined/u);
});

test("Bangumi seasonal pagination respects its concurrency limit and result order", async () => {
  let active = 0;
  let maxActive = 0;
  const values = await mapWithConcurrency(
    [0, 1, 2, 3, 4, 5, 6],
    3,
    async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 10));
      active -= 1;
      return value * 2;
    },
  );

  assert.equal(maxActive, 3);
  assert.deepEqual(values, [0, 2, 4, 6, 8, 10, 12]);
});

test("download reconciliation prunes and dismisses live missingFiles rows", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/downloads/route.ts"),
    "utf8",
  );
  assert.match(routeSource, /qbitSnapshotAvailable = true/u);
  assert.match(routeSource, /qbitConnected: qbitSnapshotAvailable/u);
  assert.match(routeSource, /liveTorrent\?\.state === "missingFiles"/u);
  assert.match(routeSource, /dismissDownloadSources\(dismissedMagnetUrls\)/u);
});
