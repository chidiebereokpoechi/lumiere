'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GalleryPatchInput } from '@lumiere/types';
import { apiClientMutation, ApiError } from '@/lib/api-client';
import type { GalleryDetail } from '@/lib/api/galleries';
import { Field, TextInput, Textarea, Select, Toggle, Button, FormError } from '@/components/admin/form';

interface Props {
  gallery: GalleryDetail;
}

export function SettingsForm({ gallery }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Local form state mirrors the row but maps integer booleans to real bools.
  const [title, setTitle] = useState(gallery.title);
  const [subtitle, setSubtitle] = useState(gallery.subtitle ?? '');
  const [status, setStatus] = useState<'active' | 'archived' | 'draft'>(gallery.status ?? 'active');
  const [downloadMode, setDownloadMode] = useState<'none' | 'watermarked' | 'full' | 'selected'>(gallery.downloadMode ?? 'watermarked');
  const [layout, setLayout] = useState<'grid' | 'masonry' | 'slideshow'>(gallery.layout ?? 'grid');
  const [clientName, setClientName] = useState(gallery.clientName ?? '');
  const [clientEmail, setClientEmail] = useState(gallery.clientEmail ?? '');
  const [eventDate, setEventDate] = useState(toDateInput(gallery.eventDate));
  const [eventType, setEventType] = useState(gallery.eventType ?? '');
  const [expiresAt, setExpiresAt] = useState(toDateInput(gallery.expiresAt));
  const [gracePeriodDays, setGracePeriodDays] = useState(String(gallery.gracePeriodDays ?? 0));
  const [allowFavorites, setAllowFavorites] = useState(gallery.allowFavorites === 1);
  const [allowComments, setAllowComments] = useState(gallery.allowComments === 1);
  const [allowDownload, setAllowDownload] = useState(gallery.allowDownload === 1);
  const [notifyOnView, setNotifyOnView] = useState(gallery.notifyOnView === 1);
  const [customCss, setCustomCss] = useState(gallery.customCss ?? '');

  // Password: undefined = unchanged. '' = clear. string = set.
  const [passwordEdit, setPasswordEdit] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const patch: Record<string, unknown> = {
      title,
      subtitle: emptyToNull(subtitle),
      status,
      downloadMode,
      layout,
      clientName: emptyToNull(clientName),
      clientEmail: emptyToNull(clientEmail),
      eventDate: dateInputToEpoch(eventDate),
      eventType: emptyToNull(eventType),
      expiresAt: dateInputToEpoch(expiresAt),
      gracePeriodDays: Math.max(0, parseInt(gracePeriodDays, 10) || 0),
      allowFavorites,
      allowComments,
      allowDownload,
      notifyOnView,
      customCss: emptyToNull(customCss),
    };
    if (passwordEdit) {
      patch.password = newPassword === '' ? null : newPassword;
    }

    const parsed = GalleryPatchInput.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setSaving(true);
    try {
      await apiClientMutation(`/api/galleries/${gallery.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      setSavedAt(Date.now());
      setPasswordEdit(false);
      setNewPassword('');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiError ? `Save failed (${err.status})` : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete "${gallery.title}"? This removes all photos and attachments. Cannot be undone.`)) {
      return;
    }
    try {
      await apiClientMutation(`/api/galleries/${gallery.id}`, { method: 'DELETE' });
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Delete failed (${err.status})` : 'Network error');
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <Section title="Basics">
        <Field id="title" label="Title" required>
          <TextInput id="title" required value={title} onChange={setTitle} />
        </Field>
        <Field id="subtitle" label="Subtitle" hint="optional">
          <Textarea id="subtitle" rows={2} value={subtitle} onChange={setSubtitle} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="status" label="Status">
            <Select id="status" value={status} onChange={setStatus} options={[
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Draft' },
              { value: 'archived', label: 'Archived' },
            ]} />
          </Field>
          <Field id="layout" label="Layout">
            <Select id="layout" value={layout} onChange={setLayout} options={[
              { value: 'grid', label: 'Grid' },
              { value: 'masonry', label: 'Masonry' },
              { value: 'slideshow', label: 'Slideshow' },
            ]} />
          </Field>
        </div>
      </Section>

      <Section title="Client">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="clientName" label="Client name">
            <TextInput id="clientName" value={clientName} onChange={setClientName} />
          </Field>
          <Field id="clientEmail" label="Client email">
            <TextInput id="clientEmail" type="email" value={clientEmail} onChange={setClientEmail} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="eventDate" label="Event date">
            <TextInput id="eventDate" type="date" value={eventDate} onChange={setEventDate} />
          </Field>
          <Field id="eventType" label="Event type">
            <TextInput id="eventType" value={eventType} onChange={setEventType} placeholder="Wedding" />
          </Field>
        </div>
      </Section>

      <Section title="Access">
        <Field id="password" label="Password" hint={gallery.passwordHash ? 'currently set' : 'currently unset'}>
          {passwordEdit ? (
            <div className="space-y-2">
              <TextInput id="password" type="password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} placeholder="leave blank to remove the password" />
              <div className="flex items-center gap-3">
                <Button type="button" variant="ghost" onClick={() => { setPasswordEdit(false); setNewPassword(''); }}>
                  Cancel
                </Button>
                <p className="text-xs text-ink-muted">Save changes to apply.</p>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setPasswordEdit(true)}>
              {gallery.passwordHash ? 'Change password' : 'Set password'}
            </Button>
          )}
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="expiresAt" label="Expires on" hint="optional">
            <TextInput id="expiresAt" type="date" value={expiresAt} onChange={setExpiresAt} />
          </Field>
          <Field id="gracePeriodDays" label="Grace period (days)" hint="after expiry">
            <TextInput id="gracePeriodDays" value={gracePeriodDays} onChange={setGracePeriodDays} placeholder="0" />
          </Field>
        </div>
      </Section>

      <Section title="Permissions">
        <Toggle id="allowFavorites" checked={allowFavorites} onChange={setAllowFavorites} label="Favorites" description="Clients can mark photos as favorites." />
        <Toggle id="allowComments" checked={allowComments} onChange={setAllowComments} label="Comments" description="Clients can leave comments (with moderation)." />
        <Toggle id="allowDownload" checked={allowDownload} onChange={setAllowDownload} label="Downloads" description="Clients can download photos and gallery ZIPs." />
        <Toggle id="notifyOnView" checked={notifyOnView} onChange={setNotifyOnView} label="Notify on view" description="Email you the first time the gallery is opened (rate-limited to once every 4h)." />
      </Section>

      <Section title="Delivery">
        <Field id="downloadMode" label="Download mode">
          <Select id="downloadMode" value={downloadMode} onChange={setDownloadMode} options={[
            { value: 'watermarked', label: 'Watermarked (preview-quality with logo)' },
            { value: 'full', label: 'Full resolution' },
            { value: 'selected', label: 'Selected favorites get full, rest watermarked' },
            { value: 'none', label: 'Disabled' },
          ]} />
        </Field>
      </Section>

      <Section title="Advanced">
        <Field id="customCss" label="Custom CSS" hint="scoped to the gallery container; sanitised">
          <Textarea id="customCss" rows={4} value={customCss} onChange={setCustomCss} placeholder=".gallery-hero { letter-spacing: 0.5em; }" />
        </Field>
      </Section>

      <FormError message={error} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="danger" onClick={onDelete}>Delete gallery</Button>
        <div className="flex items-center gap-4">
          {savedAt && !saving && (
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Saved · {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          <Button type="submit" disabled={saving || pending || title.trim().length === 0}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface border border-border p-7 space-y-6">
      <h2 className="text-xs font-extrabold tracking-[0.22em] uppercase text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

function emptyToNull(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

function dateInputToEpoch(v: string): number | null {
  if (!v) return null;
  const ts = new Date(v).getTime();
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

function toDateInput(epoch: number | null): string {
  if (!epoch) return '';
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}
