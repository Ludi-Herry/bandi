"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clapperboard, Search } from "lucide-react";
import { ClearableInput, GlassPanel } from "@/components/ui";
import { CinemaCard } from "@/components/features/CinemaCard";
import {
  CinemaFollowUpSection,
  type CinemaContinueView,
  type CinemaMissedUpdateView,
  type CinemaUpdateView,
} from "@/components/features/CinemaFollowUpSection";
import { CinemaScanButton } from "@/components/features/CinemaScanButton";
import { CinemaEnrichButton } from "@/components/features/CinemaEnrichButton";
import { MoodPickerDialog } from "@/components/features/MoodPickerDialog";
import { PageHeader } from "@/components/features/PageHeader";
import { cn } from "@/lib/cn";
import {
  collectCinemaYears,
  filterCinemaItems,
  parseCinemaYearFilter,
} from "@/lib/cinema-filters";
import { useCardGlow } from "@/hooks/useCardGlow";
import { useSlidingTabs } from "@/hooks/useSlidingTabs";
import type { CinemaItem } from "@/lib/db-helpers/cinema";

type TabKey = "tv" | "movies";

const TABS: { key: TabKey; label: string }[] = [
  { key: "tv", label: "电视剧" },
  { key: "movies", label: "电影" },
];

// 电影题材 tab（固定）；R级 永远放最后，承载成人内容（番号 + OVA）。
const MOVIE_GENRES = [
  "传记",
  "动作",
  "犯罪",
  "古装",
  "剧情",
  "科幻",
  "历史",
  "冒险",
  "喜剧",
  "悬疑",
  "灾难",
] as const;
const ALL_MOVIES = "全部";
const R_RATED = "R级";
const MOVIE_GENRE_TABS = [ALL_MOVIES, ...MOVIE_GENRES, R_RATED];

type AdultKind = "all" | "jav" | "ova";
const ADULT_KINDS: { value: AdultKind; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "jav", label: "番号" },
  { value: "ova", label: "OVA" },
];

function PillTab({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "t-tab h-8 shrink-0 rounded-[6px] px-3 text-[12px] font-medium",
        active && "text-[color:var(--accent)]",
      )}
    >
      {children}
      {count != null && (
        <span data-tabular className="ml-1.5 text-[10px] opacity-70">
          {count}
        </span>
      )}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-[6px] border px-2.5 text-[12px] leading-none transition-[background,color,border-color] duration-150 [transition-timing-function:var(--ease-default)]",
        active
          ? "border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
          : "border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

export function CinemaClient({
  drama,
  movie,
  jav,
  ova,
  initialTab,
  initialGenre,
  initialKind,
  initialQuery,
  initialYear,
  todayUpdates,
  upcomingItems,
  continueItems,
  missedItems,
}: {
  drama: CinemaItem[];
  movie: CinemaItem[];
  jav: CinemaItem[];
  ova: CinemaItem[];
  initialTab?: string;
  initialGenre?: string;
  initialKind?: string;
  initialQuery?: string;
  initialYear?: string;
  todayUpdates: CinemaUpdateView[];
  upcomingItems: CinemaUpdateView[];
  continueItems: CinemaContinueView[];
  missedItems: CinemaMissedUpdateView[];
}) {
  // tab / 题材 / 番号OVA 的状态同步进 URL，详情页返回时能回到原来的位置（而非重置成电视剧）。
  const [tab, setTab] = useState<TabKey>(
    initialTab === "movies" ? "movies" : "tv",
  );
  const [genre, setGenre] = useState<string>(
    initialGenre && (MOVIE_GENRE_TABS as readonly string[]).includes(initialGenre)
      ? initialGenre
      : ALL_MOVIES,
  );
  const [adultKind, setAdultKind] = useState<AdultKind>(
    initialKind === "jav" || initialKind === "ova" ? initialKind : "all",
  );
  const [query, setQuery] = useState(initialQuery ?? "");
  const [year, setYear] = useState<number | null>(() =>
    parseCinemaYearFilter(initialYear),
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab === "movies") {
      params.set("tab", "movies");
      if (genre !== ALL_MOVIES) params.set("genre", genre);
      if (genre === R_RATED && adultKind !== "all") params.set("kind", adultKind);
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (year != null) params.set("year", String(year));
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      qs ? `/cinema?${qs}` : "/cinema",
    );
  }, [tab, genre, adultKind, query, year]);

  const counts: Record<TabKey, number> = {
    tv: drama.length,
    movies: movie.length + jav.length + ova.length,
  };

  // 每个题材的本地电影数（R级 = 番号 + OVA）
  const genreCounts = useMemo(() => {
    const map: Record<string, number> = {};
    map[ALL_MOVIES] = movie.length;
    for (const g of MOVIE_GENRES) {
      map[g] = movie.filter((m) => m.tags.includes(g)).length;
    }
    map[R_RATED] = jav.length + ova.length;
    return map;
  }, [movie, jav, ova]);

  const isRRated = genre === R_RATED;
  const adultItems = useMemo(
    () => (adultKind === "jav" ? jav : adultKind === "ova" ? ova : [...jav, ...ova]),
    [adultKind, jav, ova],
  );
  const movieItems = useMemo(
    () =>
      isRRated
        ? adultItems
        : genre === ALL_MOVIES
          ? movie
          : movie.filter((m) => m.tags.includes(genre)),
    [adultItems, genre, isRRated, movie],
  );
  const years = useMemo(
    () => collectCinemaYears([...drama, ...movie, ...jav, ...ova]),
    [drama, jav, movie, ova],
  );
  useEffect(() => {
    if (year != null && !years.includes(year)) setYear(null);
  }, [year, years]);
  const filteredDrama = useMemo(
    () => filterCinemaItems(drama, { query, year }),
    [drama, query, year],
  );
  const filteredMovieItems = useMemo(
    () => filterCinemaItems(movieItems, { query, year }),
    [movieItems, query, year],
  );
  const hasActiveFilters = query.trim().length > 0 || year != null;
  const visibleCount =
    tab === "tv" ? filteredDrama.length : filteredMovieItems.length;
  const activeCount = tab === "tv" ? drama.length : movieItems.length;
  const totalLocalItems = drama.length + movie.length + jav.length + ova.length;
  const hasLocalItems = totalLocalItems > 0;
  const dramaGridRef = useCardGlow<HTMLDivElement>([filteredDrama, tab]);
  const movieGridRef = useCardGlow<HTMLDivElement>([
    filteredMovieItems,
    tab,
    genre,
    adultKind,
  ]);
  const mediaTabsRef = useSlidingTabs<HTMLDivElement>([tab]);
  const genreTabsRef = useSlidingTabs<HTMLDivElement>([
    tab,
    genre,
    movie.length,
    jav.length,
    ova.length,
  ]);

  return (
    <div className="app-page-container space-y-6 py-6 sm:py-8">
      <PageHeader
        title="本地库"
        description={`你保存在本地的电视剧和电影 · 可直接播放 · 共 ${totalLocalItems} 部`}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <MoodPickerDialog initialScope="cinema" />
            {hasLocalItems && <CinemaEnrichButton scope="local" />}
            <CinemaScanButton />
          </div>
        }
      />

      {/* 电视剧 / 电影 子 tab */}
      <div
        ref={mediaTabsRef}
        role="tablist"
        aria-label="影视品类"
        data-tabs-variant="line"
        className="t-tabs t-tabs-line flex items-center gap-5 border-b border-[color:var(--border-subtle)]"
      >
        <span className="t-tabs-pill" aria-hidden="true" />
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={cn(
                "t-tab relative -mb-px flex items-center gap-1.5 pb-2 text-[14px] tracking-tight",
                on
                  ? "font-medium"
                  : "text-[color:var(--text-secondary)]",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]",
                  on
                    ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                    : "bg-[color:var(--bg-surface)] text-[color:var(--text-muted)]",
                )}
                data-tabular
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {hasLocalItems && (
        <div className="flex flex-col gap-2 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 sm:min-w-[280px]">
            <ClearableInput
              value={query}
              onValueChange={setQuery}
              placeholder="搜索片名或原名"
              prefixIcon={<Search size={14} />}
              spellCheck={false}
              className="h-9 rounded-[6px] bg-[color:var(--bg-surface-hover)]"
              inputClassName="text-[12px]"
            />
          </div>
          <select
            data-no-focus-ring
            aria-label="按年份筛选本地影视"
            value={year ?? ""}
            onChange={(event) =>
              setYear(
                event.currentTarget.value
                  ? Number(event.currentTarget.value)
                  : null,
              )
            }
            className="h-9 min-w-[112px] cursor-pointer appearance-none rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-hover)] px-2.5 pr-7 text-[12px] text-[color:var(--text-primary)] outline-none transition-colors duration-150 hover:border-[color:var(--border-default)] focus:border-[color:var(--accent-muted)]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%23888' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            <option value="">全部年份</option>
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span
            className="shrink-0 text-[12px] text-[color:var(--text-muted)]"
            data-tabular
          >
            {visibleCount} / {activeCount} 部
          </span>
          {hasActiveFilters && (
            <FilterChip
              active={false}
              onClick={() => {
                setQuery("");
                setYear(null);
              }}
            >
              重置
            </FilterChip>
          )}
        </div>
      )}

      {/* ===== 电视剧 ===== */}
      {tab === "tv" && (
        <>
          {!hasActiveFilters && (
            <CinemaFollowUpSection
              todayUpdates={todayUpdates}
              upcomingItems={upcomingItems}
              continueItems={continueItems}
              missedItems={missedItems}
            />
          )}
          <section className="space-y-4">
            {drama.length > 0 && (
              <header>
                <h2 className="text-[18px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
                  {hasActiveFilters ? "筛选结果" : "全部剧集"}
                </h2>
                <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  {hasActiveFilters
                    ? `找到 ${filteredDrama.length} 部本地剧集`
                    : `本地已有 ${drama.length} 部，点开即可播放`}
                </p>
              </header>
            )}
            {filteredDrama.length > 0 ? (
              <div
                ref={dramaGridRef}
                className="grid grid-cols-2 gap-4 min-[640px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
              >
                {filteredDrama.map((item, i) => (
                  <CinemaCard
                    key={item.id}
                    item={item}
                    priority={i < 6}
                    detailSource="local"
                  />
                ))}
              </div>
            ) : (
              <GlassPanel className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <Clapperboard size={28} className="text-[color:var(--text-muted)]" />
                <p className="text-[14px] font-medium text-[color:var(--text-primary)]">
                  {hasActiveFilters ? "没有符合条件的电视剧" : "本地库还没有电视剧"}
                </p>
                <p className="max-w-[420px] text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                  {hasActiveFilters
                    ? "调整片名或年份后再试。"
                    : "点「扫描本地库」选你存放电视剧的文件夹，扫描入库后会出现在这里、可直接播放。"}
                </p>
              </GlassPanel>
            )}
          </section>
        </>
      )}

      {/* ===== 电影：题材 tab（R级 最后，承载成人内容）===== */}
      {tab === "movies" && (
        <section className="space-y-4">
          {counts.movies > 0 && (
            <div
              ref={genreTabsRef}
              role="tablist"
              aria-label="电影题材"
              className="t-tabs t-tabs-segmented flex flex-wrap items-center gap-1 rounded-[8px] border border-[color:var(--border-subtle)] p-1"
            >
              <span className="t-tabs-pill" aria-hidden="true" />
              {MOVIE_GENRE_TABS.map((g) => (
                <PillTab
                  key={g}
                  active={genre === g}
                  onClick={() => setGenre(g)}
                  count={genreCounts[g] || undefined}
                >
                  {g}
                </PillTab>
              ))}
            </div>
          )}

          {/* R级 内再分番号 / OVA */}
          {isRRated && (
            <div className="flex flex-wrap items-center gap-1.5">
              {ADULT_KINDS.map((k) => (
                <FilterChip
                  key={k.value}
                  active={adultKind === k.value}
                  onClick={() => setAdultKind(k.value)}
                >
                  {k.label}
                  <span data-tabular className="ml-1 opacity-70">
                    {k.value === "all"
                      ? jav.length + ova.length
                      : k.value === "jav"
                        ? jav.length
                        : ova.length}
                  </span>
                </FilterChip>
              ))}
            </div>
          )}

          {filteredMovieItems.length > 0 ? (
            <div
              ref={movieGridRef}
              className="grid grid-cols-2 gap-4 min-[640px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
            >
              {filteredMovieItems.map((item, i) => (
                <CinemaCard
                  key={item.id}
                  item={item}
                  priority={i < 6}
                  detailSource="local"
                  hideWatchControl={isRRated}
                />
              ))}
            </div>
          ) : (
            <GlassPanel className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <Clapperboard size={28} className="text-[color:var(--text-muted)]" />
              <p className="text-[14px] font-medium text-[color:var(--text-primary)]">
                {hasActiveFilters
                  ? "没有符合条件的电影"
                  : isRRated
                    ? "R级 还没有内容"
                    : genre === ALL_MOVIES
                      ? "本地库还没有电影"
                      : `本地还没有「${genre}」题材的电影`}
              </p>
              <p className="max-w-[420px] text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                {hasActiveFilters
                  ? "调整片名或年份后再试。"
                  : "点「扫描本地库」把本地电影扫描入库，会按题材自动归到对应 tab；成人内容归到 R级。"}
              </p>
            </GlassPanel>
          )}
        </section>
      )}
    </div>
  );
}
