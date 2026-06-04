"use client";

import type { WatermarkPreset } from "@/lib/api/watermarks";
import { Button, FormError } from "@/components/admin/form";
import { Topnav } from "@/components/admin/topnav";
import { Plus } from "@/components/ui/icons";
import { useWatermarkPresets } from "@/hooks/use-watermark-presets";
import { PresetEditor } from "./preset-editor";
import { PresetCard } from "./preset-card";

export function WatermarkManager({
  initialPresets,
  user,
}: {
  initialPresets: WatermarkPreset[];
  user: { name: string; email: string };
}) {
  const {
    presets,
    draft,
    set,
    dirty,
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
    <div>
      <Topnav
        title="Watermarks"
        subtitle="Reusable text or logo overlays for preview-quality downloads."
        user={user}
        action={
          !draft && (
            <Button
              type="button"
              onClick={newDraft}
              className="tracking-wider"
            >
              <Plus size={16} />
              New watermark
            </Button>
          )
        }
      />

      <div className="px-4 py-4 pb-16 space-y-4">
        <FormError message={error} />

        {draft && (
        <PresetEditor
          draft={draft}
          set={set}
          dirty={dirty}
          saving={saving}
          uploading={uploading}
          onSave={save}
          onCancel={cancel}
          onUploadLogo={uploadLogo}
        />
      )}

      {presets.length === 0 && !draft ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center">
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
    </div>
  );
}
