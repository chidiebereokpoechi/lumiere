'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginInput } from '@lumiere/types';
import { apiClient, ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get('from') ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = LoginInput.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setPending(true);
    try {
      await apiClient('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      router.push(from);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Email or password incorrect.');
        else if (err.status === 429) setError('Too many attempts. Try again in a few minutes.');
        else setError('Sign-in failed. Try again.');
      } else {
        setError('Network error. Try again.');
      }
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-bg px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-center text-xs font-semibold tracking-[0.28em] uppercase text-ink-muted">
          Lumière
        </p>

        <div className="mt-10 rounded-lg bg-surface p-10">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Access your photographer dashboard.
          </p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
            />

            {error && (
              <div
                role="alert"
                className="rounded-md bg-accent-soft px-4 py-3 text-sm text-ink"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-ink hover:bg-accent-hover transition-colors duration-150 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pending ? 'Signing in…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  autoComplete?: string;
  value: string;
  onChange: (next: string) => void;
}
function Field({ id, label, type, required, autoComplete, value, onChange }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-surface-sunken px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:bg-surface-2 transition-colors"
      />
    </div>
  );
}
