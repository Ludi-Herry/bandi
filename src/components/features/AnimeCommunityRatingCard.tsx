import { ExternalLink, Star } from "lucide-react";
import { GlassPanel } from "@/components/ui";
import type { AnimeCommunityRatings } from "@/lib/anime-community-ratings";

function formatFetchedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "按需读取";
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
}: {
  ratings: AnimeCommunityRatings;
}) {
  if (!ratings.bangumi && !ratings.anilist) return null;

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
          <p className="mt-1 text-[10px] leading-4 text-[color:var(--text-muted)]">
            各来源保留原评分尺度，不计算综合分
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {ratings.bangumi && (
          <RatingSourceRow
            label="Bangumi"
            score={`${ratings.bangumi.score.toFixed(1)} / 10`}
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
            score={`${ratings.anilist.averageScore} / 100`}
            detail={
              ratings.anilist.popularity != null
                ? `${ratings.anilist.popularity.toLocaleString("zh-CN")} 人气`
                : "暂无热度数据"
            }
            fetchedAt={ratings.anilist.fetchedAt}
            href={ratings.anilist.href}
          />
        )}
      </div>
    </GlassPanel>
  );
}

function RatingSourceRow({
  label,
  score,
  detail,
  fetchedAt,
  href,
}: {
  label: string;
  score: string;
  detail: string;
  fetchedAt: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2.5 transition-colors hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-medium text-[color:var(--text-secondary)]">
            {label}
          </span>
          <span
            data-tabular
            className="shrink-0 text-[14px] font-semibold text-[color:var(--text-primary)]"
          >
            {score}
          </span>
        </div>
        <p className="mt-1 truncate text-[10px] text-[color:var(--text-muted)]">
          {detail || "暂无样本量数据"} · 更新于 {formatFetchedAt(fetchedAt)}
        </p>
      </div>
      <ExternalLink
        size={12}
        className="shrink-0 text-[color:var(--text-muted)] transition-colors group-hover:text-[color:var(--text-secondary)]"
      />
    </a>
  );
}
