export type MoodMediaScope = "all" | "anime" | "cinema";
export type MoodMediaType = "anime" | "drama" | "movie";
export type MoodResourcePool = "local" | "tracked" | "catalog" | "all";
export type MoodFitGroup =
  | "fits"
  | "possible"
  | "not_fit"
  | "insufficient";
export type MoodWatchStatus =
  | "watching"
  | "planning"
  | "completed"
  | "onhold"
  | "dropped"
  | null;

export interface MoodCandidateSource {
  localId: number | null;
  identityKey: string;
  resourcePool: Exclude<MoodResourcePool, "all">;
  mediaType: MoodMediaType;
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  synopsis: string | null;
  year: number | null;
  tags: string[];
  watchStatus: MoodWatchStatus;
  href: string;
}

export interface MoodCandidateView extends MoodCandidateSource {
  metadataQuality: "ready" | "insufficient";
}

export interface MoodPreviewRequest {
  pool: MoodResourcePool;
  scope: MoodMediaScope;
  preference: string;
  excludeCompleted: boolean;
}

export interface MoodProviderCandidate {
  candidate_id: string;
  title: string;
  synopsis: string;
  tags: string[];
}

export interface MoodProviderState {
  sample_id: "mood-picker-preview";
  preference: string;
  candidates: MoodProviderCandidate[];
}

export interface MoodPreviewResponse {
  status: "preview";
  sent: false;
  pool: MoodResourcePool;
  scope: MoodMediaScope;
  preference: string;
  candidates: MoodCandidateView[];
  counts: {
    available: number;
    selected: number;
    ready: number;
    insufficient: number;
  };
  outboundPreview: {
    provider: "TypeSafe";
    model: "jev-1.13.0";
    checkId: "media.fit.v1";
    state: MoodProviderState;
    sentFields: string[];
    keptLocal: string[];
  };
}

export interface MoodEvaluationCandidate extends MoodCandidateView {
  fit: MoodFitGroup;
}

export interface MoodEvaluationResponse {
  status: "evaluated";
  queryId: string;
  requestSha256: string;
  candidates: MoodEvaluationCandidate[];
  groups: Record<MoodFitGroup, MoodEvaluationCandidate[]>;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export interface MoodEvaluationPreparation {
  status: "prepared";
  queryId: string;
  payloadJson: string;
  signature: string;
}

export const MOOD_PRESETS = [
  "轻松温暖，不要复杂主线",
  "吃饭时看，容易跟上",
  "悬疑推理，但不要猎奇",
  "热血成长，少一点恋爱",
] as const;

const MAX_CANDIDATES = 8;
const MAX_PREFERENCE_LENGTH = 160;
const MAX_TITLE_LENGTH = 120;
const MAX_SYNOPSIS_LENGTH = 600;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

const SIGNALS: Array<{ triggers: string[]; terms: string[] }> = [
  {
    triggers: ["轻松", "放松", "下饭", "不用动脑"],
    terms: ["喜剧", "日常", "治愈", "家庭", "友情", "校园"],
  },
  {
    triggers: ["温暖", "温馨", "陪伴", "关系亲密"],
    terms: ["温暖", "家庭", "友情", "群像", "亲情", "治愈"],
  },
  {
    triggers: ["悬疑", "推理", "破案", "线索"],
    terms: ["悬疑", "推理", "犯罪", "密室", "侦探"],
  },
  {
    triggers: ["热血", "成长", "奋斗", "训练"],
    terms: ["热血", "成长", "励志", "运动", "冒险", "友情"],
  },
  {
    triggers: ["恋爱", "爱情", "感情线"],
    terms: ["恋爱", "爱情", "浪漫"],
  },
  {
    triggers: ["复杂", "烧脑", "主线"],
    terms: ["复杂叙事", "悬疑", "推理", "政治", "时间循环"],
  },
  {
    triggers: ["恐怖", "惊悚", "猎奇", "重口"],
    terms: ["恐怖", "惊悚", "猎奇", "暴力", "黑暗"],
  },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/gu, " ")
    .trim();
}

function sanitizeText(value: string | null | undefined, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function isNegated(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 8), index);
  return /不要|不想|避免|少点|少一|别太|不能/u.test(prefix);
}

function deriveWeightedTerms(
  preference: string,
  candidates: readonly MoodCandidateSource[],
): Map<string, number> {
  const normalized = normalizeText(preference);
  const weighted = new Map<string, number>();
  const add = (term: string, weight: number) => {
    const key = normalizeText(term);
    if (!key) return;
    const current = weighted.get(key);
    if (current == null || Math.abs(weight) > Math.abs(current)) {
      weighted.set(key, weight);
    }
  };

  for (const signal of SIGNALS) {
    for (const trigger of signal.triggers) {
      const index = normalized.indexOf(normalizeText(trigger));
      if (index < 0) continue;
      const weight = isNegated(normalized, index) ? -4 : 4;
      signal.terms.forEach((term) => add(term, weight));
    }
  }

  for (const candidate of candidates) {
    for (const tag of candidate.tags) {
      const normalizedTag = normalizeText(tag);
      const index = normalized.indexOf(normalizedTag);
      if (!normalizedTag || index < 0) continue;
      add(tag, isNegated(normalized, index) ? -5 : 5);
    }
  }

  for (const token of normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,8}/gu) ?? []) {
    add(token, isNegated(normalized, normalized.indexOf(token)) ? -2 : 2);
  }

  return weighted;
}

function candidateSearchText(candidate: MoodCandidateSource): string {
  return normalizeText(
    [
      candidate.title,
      candidate.titleJa ?? "",
      candidate.synopsis ?? "",
      ...candidate.tags,
    ].join(" "),
  );
}

function candidateScore(
  candidate: MoodCandidateSource,
  weightedTerms: ReadonlyMap<string, number>,
): number {
  const searchable = candidateSearchText(candidate);
  const normalizedTags = candidate.tags.map(normalizeText).filter(Boolean);
  let score = 0;

  for (const [term, weight] of weightedTerms) {
    if (!searchable.includes(term)) continue;
    const tagMatch = normalizedTags.some(
      (tag) => tag === term || tag.includes(term) || term.includes(tag),
    );
    score += weight * (tagMatch ? 2 : 1);
  }

  if (candidate.synopsis?.trim()) score += 0.25;
  if (candidate.tags.length > 0) score += 0.25;
  return score;
}

function matchesScope(candidate: MoodCandidateSource, scope: MoodMediaScope) {
  if (scope === "all") return true;
  if (scope === "anime") return candidate.mediaType === "anime";
  return candidate.mediaType === "drama" || candidate.mediaType === "movie";
}

function matchesPool(candidate: MoodCandidateSource, pool: MoodResourcePool) {
  return pool === "all" || candidate.resourcePool === pool;
}

function toView(candidate: MoodCandidateSource): MoodCandidateView {
  const hasUsefulSynopsis = (candidate.synopsis?.trim().length ?? 0) >= 20;
  const hasUsefulTags = candidate.tags.filter((tag) => tag.trim()).length >= 2;
  return {
    ...candidate,
    metadataQuality: hasUsefulSynopsis || hasUsefulTags ? "ready" : "insufficient",
  };
}

function takeBalanced(
  ranked: MoodCandidateSource[],
  scope: MoodMediaScope,
): MoodCandidateSource[] {
  if (scope !== "all") return ranked.slice(0, MAX_CANDIDATES);

  const anime = ranked.filter((candidate) => candidate.mediaType === "anime");
  const cinema = ranked.filter((candidate) => candidate.mediaType !== "anime");
  const selected: MoodCandidateSource[] = [];
  let next: "anime" | "cinema" =
    ranked[0]?.mediaType === "anime" ? "anime" : "cinema";

  while (selected.length < MAX_CANDIDATES && (anime.length > 0 || cinema.length > 0)) {
    const primary = next === "anime" ? anime : cinema;
    const fallback = next === "anime" ? cinema : anime;
    const candidate = primary.shift() ?? fallback.shift();
    if (candidate) selected.push(candidate);
    next = next === "anime" ? "cinema" : "anime";
  }
  return selected;
}

export function selectMoodCandidates(
  source: readonly MoodCandidateSource[],
  request: MoodPreviewRequest,
): MoodCandidateView[] {
  const eligible = source.filter(
    (candidate) =>
      matchesScope(candidate, request.scope) &&
      matchesPool(candidate, request.pool) &&
      (!request.excludeCompleted || candidate.watchStatus !== "completed"),
  );
  const weightedTerms = deriveWeightedTerms(request.preference, eligible);
  const ranked = eligible
    .map((candidate, index) => ({
      candidate,
      index,
      score: candidateScore(candidate, weightedTerms),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.candidate);

  return takeBalanced(ranked, request.scope).map(toView);
}

export function createMoodProviderState(
  preference: string,
  candidates: readonly MoodCandidateView[],
): MoodProviderState {
  const outbound = candidates.slice(0, MAX_CANDIDATES).map((candidate, index) => ({
    candidate_id: `candidate-${index + 1}`,
    title: sanitizeText(candidate.title, MAX_TITLE_LENGTH),
    synopsis: sanitizeText(candidate.synopsis, MAX_SYNOPSIS_LENGTH),
    tags: [
      ...new Set(
        candidate.tags
          .map((tag) => sanitizeText(tag, MAX_TAG_LENGTH))
          .filter(Boolean),
      ),
    ].slice(0, MAX_TAGS),
  }));

  while (outbound.length < MAX_CANDIDATES) {
    outbound.push({
      candidate_id: `empty-${outbound.length + 1}`,
      title: "",
      synopsis: "",
      tags: [],
    });
  }

  return {
    sample_id: "mood-picker-preview",
    preference: sanitizeText(preference, MAX_PREFERENCE_LENGTH),
    candidates: outbound,
  };
}

export function buildMoodPreviewResponse(
  source: readonly MoodCandidateSource[],
  request: MoodPreviewRequest,
): MoodPreviewResponse {
  const eligible = source.filter(
    (candidate) =>
      matchesScope(candidate, request.scope) &&
      matchesPool(candidate, request.pool) &&
      (!request.excludeCompleted || candidate.watchStatus !== "completed"),
  );
  const candidates = selectMoodCandidates(source, request);
  const ready = candidates.filter(
    (candidate) => candidate.metadataQuality === "ready",
  ).length;

  return {
    status: "preview",
    sent: false,
    pool: request.pool,
    scope: request.scope,
    preference: request.preference,
    candidates,
    counts: {
      available: eligible.length,
      selected: candidates.length,
      ready,
      insufficient: candidates.length - ready,
    },
    outboundPreview: {
      provider: "TypeSafe",
      model: "jev-1.13.0",
      checkId: "media.fit.v1",
      state: createMoodProviderState(request.preference, candidates),
      sentFields: ["本次偏好", "匿名候选编号", "标题", "简介", "标签"],
      keptLocal: [
        "本地数据库 ID",
        "文件路径",
        "观看进度",
        "下载记录",
        "个人评分与笔记",
        "账号信息",
      ],
    },
  };
}

export function parseMoodPreviewRequest(
  raw: unknown,
): { ok: true; value: MoodPreviewRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "请求格式无效" };
  }
  const record = raw as Record<string, unknown>;
  const allowed = new Set([
    "pool",
    "scope",
    "preference",
    "excludeCompleted",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    return { ok: false, error: "请求包含不支持的字段" };
  }
  if (
    record.pool !== "local" &&
    record.pool !== "tracked" &&
    record.pool !== "catalog" &&
    record.pool !== "all"
  ) {
    return { ok: false, error: "请选择有效候选来源" };
  }
  if (
    record.scope !== "all" &&
    record.scope !== "anime" &&
    record.scope !== "cinema"
  ) {
    return { ok: false, error: "请选择有效范围" };
  }
  if (typeof record.preference !== "string") {
    return { ok: false, error: "请输入想看的感觉" };
  }
  const preference = record.preference.replace(/\s+/gu, " ").trim();
  if (preference.length < 2 || preference.length > MAX_PREFERENCE_LENGTH) {
    return { ok: false, error: "偏好描述需为 2–160 个字符" };
  }
  if (typeof record.excludeCompleted !== "boolean") {
    return { ok: false, error: "筛选状态无效" };
  }
  return {
    ok: true,
    value: {
      pool: record.pool,
      scope: record.scope,
      preference,
      excludeCompleted: record.excludeCompleted,
    },
  };
}
