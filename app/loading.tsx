function Box({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-ink3 ${className}`} />;
}

/** Skeleton that mirrors the dashboard grid, so navigation never shows a blank frame. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Box className="h-8 w-72" />
        <Box className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Box key={i} className="h-[86px]" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Box className="h-64" />
          <Box className="h-96" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => <Box key={i} className="h-40" />)}
        </div>
      </div>
    </div>
  );
}
