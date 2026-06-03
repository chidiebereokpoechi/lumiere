"use client";

import { useCallback, useRef, useState } from "react";
import { getCsrfToken } from "@/lib/api-client";
import { uploadMultipart } from "@/lib/upload/multipart";

// Anything above this uploads directly to storage via presigned multipart
// (bypassing the app + the dev rewrite proxy, which caps bodies at 10MB).
// Kept under that cap so the single-request path never hits the proxy limit.
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;
// How many files upload at once (each large file already parallelizes parts).
const FILE_CONCURRENCY = 3;

export type UploadState = "uploading" | "processing" | "ready" | "error";
export interface UploadTile {
  key: string;
  filename: string;
  status: UploadState;
  progress: number;
  reason?: string;
}
interface JobEvent {
  type: "queued" | "processing" | "ready" | "error" | "done";
  photoId?: string;
  filename?: string;
  reason?: string;
}

/**
 * The media upload pipeline. Stores per-file progress placeholders (`tiles`),
 * uploads via single-request POST or presigned multipart depending on size, and
 * watches the SSE job stream to refresh files as derivatives become ready.
 *
 * `refreshFiles` re-pulls the gallery's file list; `onError` surfaces a banner
 * message. Returns the live `tiles` and an `upload(files, folderId)` action.
 */
export function useUploads({
  galleryId,
  refreshFiles,
  onError,
}: {
  galleryId: string;
  refreshFiles: () => void;
  onError: (msg: string) => void;
}) {
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const inflight = useRef(0);

  const updateTile = useCallback((key: string, patch: Partial<UploadTile>) => {
    setTiles((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    );
  }, []);

  const settle = useCallback(
    (_key: string) => {
      inflight.current -= 1;
      refreshFiles();
      if (inflight.current <= 0) {
        window.setTimeout(
          () => setTiles((prev) => prev.filter((t) => t.status === "error")),
          800,
        );
      }
    },
    [refreshFiles],
  );

  // After bytes are uploaded the placeholder is dropped and the real (processing)
  // row takes its slot; these events just refresh it in place to ready/error.
  const watchBatch = useCallback(
    (batchId: string, key: string) => {
      const es = new EventSource(`/events?batch=${batchId}`);
      es.onmessage = (ev) => {
        let data: JobEvent;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === "ready" || data.type === "error") refreshFiles();
        else if (data.type === "done") {
          es.close();
          settle(key);
        }
      };
      es.onerror = () => {
        es.close();
        settle(key);
      };
    },
    [refreshFiles, settle],
  );

  const uploadOne = useCallback(
    (file: File, key: string, token: string, folderId: string) => {
      return new Promise<void>((resolve) => {
        const form = new FormData();
        form.append("files", file);
        const xhr = new XMLHttpRequest();
        const q = folderId ? `?folderId=${folderId}` : "";
        xhr.open("POST", `/api/galleries/${galleryId}/files${q}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-CSRF-Token", token);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            updateTile(key, {
              status: "uploading",
              progress: Math.round((e.loaded / e.total) * 100),
            });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            // Bytes are in; the server row now exists (processing/ready) at its end
            // position. Drop the placeholder and let the real tile show in place.
            setTiles((prev) => prev.filter((t) => t.key !== key));
            refreshFiles();
            let batchId = "";
            try {
              batchId = JSON.parse(xhr.responseText).batchId;
            } catch {
              /* ignore */
            }
            if (batchId) watchBatch(batchId, key);
            else settle(key);
          } else {
            updateTile(key, { status: "error", reason: `HTTP ${xhr.status}` });
            onError(`Upload failed (${xhr.status})`);
            settle(key);
          }
          resolve();
        };
        xhr.onerror = () => {
          updateTile(key, { status: "error", reason: "network error" });
          onError("Network error during upload");
          settle(key);
          resolve();
        };
        xhr.send(form);
      });
    },
    [galleryId, updateTile, watchBatch, settle, refreshFiles, onError],
  );

  const upload = useCallback(
    async (fileList: FileList | File[], folderId: string) => {
      const arr = Array.from(fileList);
      if (arr.length === 0 || !folderId) return;
      const seeded = arr.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        file: f,
      }));
      setTiles((prev) => [
        ...seeded.map((s) => ({
          key: s.key,
          filename: s.file.name,
          status: "uploading" as UploadState,
          progress: 0,
        })),
        ...prev,
      ]);
      inflight.current += seeded.length;
      let token: string;
      try {
        token = await getCsrfToken();
      } catch {
        onError("Could not start upload (auth).");
        seeded.forEach((s) => {
          updateTile(s.key, { status: "error", reason: "auth" });
          settle(s.key);
        });
        return;
      }

      const one = async (s: { key: string; file: File }) => {
        if (s.file.size > MULTIPART_THRESHOLD) {
          try {
            await uploadMultipart({
              galleryId,
              folderId,
              file: s.file,
              onProgress: (p) =>
                updateTile(s.key, { status: "uploading", progress: p }),
            });
            // Hand off to the real row (processing for images, ready otherwise).
            setTiles((prev) => prev.filter((t) => t.key !== s.key));
            refreshFiles();
          } catch (err) {
            updateTile(s.key, {
              status: "error",
              reason: err instanceof Error ? err.message : "failed",
            });
            onError("Upload failed");
          } finally {
            settle(s.key);
          }
        } else {
          await uploadOne(s.file, s.key, token, folderId);
        }
      };

      // Upload several files at once (each large file already runs its parts
      // concurrently, so cap files-in-flight to keep total connections sane).
      let i = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(FILE_CONCURRENCY, seeded.length) },
          async () => {
            while (i < seeded.length) await one(seeded[i++]!);
          },
        ),
      );
    },
    [galleryId, uploadOne, updateTile, settle, refreshFiles, onError],
  );

  return { tiles, upload };
}
