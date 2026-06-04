"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";

// Imperative, promise-based replacements for window.confirm / window.prompt /
// window.alert, rendered through a single mounted <DialogHost/>. Call sites just
// `await confirmDialog(...)` / `await promptDialog(...)`.

type ConfirmReq = {
  kind: "confirm";
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};
type PromptReq = {
  kind: "prompt";
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
};
type AlertReq = {
  kind: "alert";
  title: string;
  message?: string;
  resolve: () => void;
};
type Req = ConfirmReq | PromptReq | AlertReq;

let push: ((r: Req) => void) | null = null;

export function confirmDialog(
  opts: Omit<ConfirmReq, "kind" | "resolve">,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (push) push({ ...opts, kind: "confirm", resolve });
    else resolve(false);
  });
}
export function promptDialog(
  opts: Omit<PromptReq, "kind" | "resolve">,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (push) push({ ...opts, kind: "prompt", resolve });
    else resolve(null);
  });
}
export function alertDialog(
  opts: Omit<AlertReq, "kind" | "resolve">,
): Promise<void> {
  return new Promise((resolve) => {
    if (push) push({ ...opts, kind: "alert", resolve });
    else resolve();
  });
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    push = (r) => {
      if (r.kind === "prompt") setText(r.defaultValue ?? "");
      setReq(r);
    };
    return () => {
      push = null;
    };
  }, []);

  if (!req) return null;

  const close = (result: unknown) => {
    (req.resolve as (v: unknown) => void)(result);
    setReq(null);
  };
  const onCancel = () =>
    close(
      req.kind === "prompt" ? null : req.kind === "confirm" ? false : undefined,
    );
  const onConfirm = () =>
    close(
      req.kind === "prompt"
        ? text.trim()
        : req.kind === "confirm"
          ? true
          : undefined,
    );
  const danger = req.kind === "confirm" && req.danger;

  return (
    <div
      className="fixed inset-0 z-100 bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-[min(92vw,28rem)] rounded-lg border border-border bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xs font-extrabold tracking-wider text-ink-muted">
          {req.title}
        </h2>
        {req.message && (
          <p className="mt-1.5 text-sm text-ink-muted">{req.message}</p>
        )}

        {req.kind === "prompt" && (
          <>
            {req.label && (
              <label className="block mt-4 mb-2 text-xs font-bold tracking-wider text-ink-muted">
                {req.label}
              </label>
            )}
            <TextInput
              autoFocus
              value={text}
              onChange={setText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) onConfirm();
              }}
              placeholder={req.placeholder}
              className={req.label ? undefined : "mt-4"}
            />
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-4">
          {req.kind !== "alert" && (
            <Button
              variant="secondary"
              onClick={onCancel}
              className="tracking-wider"
            >
              {req.kind === "confirm"
                ? (req.cancelLabel ?? "Cancel")
                : "Cancel"}
            </Button>
          )}
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={req.kind === "prompt" && !text.trim()}
            className="tracking-wider"
          >
            {req.kind === "confirm"
              ? (req.confirmLabel ?? "Confirm")
              : req.kind === "prompt"
                ? (req.confirmLabel ?? "Save")
                : "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}
