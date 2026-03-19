import { Inbox } from 'lucide-react';

/**
 * Consistent empty state component.
 *
 * Usage:
 *   <EmptyState message="No leads found" action={<Button>Add Lead</Button>} />
 *   <EmptyState icon={Search} message="No results match your search" />
 */
export default function EmptyState({ icon: Icon = Inbox, message = 'Nothing here yet', action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center gap-3 ${className}`}>
      <Icon size={36} className="text-text-muted opacity-50" />
      <p className="text-sm text-text-muted">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
