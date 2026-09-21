/**
 * 番剧库（/browse）的 Suspense fallback。
 *
 * 骨架结构对齐 BrowseClient：
 *   - 紧凑 Hero
 *   - tabs 行（移动端堆叠，桌面端左右分布）
 *   - 常用搜索、排序与当前条件摘要；细项默认收起
 *   - 卡片网格（移动端 1 列，520px 起 2 列，桌面最多 4 列）
 */

function ShimmerInline({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-[color:var(--bg-elevated)] rounded-[8px] ${className ?? ""}`}
      style={style}
    >
      <div className="t-skel-skeleton is-pulsing">
        <div className="t-skel-block" />
      </div>
    </div>
  );
}

function CardSkel() {
  return (
    <div className="rounded-[8px] overflow-hidden bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="relative" style={{ aspectRatio: "3/4" }}>
        <ShimmerInline className="absolute inset-0 rounded-none" />
        <div className="absolute bottom-2 left-2 right-2 space-y-1.5">
          <ShimmerInline className="h-3 w-3/4 bg-white/10" />
          <ShimmerInline className="h-2 w-1/2 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export default function BrowseLoading() {
  return (
    <div className="relative">
      <section className="catalog-page-hero catalog-page-hero--browse bg-[color:var(--bg-elevated)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.75) 60%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div className="app-page-container catalog-page-hero-content">
          <div className="space-y-3 w-full max-w-md">
            <ShimmerInline className="h-8 w-32 sm:h-9 sm:w-1/3" />
            <ShimmerInline className="h-3 w-2/3" />
          </div>
        </div>
      </section>

      <section className="app-page-container py-5 sm:py-6">
        {/* tabs */}
        <div className="mb-4 border-b border-[color:var(--border-subtle)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <div className="no-scrollbar grid w-full grid-cols-4 items-center gap-1 overflow-visible pb-2 touch-pan-y sm:flex sm:max-w-full sm:min-w-0 sm:gap-3 sm:overflow-x-auto sm:touch-pan-x">
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
              <ShimmerInline className="h-5 min-w-0 sm:w-20 sm:shrink-0" />
            </div>
            <ShimmerInline className="mb-2 h-3 w-40 lg:shrink-0" />
          </div>
        </div>

        {/* 默认可见的搜索、排序和已选条件 */}
        <div className="mb-5 rounded-[8px] p-3 sm:p-4 bg-[color:var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          <div className="flex flex-wrap items-center gap-3">
            <ShimmerInline className="h-9 min-w-[220px] flex-[1_1_260px]" />
            <ShimmerInline className="h-7 w-40" />
            <ShimmerInline className="h-9 w-24" />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--border-subtle)] pt-3">
            <ShimmerInline className="h-3 w-14" />
            <ShimmerInline className="h-6 w-9" />
            <ShimmerInline className="h-6 w-10" />
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <CardSkel key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
