"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";

export function PasswordGate({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setPending(true);
    try {
      await apiClient(`/api/gallery/${slug}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      router.refresh(); // session cookie now set; access re-renders as 'ok'
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 429
            ? "Too many attempts. Try again later."
            : "Incorrect password.",
        );
      } else {
        setError("Network error. Try again.");
      }
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-center text-xs font-bold tracking-wider text-ink-muted">
          {title}
        </p>
        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-xl bg-surface border border-border p-8 space-y-5"
        >
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-strong">
              Private gallery
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Enter the password the creator shared.
            </p>
          </div>
          <TextInput
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />
          {error && (
            <p className="text-sm font-semibold text-negative">{error}</p>
          )}
          <Button
            type="submit"
            disabled={pending || !password}
            className="w-full tracking-wider"
          >
            {pending ? "Unlocking…" : "View gallery"}
          </Button>
        </form>
      </div>
    </main>
  );
}
