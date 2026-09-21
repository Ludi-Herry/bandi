import type { AniMedia } from "@/lib/anilist";
import { selectTitleAliasesFromAniList } from "@/lib/anime-title-aliases";

export function isStrictAniListIdentityMatch(
  media: AniMedia | null,
  local: { title: string; titleJa: string | null; year: number | null },
): boolean {
  if (!media) return false;
  if (
    local.year != null &&
    media.seasonYear != null &&
    local.year !== media.seasonYear
  ) {
    return false;
  }
  const localKeys = new Set(
    [local.title, local.titleJa]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeIdentityTitle),
  );
  return selectTitleAliasesFromAniList(media).some((alias) =>
    localKeys.has(normalizeIdentityTitle(alias)),
  );
}

function normalizeIdentityTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}
