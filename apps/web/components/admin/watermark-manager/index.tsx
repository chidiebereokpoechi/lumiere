"use client";

import type { WatermarkPreset } from "@/lib/api/watermarks";
import { Button, FormError } from "@/components/admin/form";
import { useWatermarkPresets } from "@/hooks/use-watermark-presets";
import { PresetEditor } from "./preset-editor";
import { PresetCard } from "./preset-card";

export function WatermarkManager({
  initialPresets,
}: {
  initialPresets: WatermarkPreset[];
}) {
  const {
    presets,
    draft,
    set,
    error,
    saving,
    uploading,
    newDraft,
    editDraft,
    cancel,
    uploadLogo,
    save,
    remove,
  } = useWatermarkPresets(initialPresets);

  return (
    <div className="space-y-6">
      <FormError message={error} />

      {!draft && (
        <div className="flex justify-end">
          <Button type="button" onClick={newDraft}>
            + New watermark
          </Button>
        </div>
      )}

      {draft && (
        <PresetEditor
          draft={draft}
          set={set}
          saving={saving}
          uploading={uploading}
          onSave={save}
          onCancel={cancel}
          onUploadLogo={uploadLogo}
        />
      )}

      {presets.length === 0 && !draft ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-ink-muted">
            No watermarks yet. Create one to protect preview-quality downloads.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              onEdit={() => editDraft(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
