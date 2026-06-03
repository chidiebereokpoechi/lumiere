'use client';

import { useState } from 'react';
import { apiClient, apiClientMutation, ApiError } from '@/lib/api-client';
import type {
  WatermarkPreset, WatermarkPosition, WatermarkSize, WatermarkConfig, LogoUploadResult,
} from '@/lib/api/watermarks';
import { Field, TextInput, Select, Button, FormError } from '@/components/admin/form';
import { confirmDialog } from '@/components/ui/dialog';

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'center', label: 'Center' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
];
const SIZES: { value: WatermarkSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

interface Draft {
  id?: string;
  name: string;
  type: 'text' | 'image';
  text: string;
  color: string;
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: number;
  s3Key?: string;
  logoPreview?: string; // object URL of a freshly-uploaded logo
}

const blankDraft: Draft = {
  name: '', type: 'text', text: '', color: '#ffffff',
  position: 'bottom-right', size: 'medium', opacity: 0.4,
};

function draftFrom(p: WatermarkPreset): Draft {
  const c = p.config;
  return {
    id: p.id,
    name: p.name,
    type: c.type,
    text: c.type === 'text' ? c.text : '',
    color: c.type === 'text' ? c.color : '#ffffff',
    position: c.position,
    size: c.size,
    opacity: c.opacity,
    s3Key: c.type === 'image' ? c.s3Key : undefined,
  };
}

export function WatermarkManager({ initialPresets }: { initialPresets: WatermarkPreset[] }) {
  const [presets, setPresets] = useState(initialPresets);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function uploadLogo(file: File) {
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClientMutation<LogoUploadResult>('/api/watermark-presets/logo', { method: 'POST', body: form });
      setDraft((d) => (d ? { ...d, s3Key: res.s3Key, logoPreview: URL.createObjectURL(file) } : d));
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 413 ? 'Logo too large (max 5 MB).' : `Upload failed (${err.status})`) : 'Network error');
    } finally { setUploading(false); }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setError('Name is required.'); return; }
    if (draft.type === 'text' && !draft.text.trim()) { setError('Watermark text is required.'); return; }
    if (draft.type === 'image' && !draft.s3Key) { setError('Upload a logo first.'); return; }

    const config: WatermarkConfig = draft.type === 'text'
      ? { type: 'text', text: draft.text.trim(), position: draft.position, size: draft.size, opacity: draft.opacity, color: draft.color }
      : { type: 'image', s3Key: draft.s3Key!, position: draft.position, size: draft.size, opacity: draft.opacity };

    setSaving(true); setError(null);
    try {
      const body = JSON.stringify({ name: draft.name.trim(), config });
      const saved = draft.id
        ? await apiClientMutation<WatermarkPreset>(`/api/watermark-presets/${draft.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body })
        : await apiClientMutation<WatermarkPreset>('/api/watermark-presets', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      setPresets((prev) => {
        const without = prev.filter((p) => p.id !== saved.id);
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setDraft(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Save failed (${err.status})` : 'Network error');
    } finally { setSaving(false); }
  }

  async function remove(p: WatermarkPreset) {
    const ok = await confirmDialog({ title: 'Delete watermark', message: `Delete "${p.name}"? Galleries using it keep their existing derivatives until reprocessed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setPresets((prev) => prev.filter((x) => x.id !== p.id));
    try { await apiClientMutation(`/api/watermark-presets/${p.id}`, { method: 'DELETE' }); }
    catch { void apiClient<WatermarkPreset[]>('/api/watermark-presets').then(setPresets).catch(() => {}); }
  }

  return (
    <div className="space-y-6">
      <FormError message={error} />

      {!draft && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => { setError(null); setDraft({ ...blankDraft }); }}>+ New watermark</Button>
        </div>
      )}

      {draft && (
        <section className="rounded-xl bg-surface border border-border p-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <Field id="wm-name" label="Name" required>
                <TextInput id="wm-name" value={draft.name} onChange={(v) => set('name', v)} placeholder="e.g. Studio logo bottom-right" />
              </Field>

              <Field id="wm-type" label="Type">
                <div className="flex gap-2">
                  {(['text', 'image'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('type', t)}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors ${
                        draft.type === t ? 'bg-surface-strong text-ink-inverse border-surface-strong' : 'bg-surface text-ink-muted border-border hover:border-border-strong hover:text-ink-strong'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>

              {draft.type === 'text' ? (
                <>
                  <Field id="wm-text" label="Text" required>
                    <TextInput id="wm-text" value={draft.text} onChange={(v) => set('text', v)} placeholder="© Your Studio 2026" />
                  </Field>
                  <Field id="wm-color" label="Color">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-9 shrink-0 rounded-md border border-border" style={{ background: draft.color }} />
                      <TextInput id="wm-color" value={draft.color} onChange={(v) => set('color', v.startsWith('#') ? v : `#${v}`)} placeholder="#ffffff" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['#ffffff', '#000000', '#ff5c33', '#a95ee7', '#2f8055', '#1f2937'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => set('color', c)}
                          aria-label={c}
                          className={`h-6 w-6 rounded-md border ${draft.color.toLowerCase() === c ? 'ring-2 ring-accent border-accent' : 'border-border'}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </Field>
                </>
              ) : (
                <Field id="wm-logo" label="Logo" hint="PNG/WebP, max 5 MB">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink-strong hover:border-border-strong cursor-pointer">
                      <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ''; }} />
                      {uploading ? 'Uploading…' : draft.s3Key ? 'Replace logo' : 'Upload logo'}
                    </label>
                    {draft.s3Key && <span className="text-xs text-positive font-semibold">Logo set ✓</span>}
                  </div>
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="wm-pos" label="Position">
                  <Select id="wm-pos" value={draft.position} onChange={(v) => set('position', v as WatermarkPosition)} options={POSITIONS} />
                </Field>
                <Field id="wm-size" label="Size">
                  <Select id="wm-size" value={draft.size} onChange={(v) => set('size', v as WatermarkSize)} options={SIZES} />
                </Field>
              </div>

              <Field id="wm-opacity" label="Opacity" hint={`${Math.round(draft.opacity * 100)}%`}>
                <input id="wm-opacity" type="range" min={0} max={1} step={0.05} value={draft.opacity} onChange={(e) => set('opacity', Number(e.target.value))} className="w-full accent-accent" />
              </Field>
            </div>

            {/* Live preview */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">Preview</p>
              <WatermarkPreview draft={draft} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create watermark'}</Button>
          </div>
        </section>
      )}

      {presets.length === 0 && !draft ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-ink-muted">No watermarks yet. Create one to protect preview-quality downloads.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-surface p-3">
              <WatermarkPreview draft={draftFrom(p)} compact />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-strong truncate">{p.name}</p>
                  <p className="text-[11px] uppercase tracking-wider text-ink-subtle">{p.type}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => { setError(null); setDraft(draftFrom(p)); }} title="Edit" className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink-strong">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button type="button" onClick={() => remove(p)} title="Delete" className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 hover:text-negative">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Approximate CSS rendering of a watermark over a sample backdrop. The real
// compositing happens server-side via Sharp; this is just a design aid.
function WatermarkPreview({ draft, compact }: { draft: Draft; compact?: boolean }) {
  const align: Record<WatermarkPosition, string> = {
    'top-left': 'items-start justify-start',
    'top-center': 'items-start justify-center',
    'top-right': 'items-start justify-end',
    'center': 'items-center justify-center',
    'bottom-left': 'items-end justify-start',
    'bottom-center': 'items-end justify-center',
    'bottom-right': 'items-end justify-end',
  };
  const textPx = draft.size === 'small' ? (compact ? 10 : 16) : draft.size === 'large' ? (compact ? 22 : 40) : (compact ? 15 : 26);
  const imgW = draft.size === 'small' ? '22%' : draft.size === 'large' ? '55%' : '38%';

  return (
    <div className={`relative w-full overflow-hidden rounded-lg ${compact ? 'aspect-[4/3]' : 'aspect-video'} bg-linear-to-br from-slate-500 via-slate-700 to-slate-900`}>
      <div className={`absolute inset-0 flex p-3 ${align[draft.position]}`}>
        {draft.type === 'text' ? (
          <span style={{ color: draft.color, opacity: draft.opacity, fontSize: textPx, lineHeight: 1.1 }} className="font-bold drop-shadow max-w-full truncate">
            {draft.text || 'Your watermark'}
          </span>
        ) : draft.logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.logoPreview} alt="" style={{ width: imgW, opacity: draft.opacity }} className="object-contain" />
        ) : (
          <span style={{ opacity: draft.opacity }} className="inline-flex items-center gap-1.5 rounded bg-white/85 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-800">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            Logo
          </span>
        )}
      </div>
    </div>
  );
}
