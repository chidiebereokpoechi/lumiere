"use client";

import { useState } from "react";
import {
  apiClient,
  apiClientMutation,
  apiErrorMessage,
  ApiError,
  mutateJson,
} from "@/lib/api-client";
import type {
  WatermarkPreset,
  WatermarkConfig,
  LogoUploadResult,
} from "@/lib/api/watermarks";
import { confirmDialog } from "@/components/ui/dialog";
import { blankDraft, draftFrom, type Draft } from "@/components/admin/watermark-manager/draft";

// All watermark-preset state + CRUD: the list, the in-progress draft (create or
// edit), logo upload, validation, and save/delete with optimistic list updates.
export function useWatermarkPresets(initial: WatermarkPreset[]) {
  const [presets, setPresets] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const newDraft = () => {
    setError(null);
    setDraft({ ...blankDraft });
  };
  const editDraft = (p: WatermarkPreset) => {
    setError(null);
    setDraft(draftFrom(p));
  };
  const cancel = () => setDraft(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiClientMutation<LogoUploadResult>(
        "/api/watermark-presets/logo",
        { method: "POST", body: form },
      );
      setDraft((d) =>
        d
          ? { ...d, s3Key: res.s3Key, logoPreview: URL.createObjectURL(file) }
          : d,
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 413
          ? "Logo too large (max 5 MB)."
          : apiErrorMessage(err, "Upload failed"),
      );
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Name is required.");
    if (draft.type === "text" && !draft.text.trim())
      return setError("Watermark text is required.");
    if (draft.type === "image" && !draft.s3Key)
      return setError("Upload a logo first.");

    const config: WatermarkConfig =
      draft.type === "text"
        ? {
            type: "text",
            text: draft.text.trim(),
            position: draft.position,
            size: draft.size,
            opacity: draft.opacity,
            color: draft.color,
          }
        : {
            type: "image",
            s3Key: draft.s3Key!,
            position: draft.position,
            size: draft.size,
            opacity: draft.opacity,
          };

    setSaving(true);
    setError(null);
    try {
      const body = { name: draft.name.trim(), config };
      const saved = draft.id
        ? await mutateJson<WatermarkPreset>(
            `/api/watermark-presets/${draft.id}`,
            body,
            "PATCH",
          )
        : await mutateJson<WatermarkPreset>("/api/watermark-presets", body);
      setPresets((prev) => {
        const without = prev.filter((p) => p.id !== saved.id);
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setDraft(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: WatermarkPreset) {
    const ok = await confirmDialog({
      title: "Delete watermark",
      message: `Delete "${p.name}"? Galleries using it keep their existing derivatives until reprocessed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setPresets((prev) => prev.filter((x) => x.id !== p.id));
    try {
      await apiClientMutation(`/api/watermark-presets/${p.id}`, {
        method: "DELETE",
      });
    } catch {
      void apiClient<WatermarkPreset[]>("/api/watermark-presets")
        .then(setPresets)
        .catch(() => {});
    }
  }

  return {
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
  };
}
