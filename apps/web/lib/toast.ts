"use client";

// Tiny pub/sub toast store. No deps, no provider - call `toast(...)` from any
// client component. The Toaster component subscribes and renders the stack.

export type ToastKind = "info" | "success" | "error" | "loading";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  // Auto-dismiss timeout in ms. `null` = sticky (loading toasts).
  duration: number | null;
}

type Listener = (toasts: Toast[]) => void;

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l(toasts);
}

function scheduleDismiss(id: number, duration: number) {
  const t = setTimeout(() => dismiss(id), duration);
  timers.set(id, t);
}

function clearTimer(id: number) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function push(
  kind: ToastKind,
  message: string,
  duration: number | null,
): number {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message, duration }];
  if (duration != null) scheduleDismiss(id, duration);
  emit();
  return id;
}

export function dismiss(id: number) {
  clearTimer(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}

export const toast = {
  info: (message: string, duration: number | null = 4000) =>
    push("info", message, duration),
  success: (message: string, duration: number | null = 3000) =>
    push("success", message, duration),
  error: (message: string, duration: number | null = 5000) =>
    push("error", message, duration),
  // Sticky by default - call `update` or `dismiss` when the work finishes.
  loading: (message: string, duration: number | null = null) =>
    push("loading", message, duration),
  /** Replace an existing toast's kind/message; resets the auto-dismiss timer. */
  update(
    id: number,
    patch: { kind?: ToastKind; message?: string; duration?: number | null },
  ) {
    let found = false;
    toasts = toasts.map((t) => {
      if (t.id !== id) return t;
      found = true;
      return {
        ...t,
        ...patch,
        duration: patch.duration === undefined ? t.duration : patch.duration,
      };
    });
    if (!found) return;
    clearTimer(id);
    const t = toasts.find((x) => x.id === id)!;
    if (t.duration != null) scheduleDismiss(id, t.duration);
    emit();
  },
  dismiss,
};
