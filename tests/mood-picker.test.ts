import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createMoodEvaluationPreparation } from "../src/lib/mood-jev-contract";
import {
  buildMoodPreviewResponse,
  createMoodProviderState,
  parseMoodPreviewRequest,
  selectMoodCandidates,
  type MoodCandidateSource,
} from "../src/lib/mood-picker";

const require = createRequire(import.meta.url);
const { evaluateSignedMoodRequest } = require("../desktop/jev-direct.cjs") as {
  evaluateSignedMoodRequest(input: Record<string, unknown>): Promise<{
    status: "evaluated";
    requestSha256: string;
    candidates: Array<{ fit: string }>;
    usage: { inputTokens: number | null; outputTokens: number | null };
  }>;
};

const candidates: MoodCandidateSource[] = [
  {
    localId: 1,
    identityKey: "anime:1",
    resourcePool: "local",
    mediaType: "anime",
    title: "温暖日常番",
    titleJa: null,
    coverUrl: null,
    synopsis: "朋友们一起度过平静而温暖的日常。",
    year: 2026,
    tags: ["日常", "友情", "治愈"],
    watchStatus: "watching",
    href: "/anime/1?from=local",
  },
  {
    localId: 2,
    identityKey: "anime:2",
    resourcePool: "tracked",
    mediaType: "anime",
    title: "已经看完的喜剧",
    titleJa: null,
    coverUrl: null,
    synopsis: "轻松喜剧。",
    year: 2025,
    tags: ["喜剧"],
    watchStatus: "completed",
    href: "/anime/2",
  },
  {
    localId: 3,
    identityKey: "cinema:3",
    resourcePool: "local",
    mediaType: "movie",
    title: "家庭喜剧电影",
    titleJa: "Family Comedy",
    coverUrl: null,
    synopsis: "一家人在旅行中互相支持。",
    year: 2024,
    tags: ["家庭", "喜剧", "温暖"],
    watchStatus: null,
    href: "/cinema/3?from=local",
  },
  {
    localId: 4,
    identityKey: "cinema:4",
    resourcePool: "catalog",
    mediaType: "drama",
    title: "复杂罪案剧",
    titleJa: null,
    coverUrl: null,
    synopsis: "多线调查伴随连续反转。",
    year: 2023,
    tags: ["犯罪", "复杂叙事", "黑暗"],
    watchStatus: "planning",
    href: "/cinema/4?from=library",
  },
  ...Array.from({ length: 7 }, (_, index): MoodCandidateSource => ({
    localId: index + 5,
    identityKey: `extra:${index + 5}`,
    resourcePool: index % 3 === 0 ? "tracked" : "local",
    mediaType: index % 2 === 0 ? "anime" : "movie",
    title: `补充候选 ${index + 1}`,
    titleJa: null,
    coverUrl: null,
    synopsis: index === 6 ? null : "普通剧情简介。",
    year: 2020 + index,
    tags: index === 6 ? [] : ["剧情"],
    watchStatus: null,
    href: `/anime/${index + 5}`,
  })),
];

test("mood picker keeps hard filters local and balances anime with cinema", () => {
  const selected = selectMoodCandidates(candidates, {
    pool: "all",
    scope: "all",
    preference: "轻松温暖，不要复杂主线",
    excludeCompleted: true,
  });

  assert.equal(selected.length, 8);
  assert.equal(selected.some((candidate) => candidate.mediaType === "anime"), true);
  assert.equal(selected.some((candidate) => candidate.mediaType !== "anime"), true);
  assert.equal(selected.some((candidate) => candidate.localId === 2), false);
  const warmIndex = selected.findIndex((candidate) => candidate.localId === 1);
  const complexIndex = selected.findIndex((candidate) => candidate.localId === 4);
  assert.ok(warmIndex >= 0);
  assert.ok(complexIndex < 0 || warmIndex < complexIndex);
});

test("mood picker can isolate the actual anime or cinema resource area", () => {
  const animeOnly = selectMoodCandidates(candidates, {
    pool: "all",
    scope: "anime",
    preference: "成长",
    excludeCompleted: false,
  });
  const cinemaOnly = selectMoodCandidates(candidates, {
    pool: "all",
    scope: "cinema",
    preference: "喜剧",
    excludeCompleted: false,
  });

  assert.equal(animeOnly.every((candidate) => candidate.mediaType === "anime"), true);
  assert.equal(cinemaOnly.every((candidate) => candidate.mediaType !== "anime"), true);
});

test("mood picker separates local, tracked, and catalog candidate pools", () => {
  const local = selectMoodCandidates(candidates, {
    pool: "local",
    scope: "all",
    preference: "轻松",
    excludeCompleted: false,
  });
  const tracked = selectMoodCandidates(candidates, {
    pool: "tracked",
    scope: "all",
    preference: "轻松",
    excludeCompleted: false,
  });
  const catalog = selectMoodCandidates(candidates, {
    pool: "catalog",
    scope: "all",
    preference: "悬疑",
    excludeCompleted: false,
  });

  assert.equal(local.every((candidate) => candidate.resourcePool === "local"), true);
  assert.equal(
    tracked.every((candidate) => candidate.resourcePool === "tracked"),
    true,
  );
  assert.equal(
    catalog.every((candidate) => candidate.resourcePool === "catalog"),
    true,
  );
});

test("provider preview contains eight anonymous text candidates and no private state", () => {
  const selected = selectMoodCandidates(candidates.slice(0, 3), {
    pool: "all",
    scope: "all",
    preference: "轻松温暖",
    excludeCompleted: true,
  });
  const state = createMoodProviderState("轻松温暖", selected);
  const serialized = JSON.stringify(state);

  assert.equal(state.candidates.length, 8);
  assert.equal(state.candidates[0].candidate_id.startsWith("candidate-"), true);
  assert.equal(state.candidates.at(-1)?.candidate_id.startsWith("empty-"), true);
  assert.doesNotMatch(
    serialized,
    /localId|coverUrl|watchStatus|year|file|download|progress|rating|notes/u,
  );
});

test("preview response is explicitly local-only and exposes the outbound boundary", () => {
  const preview = buildMoodPreviewResponse(candidates, {
    pool: "all",
    scope: "all",
    preference: "轻松温暖",
    excludeCompleted: true,
  });

  assert.equal(preview.sent, false);
  assert.equal(preview.outboundPreview.model, "jev-1.13.0");
  assert.equal(preview.outboundPreview.checkId, "media.fit.v1");
  assert.ok(preview.outboundPreview.keptLocal.includes("文件路径"));
  assert.ok(preview.outboundPreview.sentFields.includes("简介"));
});

test("preview request rejects arbitrary fields and invalid ranges", () => {
  assert.deepEqual(
    parseMoodPreviewRequest({
      pool: "local",
      scope: "anime",
      preference: "轻松温暖",
      excludeCompleted: true,
    }),
    {
      ok: true,
      value: {
        pool: "local",
        scope: "anime",
        preference: "轻松温暖",
        excludeCompleted: true,
      },
    },
  );
  assert.equal(
    parseMoodPreviewRequest({
      pool: "local",
      scope: "anime",
      preference: "轻松温暖",
      excludeCompleted: true,
      path: "H:/media",
    }).ok,
    false,
  );
  assert.equal(
    parseMoodPreviewRequest({
      pool: "local",
      scope: "everything",
      preference: "轻松温暖",
      excludeCompleted: true,
    }).ok,
    false,
  );
});

test("mood picker UI appears in both libraries and only Electron can call Jev", () => {
  const dialogSource = readFileSync(
    "src/components/features/MoodPickerDialog.tsx",
    "utf8",
  );
  const animeSource = readFileSync(
    "src/app/(main)/library/local/LocalLibraryClient.tsx",
    "utf8",
  );
  const cinemaSource = readFileSync(
    "src/app/(main)/cinema/CinemaClient.tsx",
    "utf8",
  );
  const routeSource = readFileSync(
    "src/app/api/mood-picker/preview/route.ts",
    "utf8",
  );
  const evaluateRouteSource = readFileSync(
    "src/app/api/mood-picker/evaluate/route.ts",
    "utf8",
  );
  const contractSource = readFileSync("src/lib/mood-jev-contract.ts", "utf8");
  const directSource = readFileSync("desktop/jev-direct.cjs", "utf8");
  const desktopSource = readFileSync("desktop/main.cjs", "utf8");
  const globalsSource = readFileSync("src/app/globals.css", "utf8");

  assert.match(dialogSource, /全部/);
  assert.match(dialogSource, /动漫/);
  assert.match(dialogSource, /影视/);
  assert.match(dialogSource, /本地可播/);
  assert.match(dialogSource, /我的追番/);
  assert.match(dialogSource, /番剧 \/ 影视库/);
  assert.match(dialogSource, /当前步骤不会调用 Jev/);
  assert.match(dialogSource, /尚未发送给 Jev/);
  assert.match(dialogSource, /开始 Jev 判断/);
  assert.match(dialogSource, /当前外发授权仅覆盖“本地可播”候选/);
  assert.match(dialogSource, /Bandi 仅在本次点击时直连 TypeSafe/);
  assert.match(dialogSource, /说说你现在想看什么感觉/);
  assert.match(dialogSource, /mood-picker-dialog/);
  assert.doesNotMatch(dialogSource, /glass-panel-elevated/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.mood-picker-dialog\s*\{[^}]*top:\s*calc\(50% \+ 22px\)/s,
  );
  assert.match(animeSource, /MoodPickerDialog initialScope="anime"/);
  assert.match(cinemaSource, /MoodPickerDialog initialScope="cinema"/);
  assert.match(routeSource, /requireRouteUser/);
  assert.doesNotMatch(
    routeSource,
    /fetch\(|child_process|spawn\(|exec\(|jev-lab|UseStoredKey/u,
  );
  assert.match(evaluateRouteSource, /parsed\.value\.pool !== "local"/);
  assert.match(evaluateRouteSource, /getMoodCandidates\(user\.id, "local"\)/);
  assert.match(evaluateRouteSource, /createMoodEvaluationPreparation/);
  assert.match(evaluateRouteSource, /BANDI_JEV_BRIDGE_SECRET/);
  assert.doesNotMatch(
    evaluateRouteSource,
    /fetch\(|child_process|spawn\(|exec\(|jev-lab|UseStoredKey/u,
  );
  assert.match(contractSource, /media\.fit\.v1/);
  assert.match(contractSource, /jev-1\.13\.0/);
  assert.match(directSource, /https:\/\/api\.typesafe\.ai\/v1\/systemone/);
  assert.match(directSource, /redirect: "error"/);
  assert.doesNotMatch(directSource, /retry|setInterval/u);
  assert.match(desktopSource, /safeStorage/);
  assert.match(desktopSource, /BANDI_JEV_BRIDGE_SECRET/);
  assert.match(desktopSource, /bandi:evaluate-mood-with-jev/);
  assert.match(desktopSource, /usedQueryIds: usedJevQueryIds/);
  assert.doesNotMatch(desktopSource, /fetchImpl:[^}]+\n\s+usedQueryIds,/u);
});

test("signed desktop bridge sends only the approved Jev state and rejects replay", async () => {
  const selected = selectMoodCandidates(candidates, {
    pool: "local",
    scope: "all",
    preference: "轻松温暖，不要复杂主线",
    excludeCompleted: true,
  });
  const bridgeSecret = "bridge-secret-abcdefghijklmnopqrstuvwxyz-123456";
  const preparation = createMoodEvaluationPreparation({
    state: createMoodProviderState("轻松温暖，不要复杂主线", selected),
    candidates: selected,
    bridgeSecret,
    now: 1_000,
  });
  const usedQueryIds = new Map<string, number>();
  let calls = 0;
  const result = await evaluateSignedMoodRequest({
    payloadJson: preparation.payloadJson,
    signature: preparation.signature,
    bridgeSecret,
    usedQueryIds,
    now: 1_000,
    getApiKey: () => "typesafe-test-key-1234567890",
    fetchImpl: async (url: string, init: RequestInit) => {
      calls += 1;
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      assert.equal(
        (init.headers as Record<string, string>).Authorization,
        "Bearer typesafe-test-key-1234567890",
      );
      const body = String(init.body);
      assert.doesNotMatch(
        body,
        /localId|identityKey|coverUrl|watchStatus|href|download|progress|rating/u,
      );
      const request = JSON.parse(body) as {
        model: string;
        questions: Record<string, unknown>;
      };
      const answers = Object.fromEntries(
        Object.keys(request.questions).map((id) => [
          id,
          {
            type: "choice",
            choice: "fits",
            confidence: 0.8,
            probabilities: {
              fits: 0.7,
              possible: 0.1,
              not_fit: 0.1,
              insufficient: 0.1,
            },
          },
        ]),
      );
      return new Response(
        JSON.stringify({
          model: request.model,
          answers,
          usage: { input_tokens: 321, output_tokens: 45 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assert.equal(result.status, "evaluated");
  assert.equal(result.candidates.length, selected.length);
  assert.equal(result.candidates.every((candidate) => candidate.fit === "fits"), true);
  assert.deepEqual(result.usage, { inputTokens: 321, outputTokens: 45 });
  assert.equal(calls, 1);

  await assert.rejects(
    evaluateSignedMoodRequest({
      payloadJson: preparation.payloadJson,
      signature: preparation.signature,
      bridgeSecret,
      usedQueryIds,
      now: 1_000,
      getApiKey: () => "typesafe-test-key-1234567890",
      fetchImpl: async () => new Response("{}", { status: 200 }),
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "JEV_BRIDGE_REPLAYED",
  );
});
