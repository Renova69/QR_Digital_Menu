const SkeletonBlock = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-secondary/50 ${className}`} />
);

const SkeletonCard = ({ className = "" }: { className?: string }) => (
  <div
    className={`rounded-lg border border-border bg-card p-4 shadow-sm ${className}`}
  >
    <div className="flex items-center justify-between gap-3">
      <SkeletonBlock className="h-3 w-20" />
      <SkeletonBlock className="h-4 w-4 rounded-full" />
    </div>
    <SkeletonBlock className="mt-4 h-7 w-28" />
    <SkeletonBlock className="mt-3 h-3 w-24" />
  </div>
);

// Layout-matched skeleton so the page doesn't jump when data arrives
// (better perceived load than a bare spinner).
const AnalyticsSkeleton = () => (
  <div className="space-y-6" aria-busy="true">
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-6 w-56" />
        <SkeletonBlock className="h-3 w-72" />
      </div>
      <SkeletonBlock className="h-10 w-28" />
    </div>
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </section>
    <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <SkeletonBlock className="h-4 w-40" />
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-20" />
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <SkeletonBlock className="h-4 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8" />
        ))}
      </div>
    </section>
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <SkeletonBlock className="h-4 w-48" />
      <SkeletonBlock className="mt-5 h-[300px] w-full" />
    </div>
  </div>
);

export default AnalyticsSkeleton;
