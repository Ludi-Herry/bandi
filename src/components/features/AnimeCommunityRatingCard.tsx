import { Suspense } from "react";
import { ExternalLink, Star } from "lucide-react";
import { GlassPanel } from "@/components/ui";
import type { AnimeCommunityRatings } from "@/lib/anime-community-ratings";
import type { JikanAnimeRating } from "@/lib/jikan-rating";

function formatFetchedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function AnimeCommunityRatingCard({
  ratings,
  malRatingPromise,
}: {
  ratings: AnimeCommunityRatings;
  malRatingPromise: Promise<JikanAnimeRating | null> | null;
}) {
  if (!ratings.bangumi && !ratings.anilist && !ratings.douban && !malRatingPromise) {
    return null;
  }

  return (
    <GlassPanel className="p-5">
      <div className="flex items-start gap-2.5">
        <Star
          size={15}
          className="mt-0.5 shrink-0 text-[color:var(--accent)]"
        />
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            社区口碑
          </h3>
          <p className="mt-1 text-[11px] leading-4 text-[color:var(--text-secondary)]">
            各来源保留原评分尺度，不计算综合分
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {ratings.bangumi && (
          <RatingSourceRow
            label="Bangumi"
            score={ratings.bangumi.score.toFixed(1)}
            scale="10"
            detail={[
              ratings.bangumi.total != null
                ? `${ratings.bangumi.total.toLocaleString("zh-CN")} 人评分`
                : null,
              ratings.bangumi.rank != null
                ? `全站 #${ratings.bangumi.rank.toLocaleString("zh-CN")}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            fetchedAt={ratings.bangumi.fetchedAt}
            href={ratings.bangumi.href}
          />
        )}
        {ratings.anilist && (
          <RatingSourceRow
            label="AniList"
            score={String(ratings.anilist.averageScore)}
            scale="100"
            detail={
              ratings.anilist.popularity != null
                ? `${ratings.anilist.popularity.toLocaleString("zh-CN")} 人气`
                : "暂无热度数据"
            }
            fetchedAt={ratings.anilist.fetchedAt}
            href={ratings.anilist.href}
          />
        )}
        {malRatingPromise && (
          <Suspense fallback={null}>
            <AsyncMalSourceRow ratingPromise={malRatingPromise} />
          </Suspense>
        )}
        {ratings.douban && (
          <RatingSourceRow
            label="豆瓣电影"
            score={ratings.douban.score.toFixed(1)}
            scale="10"
            detail="评分人数未提供"
            fetchedAt={ratings.douban.fetchedAt}
            href={ratings.douban.href}
          />
        )}
      </div>
    </GlassPanel>
  );
}

async function AsyncMalSourceRow({
  ratingPromise,
}: {
  ratingPromise: Promise<JikanAnimeRating | null>;
}) {
  const rating = await ratingPromise;
  if (!rating) return null;
  return (
    <RatingSourceRow
      label="MyAnimeList"
      score={rating.score.toFixed(2)}
      scale="10"
      detail={
        rating.scoredBy != null
          ? `Jikan API · ${rating.scoredBy.toLocaleString("zh-CN")} 人评分`
          : "Jikan API · 评分人数未提供"
      }
      fetchedAt={rating.fetchedAt}
      href={rating.href}
    />
  );
}

function RatingSourceRow({
  label,
  score,
  scale,
  detail,
  fetchedAt,
  href,
}: {
  label: string;
  score: string;
  scale: string;
  detail: string;
  fetchedAt: string | null;
  href: string;
}) {
  const updatedAt = formatFetchedAt(fetchedAt);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group grid grid-cols-[minmax(0,1fr)_auto_12px] items-center gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-3 transition-colors hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
    >
      <div className="min-w-0">
        <span className="text-[13px] font-semibold text-[color:var(--text-primary)]">
          {label}
        </span>
        <p className="mt-1 truncate text-[11px] text-[color:var(--text-secondary)]">
          {detail || "评分人数未提供"}
          {updatedAt && ` · 更新于 ${updatedAt}`}
        </p>
      </div>
      <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
        <span
          data-tabular
          className="text-[26px] font-bold leading-none text-[color:var(--accent)]"
        >
          {score}
        </span>
        <span className="text-[12px] text-[color:var(--text-secondary)]">
          / {scale}
        </span>
      </span>
      <ExternalLink
        size={12}
        className="shrink-0 text-[color:var(--text-secondary)] transition-colors group-hover:text-[color:var(--text-primary)]"
      />
    </a>
  );
}
