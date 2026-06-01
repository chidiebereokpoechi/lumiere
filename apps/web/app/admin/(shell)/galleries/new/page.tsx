'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GalleryCreateInput } from '@lumiere/types';
import { apiClientMutation, ApiError } from '@/lib/api-client';
import { Field, TextInput, Textarea, Button, FormError } from '@/components/admin/form';

interface CreatedGallery {
  id: string;
  slug: string;
}

export default function NewGalleryPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [password, setPassword] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = { title };
    if (slug.trim()) payload.slug = slug.trim();
    if (subtitle.trim()) payload.subtitle = subtitle.trim();
    if (password) payload.password = password;
    if (clientName.trim()) payload.clientName = clientName.trim();
    if (clientEmail.trim()) payload.clientEmail = clientEmail.trim();
    if (eventDate) payload.eventDate = Math.floor(new Date(eventDate).getTime() / 1000);
    if (eventType.trim()) payload.eventType = eventType.trim();

    const parsed = GalleryCreateInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setPending(true);
    try {
      const created = await apiClientMutation<CreatedGallery>('/api/galleries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      router.push(`/admin/galleries/${created.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Session expired. Sign in again.' : 'Could not create gallery.');
      } else {
        setError('Network error. Try again.');
      }
      setPending(false);
    }
  }

  return (
    <div>
      <header className="px-10 py-6">
        <Link href="/admin" className="text-xs font-medium tracking-widest uppercase text-ink-muted hover:text-ink">
          ← Galleries
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">New gallery</h1>
        <p className="mt-1 text-sm text-ink-muted">A blank canvas. You can add photos and tweak settings after it's created.</p>
      </header>

      <div className="px-10 pb-16">
        <form onSubmit={onSubmit} className="mx-auto max-w-2xl rounded-lg bg-surface p-10 space-y-6">
          <Field id="title" label="Title" required>
            <TextInput id="title" required value={title} onChange={setTitle} placeholder="Smith Wedding" />
          </Field>

          <Field id="slug" label="URL slug" hint="leave blank to auto-generate">
            <TextInput id="slug" value={slug} onChange={setSlug} placeholder="smith-wedding" />
          </Field>

          <Field id="subtitle" label="Subtitle" hint="optional">
            <Textarea id="subtitle" rows={2} value={subtitle} onChange={setSubtitle} placeholder="A weekend in Mendoza" />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="clientName" label="Client name" hint="optional">
              <TextInput id="clientName" value={clientName} onChange={setClientName} placeholder="Sarah Smith" />
            </Field>
            <Field id="clientEmail" label="Client email" hint="optional">
              <TextInput id="clientEmail" type="email" value={clientEmail} onChange={setClientEmail} placeholder="sarah@example.com" />
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="eventDate" label="Event date" hint="optional">
              <TextInput id="eventDate" type="date" value={eventDate} onChange={setEventDate} />
            </Field>
            <Field id="eventType" label="Event type" hint="optional">
              <TextInput id="eventType" value={eventType} onChange={setEventType} placeholder="Wedding" />
            </Field>
          </div>

          <Field id="password" label="Client password" hint="leave blank for public access">
            <TextInput id="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} placeholder="••••••••" />
          </Field>

          <FormError message={error} />

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/admin" className="text-sm font-medium text-ink-muted hover:text-ink">
              Cancel
            </Link>
            <Button type="submit" disabled={pending || title.trim().length === 0}>
              {pending ? 'Creating…' : 'Create gallery'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
