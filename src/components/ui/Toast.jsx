/**
 * @file Toast.jsx
 * @description Toast notification container — renders all active toasts.
 * Place <ToastContainer /> once in the app root (e.g., AppShell or App.jsx).
 */
import { useToastStore } from '@/hooks/useToast';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const icons = {
  success: CheckCircle,
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: 'bg-accent-success/10 border-accent-success/30 text-accent-success',
  danger: 'bg-accent-danger/10 border-accent-danger/30 text-accent-danger',
  warning: 'bg-accent-warning/10 border-accent-warning/30 text-accent-warning',
  info: 'bg-accent-info/10 border-accent-info/30 text-accent-info',
};

function ToastItem({ toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = icons[toast.variant] || icons.info;
  const style = styles[toast.variant] || styles.info;

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm
        shadow-lg shadow-black/20 animate-slide-in-right
        ${style}
      `}
    >
      <Icon size={16} className="shrink-0 mt-0.5" />
      <p className="text-sm text-text-primary flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-text-muted hover:text-text-primary shrink-0 cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite" role="log">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
