'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GalleryPatchInput } from '@lumiere/types';
import { apiClientMutation, ApiError } from '@/lib/api-client';
import type { GalleryDetail } from '@/lib/api/galleries';
import type { WatermarkPreset } from '@/lib/api/watermarks';
import { Field, TextInput, Textarea, Select, Toggle, Button, FormError } from '@/components/admin/form';
import { DateField } from '@/components/ui/date-field';
import { confirmDialog } from '@/components/ui/dialog';

interface Props {
  gallery: GalleryDetail;
  watermarks: WatermarkPreset[];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SettingsForm({ gallery, watermarks }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

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
  const [watermarkPresetId, setWatermarkPresetId] = useState(gallery.watermarkPresetId ?? '');
  const [customCss, setCustomCss] = useState(gallery.customCss ?? '');

  // Password: changed explicitly (not auto-saved) so typing can't accidentally
  // lock the gallery. '' on apply = clear.
  const [passwordEdit, setPasswordEdit] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // The auto-saved fields (everything except the password). Persisted on change.
  const save = useCallback(async () => {
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
      watermarkPresetId: watermarkPresetId || null,
      customCss: emptyToNull(customCss),
    };
    const parsed = GalleryPatchInput.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      setSaveState('error');
      return;
    }
    setError(null);
    setSaveState('saving');
    try {
      await apiClientMutation(`/api/galleries/${gallery.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      setSaveState('saved');
    } catch (err) {
      setError(err instanceof ApiError ? `Save failed (${err.status})` : 'Network error');
      setSaveState('error');
    }
  }, [gallery.id, title, subtitle, status, downloadMode, layout, clientName, clientEmail,
      eventDate, eventType, expiresAt, gracePeriodDays, allowFavorites, allowComments,
      allowDownload, notifyOnView, watermarkPresetId, customCss]);

  // Auto-save: non-text fields (selects, toggles, dates) flush immediately;
  // text fields debounce ~700ms and also flush on blur. Skip the initial mount.
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushNext = useRef(false);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (title.trim().length === 0) { setError('Title is required'); setSaveState('error'); return; }
    if (timer.current) clearTimeout(timer.current);
    const delay = flushNext.current ? 0 : 700;
    flushNext.current = false;
    timer.current = setTimeout(() => { void save(); }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [save, title]);

  // Flush a pending text-field edit immediately (used on blur).
  const flushNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (title.trim().length > 0) void save();
  }, [save, title]);
  // Mark the next auto-save as immediate (selects/toggles/dates change → save now).
  const immediate = <T,>(fn: (v: T) => void) => (v: T) => { flushNext.current = true; fn(v); };

  // Password is applied on demand, then we refresh to update the "currently set" hint.
  async function applyPassword() {
    const parsed = GalleryPatchInput.safeParse({ password: newPassword === '' ? null : newPassword });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Invalid password'); return; }
    setSaveState('saving');
    try {
      await apiClientMutation(`/api/galleries/${gallery.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      setPasswordEdit(false);
      setNewPassword('');
      setSaveState('saved');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiError ? `Save failed (${err.status})` : 'Network error');
      setSaveState('error');
    }
  }

  async function onDelete() {
    const ok = await confirmDialog({
      title: 'Delete gallery',
      message: `Delete "${gallery.title}"? This removes all photos and attachments. Cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiClientMutation(`/api/galleries/${gallery.id}`, { method: 'DELETE' });
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Delete failed (${err.status})` : 'Network error');
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <Section title="Basics">
        <Field id="title" label="Title" required>
          <TextInput id="title" required value={title} onChange={setTitle} onBlur={flushNow} />
        </Field>
        <Field id="subtitle" label="Subtitle" hint="optional">
          <Textarea id="subtitle" rows={2} value={subtitle} onChange={setSubtitle} onBlur={flushNow} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="status" label="Status">
            <Select id="status" value={status} onChange={immediate(setStatus)} options={[
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Draft' },
              { value: 'archived', label: 'Archived' },
            ]} />
          </Field>
          <Field id="layout" label="Layout">
            <Select id="layout" value={layout} onChange={immediate(setLayout)} options={[
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
            <TextInput id="clientName" value={clientName} onChange={setClientName} onBlur={flushNow} />
          </Field>
          <Field id="clientEmail" label="Client email">
            <TextInput id="clientEmail" type="email" value={clientEmail} onChange={setClientEmail} onBlur={flushNow} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="eventDate" label="Event date">
            <DateField id="eventDate" value={eventDate} onChange={immediate(setEventDate)} placeholder="No date" />
          </Field>
          <Field id="eventType" label="Event type">
            <TextInput id="eventType" value={eventType} onChange={setEventType} onBlur={flushNow} placeholder="Wedding" />
          </Field>
        </div>
      </Section>

      <Section title="Access">
        <Field id="password" label="Password" hint={gallery.passwordHash ? 'currently set' : 'currently unset'}>
          {passwordEdit ? (
            <div className="space-y-2">
              <TextInput id="password" type="password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} placeholder="leave blank to remove the password" />
              <div className="flex items-center gap-3">
                <Button type="button" onClick={applyPassword}>Apply</Button>
                <Button type="button" variant="ghost" onClick={() => { setPasswordEdit(false); setNewPassword(''); }}>
                  Cancel
                </Button>
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
            <DateField id="expiresAt" value={expiresAt} onChange={immediate(setExpiresAt)} placeholder="Never" />
          </Field>
          <Field id="gracePeriodDays" label="Grace period (days)" hint="after expiry">
            <TextInput id="gracePeriodDays" value={gracePeriodDays} onChange={setGracePeriodDays} onBlur={flushNow} placeholder="0" />
          </Field>
        </div>
      </Section>

      <Section title="Permissions">
        <Toggle id="allowFavorites" checked={allowFavorites} onChange={immediate(setAllowFavorites)} label="Favorites" description="Clients can mark photos as favorites." />
        <Toggle id="allowComments" checked={allowComments} onChange={immediate(setAllowComments)} label="Comments" description="Clients can leave comments (with moderation)." />
        <Toggle id="allowDownload" checked={allowDownload} onChange={immediate(setAllowDownload)} label="Downloads" description="Clients can download photos and gallery ZIPs." />
        <Toggle id="notifyOnView" checked={notifyOnView} onChange={immediate(setNotifyOnView)} label="Notify on view" description="Email you the first time the gallery is opened (rate-limited to once every 4h)." />
      </Section>

      <Section title="Delivery">
        <Field id="downloadMode" label="Download mode">
          <Select id="downloadMode" value={downloadMode} onChange={immediate(setDownloadMode)} options={[
            { value: 'watermarked', label: 'Watermarked (preview-quality with logo)' },
            { value: 'full', label: 'Full resolution' },
            { value: 'selected', label: 'Selected favorites get full, rest watermarked' },
            { value: 'none', label: 'Disabled' },
          ]} />
        </Field>
        <Field
          id="watermarkPresetId"
          label="Watermark"
          hint={watermarks.length === 0 ? 'none created yet' : 'applied to image previews'}
        >
          <Select
            id="watermarkPresetId"
            value={watermarkPresetId}
            onChange={immediate(setWatermarkPresetId)}
            options={[
              { value: '', label: watermarks.length === 0 ? 'No watermarks — create one first' : 'None' },
              ...watermarks.map((w) => ({ value: w.id, label: `${w.name} (${w.type})` })),
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-subtle">
            Changing this reprocesses existing photos; clearing it removes the watermarked copies.
          </p>
        </Field>
      </Section>

      <Section title="Advanced">
        <Field id="customCss" label="Custom CSS" hint="scoped to the gallery container; sanitised">
          <Textarea id="customCss" rows={4} value={customCss} onChange={setCustomCss} onBlur={flushNow} placeholder=".gallery-hero { letter-spacing: 0.5em; }" />
        </Field>
      </Section>

      <FormError message={error} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="danger" onClick={onDelete}>Delete gallery</Button>
        <SaveStatus state={saveState} />
      </div>
    </form>
  );
}

// Inline auto-save indicator — replaces the Save button. Changes persist
// automatically as fields change.
function SaveStatus({ state }: { state: SaveState }) {
  const base = 'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest';
  if (state === 'saving') {
    return (
      <span className={`${base} text-ink-muted`}>
        <span className="h-3 w-3 rounded-full border-2 border-ink-subtle border-t-transparent animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === 'error') {
    return <span className={`${base} text-negative`}>Not saved</span>;
  }
  if (state === 'saved') {
    return (
      <span className={`${base} text-ink-muted`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        All changes saved
      </span>
    );
  }
  return <span className={`${base} text-ink-subtle`}>Changes save automatically</span>;
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
