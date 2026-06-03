"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api-client";

// Email gate. Shown the first time a client favorites or touches a list.
export function EmailModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (email: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError("Enter a valid email.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(value.trim());
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save"));
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6"
      >
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">
          Your email
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Enter your email to favorite items and build lists. The creator will
          see your selections.
        </p>
        <input
          type="email"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          className="mt-4 w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
        />
        {error && (
          <p className="mt-2 text-sm font-semibold text-negative">{error}</p>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center rounded-md bg-accent border border-accent px-4 py-2.5 text-sm font-bold tracking-wider text-white hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
