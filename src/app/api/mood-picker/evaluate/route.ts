import { NextResponse } from "next/server";
import { getMoodCandidates } from "@/lib/db-helpers/mood-candidates";
import {
  createMoodProviderState,
  parseMoodPreviewRequest,
  selectMoodCandidates,
} from "@/lib/mood-picker";
import { createMoodEvaluationPreparation } from "@/lib/mood-jev-adapter";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const parsed = parseMoodPreviewRequest(
    await request.json().catch(() => null),
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (parsed.value.pool !== "local") {
    return NextResponse.json(
      {
        error: "当前外发授权仅覆盖本地可播资源",
        code: "JEV_SCOPE_NOT_AUTHORIZED",
      },
      { status: 403 },
    );
  }

  const source = await getMoodCandidates(user.id, "local");
  const candidates = selectMoodCandidates(source, parsed.value);
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "当前条件没有可判断的本地候选" },
      { status: 422 },
    );
  }

  const bridgeSecret = process.env.BANDI_JEV_BRIDGE_SECRET?.trim();
  if (!bridgeSecret) {
    return NextResponse.json(
      {
        error: "Jev 直连仅支持已配置的 Windows 桌面版。",
        code: "JEV_DESKTOP_ONLY",
      },
      { status: 503 },
    );
  }

  try {
    const preparation = createMoodEvaluationPreparation({
      state: createMoodProviderState(parsed.value.preference, candidates),
      candidates,
      bridgeSecret,
    });
    return NextResponse.json(preparation, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "JEV_UNKNOWN";
    console.warn("[mood-picker] Jev request preparation unavailable", code);
    return NextResponse.json(
      {
        error: "Jev 本次判断请求未能安全生成。",
        code,
      },
      { status: 502 },
    );
  }
}
