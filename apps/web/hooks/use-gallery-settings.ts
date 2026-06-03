"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GalleryPatchInput } from "@lumiere/types";
import {
  apiClientMutation,
  apiErrorMessage,
  mutateJson,
} from "@/lib/api-client";
import { dateInputToEpoch, epochToDateInput } from "@/lib/format";
import type { GalleryDetail } from "@/lib/api/galleries";
import { confirmDialog } from "@/components/ui/dialog";
import { broadcastGalleryStatus, onGalleryStatus } from "@/lib/gallery-status";

export type SaveState = "idle" | "saving" | "saved" | "error";

function emptyToNull(v: string): string | null {
  return v.trim() === "" ? null : v.trim();
}

// Controller for the gallery settings form: holds every field, auto-saves on
// change (selects/toggles/dates flush immediately; text debounces ~700ms and
// flushes on blur), and exposes the password + delete actions. The view binds
// to the returned values and handlers — no business logic in the component.
export function useGallerySettings(gallery: GalleryDetail) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Local form state mirrors the row but maps integer booleans to real bools.
  const [title, setTitle] = useState(gallery.title);
  const [subtitle, setSubtitle] = useState(gallery.subtitle ?? "");
  const [status, setStatus] = useState<"active" | "archived" | "draft">(
    gallery.status ?? "active",
  );
  const [downloadMode, setDownloadMode] = useState<
    "none" | "watermarked" | "full" | "selected"
  >(gallery.downloadMode ?? "watermarked");
  const [layout, setLayout] = useState<"grid" | "masonry" | "slideshow">(
    gallery.layout ?? "grid",
  );
  const [navStyle, setNavStyle] = useState<"tabs" | "collections">(
    gallery.navStyle ?? "tabs",
  );
  const [clientName, setClientName] = useState(gallery.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(gallery.clientEmail ?? "");
  const [eventDate, setEventDate] = useState(epochToDateInput(gallery.eventDate));
  const [eventType, setEventType] = useState(gallery.eventType ?? "");
  const [expiresAt, setExpiresAt] = useState(epochToDateInput(gallery.expiresAt));
  const [gracePeriodDays, setGracePeriodDays] = useState(
    String(gallery.gracePeriodDays ?? 0),
  );
  const [allowFavorites, setAllowFavorites] = useState(
    gallery.allowFavorites === 1,
  );
  const [allowComments, setAllowComments] = useState(
    gallery.allowComments === 1,
  );
  const [allowDownload, setAllowDownload] = useState(
    gallery.allowDownload === 1,
  );
  const [notifyOnView, setNotifyOnView] = useState(gallery.notifyOnView === 1);
  const [watermarkPresetId, setWatermarkPresetId] = useState(
    gallery.watermarkPresetId ?? "",
  );
  const [customCss, setCustomCss] = useState(gallery.customCss ?? "");

  // Password: changed explicitly (not auto-saved) so typing can't accidentally
  // lock the gallery. '' on apply = clear.
  const [passwordEdit, setPasswordEdit] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // The auto-saved fields (everything except the password). Persisted on change.
  const save = useCallback(async () => {
    const patch: Record<string, unknown> = {
      title,
      subtitle: emptyToNull(subtitle),
      status,
      downloadMode,
      layout,
      navStyle,
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
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      setSaveState("error");
      return;
    }
    setError(null);
    setSaveState("saving");
    try {
      await mutateJson(`/api/galleries/${gallery.id}`, parsed.data, "PATCH");
      setSaveState("saved");
    } catch (err) {
      setError(apiErrorMessage(err, "Save failed"));
      setSaveState("error");
    }
  }, [
    gallery.id,
    title,
    subtitle,
    status,
    downloadMode,
    layout,
    navStyle,
    clientName,
    clientEmail,
    eventDate,
    eventType,
    expiresAt,
    gracePeriodDays,
    allowFavorites,
    allowComments,
    allowDownload,
    notifyOnView,
    watermarkPresetId,
    customCss,
  ]);

  // Auto-save: non-text fields (selects, toggles, dates) flush immediately;
  // text fields debounce ~700ms and also flush on blur. Skip the initial mount.
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushNext = useRef(false);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (title.trim().length === 0) {
      setError("Title is required");
      setSaveState("error");
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const delay = flushNext.current ? 0 : 700;
    flushNext.current = false;
    timer.current = setTimeout(() => {
      void save();
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [save, title]);

  // Flush a pending text-field edit immediately (used on blur).
  const flushNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (title.trim().length > 0) void save();
  }, [save, title]);

  // Keep status in sync with the header status control.
  useEffect(
    () =>
      onGalleryStatus((gid, s) => {
        if (gid === gallery.id) setStatus(s);
      }),
    [gallery.id],
  );

  // Mark the next auto-save as immediate (selects/toggles/dates change → save now).
  const immediate =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      flushNext.current = true;
      fn(v);
    };

  // Password is applied on demand, then we refresh to update the "currently set" hint.
  const applyPassword = useCallback(async () => {
    const parsed = GalleryPatchInput.safeParse({
      password: newPassword === "" ? null : newPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }
    setSaveState("saving");
    try {
      await mutateJson(`/api/galleries/${gallery.id}`, parsed.data, "PATCH");
      setPasswordEdit(false);
      setNewPassword("");
      setSaveState("saved");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(apiErrorMessage(err, "Save failed"));
      setSaveState("error");
    }
  }, [gallery.id, newPassword, router, startTransition]);

  const onDelete = useCallback(async () => {
    const ok = await confirmDialog({
      title: "Delete gallery",
      message: `Delete "${gallery.title}"? This removes all photos and attachments. Cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiClientMutation(`/api/galleries/${gallery.id}`, {
        method: "DELETE",
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Delete failed"));
    }
  }, [gallery.id, gallery.title, router]);

  return {
    saveState,
    error,
    fields: {
      title,
      subtitle,
      status,
      downloadMode,
      layout,
      navStyle,
      clientName,
      clientEmail,
      eventDate,
      eventType,
      expiresAt,
      gracePeriodDays,
      allowFavorites,
      allowComments,
      allowDownload,
      notifyOnView,
      watermarkPresetId,
      customCss,
    },
    setters: {
      setTitle,
      setSubtitle,
      setStatus,
      setDownloadMode,
      setLayout,
      setNavStyle,
      setClientName,
      setClientEmail,
      setEventDate,
      setEventType,
      setExpiresAt,
      setGracePeriodDays,
      setAllowFavorites,
      setAllowComments,
      setAllowDownload,
      setNotifyOnView,
      setWatermarkPresetId,
      setCustomCss,
    },
    password: { passwordEdit, setPasswordEdit, newPassword, setNewPassword },
    flushNow,
    immediate,
    applyPassword,
    onDelete,
    broadcastStatus: broadcastGalleryStatus,
  };
}
