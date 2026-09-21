"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { Button, MotionSwitch, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getDesktopBridge } from "@/lib/desktop-bridge";
import {
  MOOD_PRESETS,
  type MoodEvaluationPreparation,
  type MoodMediaScope,
  type MoodMediaType,
  type MoodEvaluationResponse,
  type MoodFitGroup,
  type MoodPreviewResponse,
  type MoodResourcePool,
} from "@/lib/mood-picker";

const POOL_OPTIONS: Array<{ value: MoodResourcePool; label: string }> = [
  { value: "local", label: "本地可播" },
  { value: "tracked", label: "我的追番" },
  { value: "catalog", label: "番剧 / 影视库" },
  { value: "all", label: "全部资源" },
];

const POOL_RESULT_LABEL: Record<MoodResourcePool, string> = {
  local: "本地候选",
  tracked: "追番候选",
  catalog: "资料库候选",
  all: "全部候选",
};

const SCOPE_OPTIONS: Array<{ value: MoodMediaScope; label: string }> = [
  { value: "all", label: "全部" },
  { value: "anime", label: "动漫" },
  { value: "cinema", label: "影视" },
];

const MEDIA_LABEL: Record<MoodMediaType, string> = {
  anime: "动漫",
  drama: "电视剧",
  movie: "电影",
};

const FIT_LABEL: Record<MoodFitGroup, string> = {
  fits: "符合偏好",
  possible: "可能符合",
  not_fit: "不符合",
  insufficient: "资料不足",
};

export function MoodPickerDialog({
  initialScope,
}: {
  initialScope: Exclude<MoodMediaScope, "all">;
}) {
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<MoodResourcePool>("local");
  const [scope, setScope] = useState<MoodMediaScope>(initialScope);
  const [preference, setPreference] = useState("");
  const [excludeCompleted, setExcludeCompleted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MoodPreviewResponse | null>(null);
  const [evaluation, setEvaluation] =
    useState<MoodEvaluationResponse | null>(null);
  const [jevConnection, setJevConnection] =
    useState<DesktopJevConnectionState | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const bridge = getDesktopBridge();
    if (!bridge?.getJevConnectionState) {
      setJevConnection(null);
      return;
    }
    void bridge
      .getJevConnectionState()
      .then(setJevConnection)
      .catch(() => setJevConnection(null));
  }, [open]);

  useEffect(() => {
    requestIdRef.current += 1;
    setLoading(false);
    setEvaluating(false);
    setPreview(null);
    setEvaluation(null);
    setError(null);
  }, [pool, scope, preference, excludeCompleted]);

  async function loadPreview() {
    const normalized = preference.replace(/\s+/gu, " ").trim();
    if (normalized.length < 2 || loading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mood-picker/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool,
          scope,
          preference: normalized,
          excludeCompleted,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | MoodPreviewResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("status" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "候选预览失败");
      }
      if (requestId === requestIdRef.current) setPreview(payload);
    } catch (cause) {
      if (requestId === requestIdRef.current) {
        setError(cause instanceof Error ? cause.message : "候选预览失败");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  async function evaluateWithJev() {
    const normalized = preference.replace(/\s+/gu, " ").trim();
    if (
      pool !== "local" ||
      normalized.length < 2 ||
      evaluating ||
      !preview?.candidates.length
    ) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setEvaluating(true);
    setError(null);
    try {
      const bridge = getDesktopBridge();
      if (!bridge?.evaluateMoodWithJev) {
        throw new Error("Jev 直连仅支持 Windows 桌面版。");
      }
      const response = await fetch("/api/mood-picker/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool,
          scope,
          preference: normalized,
          excludeCompleted,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | MoodEvaluationPreparation
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("status" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "Jev 判断失败");
      }
      const result = await bridge.evaluateMoodWithJev({
        payloadJson: payload.payloadJson,
        signature: payload.signature,
      });
      if (!result.ok || !result.evaluation) {
        throw new Error(result.error || "Jev 判断失败");
      }
      if (requestId === requestIdRef.current) setEvaluation(result.evaluation);
    } catch (cause) {
      if (requestId === requestIdRef.current) {
        setError(cause instanceof Error ? cause.message : "Jev 判断失败");
      }
    } finally {
      if (requestId === requestIdRef.current) setEvaluating(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          requestIdRef.current += 1;
          setLoading(false);
          setEvaluating(false);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          size="sm"
          variant="primary"
          leftIcon={<Sparkles size={13} />}
        >
          按心情选片
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="t-modal-overlay fixed inset-0 z-50 bg-black/[0.82] backdrop-blur-[6px]" />
        <Dialog.Content
          className={cn(
            "t-modal t-modal-center fixed left-1/2 top-1/2 z-50",
            "flex max-h-[88vh] w-[820px] max-w-[calc(100vw-24px)] flex-col",
            "mood-picker-dialog overflow-hidden focus:outline-none",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-subtle)] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[18px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
                按心情选片
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                说说你现在想看什么感觉。我们会先挑出 8 部给你确认，只有点“开始 Jev 判断”后才会发送片名和简介。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭按心情选片"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <section aria-label="选片条件" className="space-y-4">
              <div>
                <div className="mb-2 text-[11px] font-medium text-[color:var(--text-muted)]">
                  候选来源
                </div>
                <div className="flex flex-wrap gap-1 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-1">
                  {POOL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={pool === option.value}
                      onClick={() => setPool(option.value)}
                      className={cn(
                        "h-8 rounded-[6px] px-3 text-[12px] font-medium transition-colors",
                        pool === option.value
                          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {(pool === "tracked" || pool === "all") && (
                  <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--status-warning)]">
                    预览仍只在本机运行；若以后发送候选，这个范围可能间接反映你的收藏兴趣。
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 text-[11px] font-medium text-[color:var(--text-muted)]">
                  资源范围
                </div>
                <div className="inline-flex rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-1">
                  {SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={scope === option.value}
                      onClick={() => setScope(option.value)}
                      className={cn(
                        "h-8 rounded-[6px] px-4 text-[12px] font-medium transition-colors",
                        scope === option.value
                          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="mood-picker-preference"
                  className="text-[11px] font-medium text-[color:var(--text-muted)]"
                >
                  这次想看什么感觉
                </label>
                <textarea
                  id="mood-picker-preference"
                  data-no-focus-ring
                  value={preference}
                  maxLength={160}
                  rows={3}
                  onChange={(event) => setPreference(event.currentTarget.value)}
                  placeholder="例如：轻松温暖，不要复杂主线"
                  className="mt-2 w-full resize-none rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2.5 text-[13px] leading-relaxed text-[color:var(--text-primary)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:var(--border-default)] focus:border-[color:var(--accent-muted)]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MOOD_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPreference(preset)}
                      className="rounded-[6px] border border-[color:var(--border-subtle)] px-2.5 py-1.5 text-[11px] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2.5">
                <div>
                  <div className="text-[12px] font-medium text-[color:var(--text-primary)]">
                    排除已经看完的作品
                  </div>
                  <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                    只在本地筛选，不会发送观看状态
                  </div>
                </div>
                <MotionSwitch
                  checked={excludeCompleted}
                  onCheckedChange={setExcludeCompleted}
                  aria-label="排除已经看完的作品"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  onClick={loadPreview}
                  disabled={loading || preference.trim().length < 2}
                  leftIcon={
                    loading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )
                  }
                >
                  {loading ? "正在本地筛选…" : "预览候选"}
                </Button>
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  当前步骤不会调用 Jev
                </span>
              </div>
            </section>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-[8px] border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-2.5 text-[12px] text-[color:var(--status-error)]"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {preview && (
              <section className="mt-5 space-y-3" aria-label="候选预览">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                      {POOL_RESULT_LABEL[preview.pool]}
                    </h3>
                    <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                      可选 {preview.counts.available} 部 · 本轮取 {preview.counts.selected} 部 ·
                      资料不足 {preview.counts.insufficient} 部
                    </p>
                  </div>
                  <Tag variant="accent">
                    {evaluation ? "已由 Jev 分组" : "尚未发送给 Jev"}
                  </Tag>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2.5">
                  <Button
                    size="sm"
                    onClick={evaluateWithJev}
                    disabled={
                      pool !== "local" ||
                      preview.candidates.length === 0 ||
                      evaluating ||
                      jevConnection?.status !== "ready"
                    }
                    leftIcon={
                      evaluating ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )
                    }
                  >
                    {evaluating ? "Jev 判断中…" : "开始 Jev 判断"}
                  </Button>
                  <span className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                    {pool !== "local" ? (
                      "当前外发授权仅覆盖“本地可播”候选。"
                    ) : jevConnection?.status === "ready" ? (
                      "Bandi 仅在本次点击时直连 TypeSafe；失败不会自动重试。"
                    ) : (
                      <>
                        请先到
                        <a
                          href="/settings#jev"
                          className="mx-1 text-[color:var(--accent)] hover:underline"
                        >
                          设置中心
                        </a>
                        安全保存 TypeSafe API Key。
                      </>
                    )}
                  </span>
                </div>

                {evaluation && (
                  <div className="space-y-2 rounded-[8px] border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-[12px] font-semibold text-[color:var(--text-primary)]">
                        Jev 判断结果
                      </h4>
                      <span className="text-[10px] text-[color:var(--text-muted)]">
                        输入 {evaluation.usage.inputTokens ?? "—"} tokens
                      </span>
                    </div>
                    {(Object.keys(FIT_LABEL) as MoodFitGroup[]).map((group) => {
                      const items = evaluation.groups[group];
                      if (items.length === 0) return null;
                      return (
                        <div key={group} className="flex items-start gap-2">
                          <span className="w-16 shrink-0 pt-1 text-[10px] font-medium text-[color:var(--text-muted)]">
                            {FIT_LABEL[group]}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((candidate) => (
                              <a
                                key={candidate.identityKey}
                                href={candidate.href}
                                className="rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] transition-colors hover:border-[color:var(--border-strong)]"
                              >
                                {candidate.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {preview.candidates.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {preview.candidates.map((candidate) => {
                      const fit = evaluation?.candidates.find(
                        (item) => item.identityKey === candidate.identityKey,
                      )?.fit;
                      return (
                        <a
                          key={candidate.identityKey}
                          href={candidate.href}
                          className="group flex min-w-0 gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-2.5 transition-colors hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)]"
                        >
                          <div className="w-14 shrink-0 overflow-hidden rounded-[6px]">
                            <AnimeCover
                              src={candidate.coverUrl}
                              alt={candidate.title}
                              ratio="2/3"
                              sizes="56px"
                            />
                          </div>
                          <div className="min-w-0 py-0.5">
                            <div className="truncate text-[12px] font-medium text-[color:var(--text-primary)]">
                              {candidate.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[color:var(--text-muted)]">
                              <span>{MEDIA_LABEL[candidate.mediaType]}</span>
                              {candidate.year && <span>{candidate.year}</span>}
                              {!fit &&
                                candidate.metadataQuality === "insufficient" && (
                                  <span className="text-[color:var(--status-warning)]">
                                    资料不足
                                  </span>
                                )}
                              {fit && (
                                <span className="text-[color:var(--accent)]">
                                  {FIT_LABEL[fit]}
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                              {candidate.synopsis?.trim() ||
                                "现有文字资料不足，Jev 应返回资料不足。"}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[8px] border border-dashed border-[color:var(--border-default)] px-4 py-8 text-center text-[12px] text-[color:var(--text-muted)]">
                    当前范围没有可用候选；资料库上游不可用时会降级为缓存或本地资料。
                  </div>
                )}

                <details className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]">
                  <summary className="cursor-pointer list-none px-3 py-2.5 text-[12px] font-medium text-[color:var(--text-primary)]">
                    查看未来会发送什么
                  </summary>
                  <div className="border-t border-[color:var(--border-subtle)] px-3 py-3 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                    <div className="flex items-start gap-2">
                      <ShieldCheck
                        size={14}
                        className="mt-0.5 shrink-0 text-[color:var(--status-success)]"
                      />
                      <div>
                        <p>
                          发送：{preview.outboundPreview.sentFields.join("、")}。
                        </p>
                        <p className="mt-1">
                          留在本机：{preview.outboundPreview.keptLocal.join("、")}。
                        </p>
                        <p className="mt-1">
                          点击后由 Bandi 主进程直连 TypeSafe；API Key 只作为授权头使用，不进入 Jev 的判断文字。
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {preview.outboundPreview.state.candidates
                        .filter((candidate) => candidate.title)
                        .map((candidate) => (
                          <div
                            key={candidate.candidate_id}
                            className="rounded-[6px] bg-[color:var(--bg-surface-hover)] px-2.5 py-2"
                          >
                            <div className="font-medium text-[color:var(--text-primary)]">
                              {candidate.candidate_id} · {candidate.title}
                            </div>
                            <div className="mt-1 text-[color:var(--text-muted)]">
                              标签：{candidate.tags.join("、") || "无"} · 简介：
                              {candidate.synopsis || "无"}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </details>
              </section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
