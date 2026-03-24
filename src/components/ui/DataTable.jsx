/**
 * @file DataTable.jsx
 * @description Reusable data table with responsive overflow, loading, and empty states.
 */
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

export default function DataTable({
  columns = [],
  data = [],
  emptyMessage = 'No data yet.',
  onRowClick,
  isLoading = false,
  className = '',
}) {
  if (isLoading) {
    return (
      <div className="bg-bg-secondary border border-border rounded-xl p-8 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={`bg-bg-secondary border border-border rounded-xl overflow-hidden ${className}`}>
      {data.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                {columns.map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`
                      font-medium px-4 py-2.5
                      ${col.align === 'right' ? 'text-right' : 'text-left'}
                      ${col.hideBelow === 'sm' ? 'hidden sm:table-cell' : ''}
                      ${col.hideBelow === 'md' ? 'hidden md:table-cell' : ''}
                      ${col.hideBelow === 'lg' ? 'hidden lg:table-cell' : ''}
                    `}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row, i) => (
                <tr
                  key={row.id || i}
                  className={`
                    hover:bg-bg-elevated transition-colors
                    ${onRowClick ? 'cursor-pointer' : ''}
                  `}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`
                        px-4 py-2.5
                        ${col.align === 'right' ? 'text-right' : 'text-left'}
                        ${col.hideBelow === 'sm' ? 'hidden sm:table-cell' : ''}
                        ${col.hideBelow === 'md' ? 'hidden md:table-cell' : ''}
                        ${col.hideBelow === 'lg' ? 'hidden lg:table-cell' : ''}
                      `}
                    >
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '\u2014')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
