'use client';

import { useRef, useState } from 'react';
import { apiClientMutation, ApiError } from '@/lib/api-client';
import type { Attachment } from '@/lib/api/attachments';

interface Props {
  galleryId: string;
  initialAttachments: Attachment[];
}

function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function AttachmentManager({ galleryId, initialAttachments }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    const form = new FormData();
    for (const f of files) form.append('files', f);
    try {
      const res = await apiClientMutation<{ attachments: Attachment[]; rejected: { filename: string; reason: string }[] }>(
        `/api/galleries/${galleryId}/attachments`,
        { method: 'POST', body: form },
      );
      setAttachments((prev) => [...prev, ...res.attachments]);
      if (res.rejected?.length) {
        setError(`Rejected: ${res.rejected.map((r) => `${r.filename} (${r.reason})`).join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? `Upload failed (${err.status})` : 'Network error during upload');
    } finally {
      setUploading(false);
    }
  }

  async function patch(att: Attachment, body: Record<string, unknown>) {
    setBusyId(att.id);
    try {
      const updated = await apiClientMutation<Attachment>(`/api/galleries/${galleryId}/attachments/${att.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setAttachments((prev) => prev.map((a) => (a.id === att.id ? updated : a)));
    } catch (err) {
      setError(err instanceof ApiError ? `Update failed (${err.status})` : 'Network error');
    } finally {
      setBusyId(null);
    }
  }

  function rename(att: Attachment) {
    const name = window.prompt('Display name', att.displayName ?? att.filenameOriginal)?.trim();
    if (name === undefined || name === '') return;
    void patch(att, { displayName: name });
  }

  function editDescription(att: Attachment) {
    const desc = window.prompt('Description (blank to clear)', att.description ?? '');
    if (desc === null) return;
    void patch(att, { description: desc.trim() === '' ? null : desc.trim() });
  }

  async function remove(att: Attachment) {
    if (!confirm(`Delete "${att.displayName ?? att.filenameOriginal}"? Cannot be undone.`)) return;
    setBusyId(att.id);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/attachments/${att.id}`, { method: 'DELETE' });
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      setError(err instanceof ApiError ? `Delete failed (${err.status})` : 'Network error');
    } finally {
      setBusyId(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div role="alert" className="rounded-md bg-accent-soft border border-accent/40 px-4 py-3 text-sm font-semibold text-ink-strong">
          {error}
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-strong bg-surface'
        }`}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-subtle">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm font-semibold text-ink-strong">{uploading ? 'Uploading…' : 'Drop files here or click to browse'}</p>
        <p className="text-xs text-ink-muted">Contracts, PDFs, ZIPs — any file type</p>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-ink-muted">No files yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-subtle shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-strong truncate">{a.displayName ?? a.filenameOriginal}</p>
                {a.description && <p className="text-xs text-ink-muted truncate">{a.description}</p>}
              </div>
              <span className="text-xs tabular-nums text-ink-subtle shrink-0">{formatBytes(a.fileSize)}</span>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton title="Rename" onClick={() => rename(a)} disabled={busyId === a.id}>
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </IconButton>
                <IconButton title="Edit description" onClick={() => editDescription(a)} disabled={busyId === a.id}>
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </IconButton>
                <IconButton title="Delete" onClick={() => remove(a)} disabled={busyId === a.id} danger>
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconButton({ title, onClick, disabled, danger, children }: { title: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-50 ${danger ? 'text-negative' : 'text-ink-muted hover:text-ink-strong'}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}
