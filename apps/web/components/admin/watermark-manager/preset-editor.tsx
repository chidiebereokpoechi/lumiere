"use client";

import type { WatermarkPosition, WatermarkSize } from "@/lib/api/watermarks";
import { Field, TextInput, Select, Button } from "@/components/admin/form";
import { cn } from "@/lib/cn";
import { POSITIONS, SIZES, type Draft } from "./draft";
import { WatermarkPreview } from "./watermark-preview";

const SWATCHES = [
  "#ffffff",
  "#000000",
  "#ff5c33",
  "#a95ee7",
  "#2f8055",
  "#1f2937",
];

// Create/edit form for a single watermark preset, with a live preview.
export function PresetEditor({
  draft,
  set,
  saving,
  uploading,
  onSave,
  onCancel,
  onUploadLogo,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  saving: boolean;
  uploading: boolean;
  onSave: () => void;
  onCancel: () => void;
  onUploadLogo: (file: File) => void;
}) {
  return (
    <section className="rounded-xl bg-surface border border-border p-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Field id="wm-name" label="Name" required>
            <TextInput
              id="wm-name"
              value={draft.name}
              onChange={(v) => set("name", v)}
              placeholder="e.g. Studio logo bottom-right"
            />
          </Field>

          <Field id="wm-type" label="Type">
            <div className="flex gap-2">
              {(["text", "image"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm font-semibold tracking-wider transition-colors",
                    draft.type === t
                      ? "bg-surface-strong text-ink-inverse border-surface-strong"
                      : "bg-surface text-ink-muted border-border hover:border-border-strong hover:text-ink-strong",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          {draft.type === "text" ? (
            <>
              <Field id="wm-text" label="Text" required>
                <TextInput
                  id="wm-text"
                  value={draft.text}
                  onChange={(v) => set("text", v)}
                  placeholder="© Your Studio 2026"
                />
              </Field>
              <Field id="wm-color" label="Color">
                <div className="flex items-center gap-3">
                  <span
                    className="h-9 w-9 shrink-0 rounded-md border border-border"
                    style={{ background: draft.color }}
                  />
                  <TextInput
                    id="wm-color"
                    value={draft.color}
                    onChange={(v) =>
                      set("color", v.startsWith("#") ? v : `#${v}`)
                    }
                    placeholder="#ffffff"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("color", c)}
                      aria-label={c}
                      className={cn(
                        "h-4 w-4 rounded-md border",
                        draft.color.toLowerCase() === c
                          ? "ring-2 ring-accent border-accent"
                          : "border-border",
                      )}
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
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                  {uploading
                    ? "Uploading…"
                    : draft.s3Key
                      ? "Replace logo"
                      : "Upload logo"}
                </label>
                {draft.s3Key && (
                  <span className="text-xs text-positive font-semibold">
                    Logo set ✓
                  </span>
                )}
              </div>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="wm-pos" label="Position">
              <Select
                id="wm-pos"
                value={draft.position}
                onChange={(v) => set("position", v as WatermarkPosition)}
                options={POSITIONS}
              />
            </Field>
            <Field id="wm-size" label="Size">
              <Select
                id="wm-size"
                value={draft.size}
                onChange={(v) => set("size", v as WatermarkSize)}
                options={SIZES}
              />
            </Field>
          </div>

          <Field
            id="wm-opacity"
            label="Opacity"
            hint={`${Math.round(draft.opacity * 100)}%`}
          >
            <input
              id="wm-opacity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.opacity}
              onChange={(e) => set("opacity", Number(e.target.value))}
              className="w-full accent-accent"
            />
          </Field>
        </div>

        {/* Live preview */}
        <div>
          <p className="text-xs font-bold tracking-wider text-ink-muted mb-2">
            Preview
          </p>
          <WatermarkPreview draft={draft} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={saving || uploading}>
          {saving ? "Saving…" : draft.id ? "Save changes" : "Create watermark"}
        </Button>
      </div>
    </section>
  );
}
