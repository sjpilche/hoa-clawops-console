/**
 * @file useToast.js
 * @description Lightweight toast notification system using Zustand.
 */
import { create } from 'zustand';

let toastId = 0;

const useToastStore = create((set) => ({
  toasts: [],
  addToast: ({ message, variant = 'info', duration = 4000 }) => {
    const id = ++toastId;
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, duration }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
    return id;
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  return {
    toast: addToast,
    success: (message, opts) => addToast({ message, variant: 'success', ...opts }),
    error: (message, opts) => addToast({ message, variant: 'danger', ...opts }),
    warning: (message, opts) => addToast({ message, variant: 'warning', ...opts }),
    info: (message, opts) => addToast({ message, variant: 'info', ...opts }),
  };
}

export { useToastStore };
