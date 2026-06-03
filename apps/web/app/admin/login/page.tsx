"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginInput } from "@lumiere/types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Field, TextInput, Button, FormError } from "@/components/admin/form";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setError(null);
    const parsed = LoginInput.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setPending(true);
    try {
      await apiClient("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      router.push(from);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError("Email or password incorrect.");
        else if (err.status === 429)
          setError("Too many attempts. Try again in a few minutes.");
        else setError("Sign-in failed. Try again.");
      } else {
        setError("Network error. Try again.");
      }
      setPending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  // Some browsers/managers swallow implicit submit; submit explicitly on Enter.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-bg px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-center text-xs font-bold tracking-wider text-ink-muted">
          Lumière
        </p>

        <div className="mt-8 rounded-xl bg-surface border border-border p-10">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-strong">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Access your creator dashboard.
          </p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
            <Field id="email" label="Email">
              <TextInput
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={setEmail}
                onKeyDown={onKeyDown}
                placeholder="you@studio.com"
              />
            </Field>
            <Field id="password" label="Password">
              <TextInput
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={setPassword}
                onKeyDown={onKeyDown}
                placeholder="••••••••"
              />
            </Field>

            <FormError message={error} />

            <div className="pt-1">
              <Button type="submit" disabled={pending}>
                {pending ? "Signing in…" : "Continue →"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
