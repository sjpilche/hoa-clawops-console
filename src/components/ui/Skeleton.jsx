/**
 * @file Skeleton.jsx
 * @description Shimmer loading placeholders matching content shapes.
 */

function SkeletonBase({ className = '' }) {
  return (
    <div
      className={`bg-bg-elevated rounded-lg animate-pulse ${className}`}
    />
  );
}

/** Single line of text */
export function SkeletonLine({ width = 'w-full', className = '' }) {
  return <SkeletonBase className={`h-4 ${width} ${className}`} />;
}

/** Stat/KPI card skeleton */
export function SkeletonStatCard() {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
      <SkeletonBase className="h-8 w-8 rounded-lg" />
      <SkeletonBase className="h-7 w-20" />
      <SkeletonBase className="h-3 w-16" />
    </div>
  );
}

/** Table row skeleton */
export function SkeletonTableRow({ cols = 4 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonBase className={`h-4 ${i === 0 ? 'w-32' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  );
}

/** Full table skeleton */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-2.5">
                <SkeletonBase className="h-3 w-12" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** KPI bar skeleton (row of stat cards) */
export function SkeletonKpiBar({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

/** Card content skeleton */
export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === 0 ? 'w-3/4' : i === lines - 1 ? 'w-1/2' : 'w-full'} />
      ))}
    </div>
  );
}

export default SkeletonBase;
