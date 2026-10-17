export default function DashboardLoading() {
  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14 flex flex-col gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-10 w-48 bg-border rounded-lg" />
          <div className="h-4 w-64 bg-border rounded" />
        </div>
        <div className="h-11 w-32 bg-border rounded-lg" />
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 h-28">
            <div className="h-4 w-20 bg-border rounded mb-3" />
            <div className="h-8 w-24 bg-border rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="h-6 w-40 bg-border rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-border rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}
