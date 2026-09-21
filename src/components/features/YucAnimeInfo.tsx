import { ExternalLink, Film, Radio, Tv } from "lucide-react";
import { GlassPanel } from "@/components/ui";
import type { Anime } from "@/db/schema";
import {
  getYucSourceHref,
  sanitizeYucExternalUrl,
  type YucDetailMatch,
} from "@/lib/yuc/detail";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/";

interface YucAnimeInfoProps {
  anime: Pick<
    Anime,
    | "titleJa"
    | "type"
    | "status"
    | "totalEpisodes"
    | "year"
    | "airingDay"
    | "airingTime"
  >;
  match: YucDetailMatch | null;
}

const TYPE_LABEL: Record<Anime["type"], string> = {
  TV: "TV 动画",
  Movie: "剧场版",
  OVA: "OVA",
  Web: "Web",
};
const STATUS_LABEL: Record<Anime["status"], string> = {
  airing: "连载中",
  completed: "已完结",
  upcoming: "即将放送",
};

export function YucAnimeInfo({ anime, match }: YucAnimeInfoProps) {
  const entry = match?.entry;
  const sourceHref = getYucSourceHref(match);
  const officialHref = sanitizeYucExternalUrl(entry?.officialUrl);
  const pvHref = sanitizeYucExternalUrl(entry?.pvUrl);
  const providers = (entry?.providers ?? [])
    .map((provider) => ({
      ...provider,
      safeUrl: sanitizeYucExternalUrl(provider.url),
    }))
    .filter((provider) => provider.safeUrl != null);
  const facts = selectAnimeInfoFacts(anime, match);

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            作品资料
          </h3>
          {match && (
            <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              长门番堂补充播出与官方资料
            </p>
          )}
        </div>
        {match && (
          <Radio size={14} className="mt-0.5 shrink-0 text-[color:var(--text-muted)]" />
        )}
      </div>

      <dl className="space-y-2 text-[12px]">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-[color:var(--text-muted)]">{label}</dt>
            <dd className="min-w-0 text-right leading-relaxed text-[color:var(--text-primary)] [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {providers.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] text-[color:var(--text-muted)]">正版播放</p>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <SafeExternalLink
                key={`${provider.label}:${provider.safeUrl}`}
                href={provider.safeUrl!}
                label={`${provider.label}${provider.service ? ` · ${provider.service}` : ""}`}
                icon={<Tv size={12} />}
              />
            ))}
          </div>
        </div>
      )}

      {(officialHref || pvHref) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {officialHref && (
            <SafeExternalLink
              href={officialHref}
              label="动画官网"
              icon={<ExternalLink size={12} />}
            />
          )}
          {pvHref && (
            <SafeExternalLink href={pvHref} label="观看 PV" icon={<Film size={12} />} />
          )}
        </div>
      )}

      {match && (
        <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-3 text-[10px] leading-relaxed text-[color:var(--text-muted)]">
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
          >
            长门番堂 · CC BY-NC-SA 4.0
          </a>
          {sourceHref && (
            <>
              <span aria-hidden> · </span>
              <a
                href={sourceHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              >
                来源页
                <ExternalLink size={10} />
              </a>
            </>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

export function selectAnimeInfoFacts(
  anime: YucAnimeInfoProps["anime"],
  match: YucDetailMatch | null,
): Array<[string, string]> {
  const entry = match?.entry;
  const yucSchedule = entry && entry.scheduleRaw?.trim() !== entry.premiereRaw?.trim()
    ? formatSchedule(entry.weeklyDay, entry.weeklyTime, entry.scheduleRaw)
    : entry?.weeklyDay != null
      ? formatSchedule(entry.weeklyDay, entry.weeklyTime, null)
      : null;
  const localSchedule = formatSchedule(anime.airingDay, anime.airingTime, null);
  const schedule = yucSchedule || localSchedule;
  const premiere = entry?.premiereRaw?.trim() || entry?.premiereDate?.trim();
  const premiereWithYear = premiere
    ? anime.year && !/(?:19|20)\d{2}/u.test(premiere)
      ? `${anime.year} · ${premiere}`
      : premiere
    : anime.year
      ? String(anime.year)
      : "—";
  const totalEpisodes =
    anime.totalEpisodes && anime.totalEpisodes > 0
      ? `${anime.totalEpisodes} 集`
      : entry?.totalEpisodes && entry.totalEpisodes > 0
        ? `${entry.totalEpisodes} 话`
        : "—";

  const facts: Array<[string, string]> = [
    ["原名", anime.titleJa?.trim() || "—"],
    ["类型", TYPE_LABEL[anime.type] ?? anime.type],
    ["状态", STATUS_LABEL[anime.status] ?? anime.status],
    ["集数", totalEpisodes],
    [premiere ? "开播日期" : "首播", premiereWithYear],
    [schedule ? "每周播出" : "更新时间", schedule || "—"],
  ];
  if (entry?.studio) facts.push(["制作公司", entry.studio]);
  if (entry?.original) facts.push(["原作", entry.original]);
  if (entry?.cast.length) facts.push(["声优", entry.cast.join("、")]);
  return facts;
}

function SafeExternalLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-2.5 py-1.5 text-[11px] leading-tight text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function formatSchedule(
  weeklyDay: number | null,
  weeklyTime: string | null,
  scheduleRaw: string | null,
): string | null {
  if (weeklyDay != null && WEEKDAYS[weeklyDay]) {
    return `${WEEKDAYS[weeklyDay]}${weeklyTime ? ` ${weeklyTime}` : ""}`;
  }
  return scheduleRaw;
}
