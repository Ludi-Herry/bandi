import { NextResponse } from "next/server";
import { getMoodCandidates } from "@/lib/db-helpers/mood-candidates";
import {
  buildMoodPreviewResponse,
  parseMoodPreviewRequest,
} from "@/lib/mood-picker";
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

  const candidates = await getMoodCandidates(user.id, parsed.value.pool);
  return NextResponse.json(
    buildMoodPreviewResponse(candidates, parsed.value),
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
