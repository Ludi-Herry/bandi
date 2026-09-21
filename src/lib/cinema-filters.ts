export interface CinemaFilterableItem {
  title: string;
  titleJa: string | null;
  year: number | null;
}

export interface CinemaItemFilters {
  query?: string;
  year?: number | null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/gu, " ");
}

export function parseCinemaYearFilter(value: string | undefined): number | null {
  if (!value || !/^\d{4}$/u.test(value)) return null;
  const year = Number(value);
  return year >= 1800 && year <= 3000 ? year : null;
}

export function collectCinemaYears(
  items: readonly CinemaFilterableItem[],
): number[] {
  return [
    ...new Set(
      items
        .map((item) => item.year)
        .filter((year): year is number => Number.isInteger(year)),
    ),
  ].sort((left, right) => right - left);
}

export function filterCinemaItems<T extends CinemaFilterableItem>(
  items: readonly T[],
  filters: CinemaItemFilters,
): T[] {
  const query = normalizeSearchText(filters.query ?? "");
  const year = filters.year ?? null;

  return items.filter((item) => {
    if (year != null && item.year !== year) return false;
    if (!query) return true;

    const searchable = normalizeSearchText(
      `${item.title} ${item.titleJa ?? ""}`,
    );
    return searchable.includes(query);
  });
}
