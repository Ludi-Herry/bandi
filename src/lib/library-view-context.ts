export type LibraryStatusTab =
  | "all"
  | "watching"
  | "planning"
  | "completed"
  | "onhold"
  | "dropped";
export type LibrarySortKey = "updated" | "rating" | "title" | "year";
export type LibraryViewMode = "grid" | "list";

export interface LibraryViewContext {
  status: LibraryStatusTab;
  type: string;
  year: string;
  sort: LibrarySortKey;
  view: LibraryViewMode;
}

export interface LibraryReturnSnapshot {
  version: 1;
  id: number;
  context: LibraryViewContext;
  scrollTop: number;
  cardTop: number | null;
  focus: boolean;
  savedAt: number;
}

export const LIBRARY_RETURN_SNAPSHOT_KEY = "bandi:library:return:v1";
export const LIBRARY_RETURN_PENDING_KEY = "bandi:library:pending:v1";
export const LIBRARY_TRANSITION_ARM_KEY = "bandi:library:arm:v1";
export const LIBRARY_TRANSITION_DETAIL_KEY = "bandi:library:detail:v1";
export const LIBRARY_TRANSITION_COVER_KEY = "bandi:library:cover:v1";

export const LIBRARY_VIEW_DEFAULTS: LibraryViewContext = {
  status: "all",
  type: "all",
  year: "all",
  sort: "updated",
  view: "grid",
};

const STATUS_VALUES = new Set<LibraryStatusTab>([
  "all", "watching", "planning", "completed", "onhold", "dropped",
]);
const TYPE_VALUES = new Set(["all", "TV", "Movie", "OVA", "Web"]);
const SORT_VALUES = new Set<LibrarySortKey>(["updated", "rating", "title", "year"]);

export function parseLibraryViewContext(params: URLSearchParams): LibraryViewContext {
  const status = params.get("status") as LibraryStatusTab;
  const type = params.get("type") ?? "all";
  const year = params.get("year") ?? "all";
  const sort = params.get("sort") as LibrarySortKey;
  const view = params.get("view");
  return {
    status: STATUS_VALUES.has(status) ? status : "all",
    type: TYPE_VALUES.has(type) ? type : "all",
    year: year === "all" || /^\d{4}$/.test(year) ? year : "all",
    sort: SORT_VALUES.has(sort) ? sort : "updated",
    view: view === "list" ? "list" : "grid",
  };
}

export function writeLibraryViewContext(
  params: URLSearchParams,
  context: LibraryViewContext,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.keys(LIBRARY_VIEW_DEFAULTS) as Array<keyof LibraryViewContext>) {
    if (context[key] === LIBRARY_VIEW_DEFAULTS[key]) next.delete(key);
    else next.set(key, context[key]);
  }
  return next;
}

export function parseLibraryReturnSnapshot(value: string | null): LibraryReturnSnapshot | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<LibraryReturnSnapshot>;
    const { id, scrollTop, cardTop, focus, savedAt } = candidate;
    if (
      candidate.version !== 1 ||
      typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 ||
      typeof scrollTop !== "number" || !Number.isFinite(scrollTop) || scrollTop < 0 ||
      (cardTop != null && (typeof cardTop !== "number" || !Number.isFinite(cardTop))) ||
      typeof savedAt !== "number" || !Number.isFinite(savedAt) ||
      Math.abs(Date.now() - savedAt) > 2 * 60 * 60 * 1000 ||
      typeof focus !== "boolean" ||
      !candidate.context || typeof candidate.context !== "object"
    ) return null;
    const contextParams = new URLSearchParams();
    for (const key of Object.keys(LIBRARY_VIEW_DEFAULTS) as Array<keyof LibraryViewContext>) {
      const field = candidate.context[key];
      if (typeof field === "string") contextParams.set(key, field);
    }
    return {
      version: 1,
      id,
      context: parseLibraryViewContext(contextParams),
      scrollTop,
      cardTop: cardTop ?? null,
      focus,
      savedAt,
    };
  } catch {
    return null;
  }
}
