"use client";

import { useEffect, useState } from "react";

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
  return new Promise(
    (resolve) =>
      push?.({ ...opts, kind: "confirm", resolve }) ?? resolve(false),
  );
}
export function promptDialog(
  opts: Omit<PromptReq, "kind" | "resolve">,
): Promise<string | null> {
  return new Promise(
    (resolve) => push?.({ ...opts, kind: "prompt", resolve }) ?? resolve(null),
  );
}
export function alertDialog(
  opts: Omit<AlertReq, "kind" | "resolve">,
): Promise<void> {
  return new Promise(
    (resolve) => push?.({ ...opts, kind: "alert", resolve }) ?? resolve(),
  );
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
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">
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
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) onConfirm();
              }}
              placeholder={req.placeholder}
              className={`w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors ${req.label ? "" : "mt-4"}`}
            />
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          {req.kind !== "alert" && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
            >
              {req.kind === "confirm"
                ? (req.cancelLabel ?? "Cancel")
                : "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={req.kind === "prompt" && !text.trim()}
            className={`inline-flex items-center rounded-md border px-4 py-2.5 text-sm font-bold tracking-wider transition-colors disabled:opacity-50 ${
              danger
                ? "bg-negative border-negative text-white hover:opacity-90"
                : "bg-accent border-accent text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white"
            }`}
          >
            {req.kind === "confirm"
              ? (req.confirmLabel ?? "Confirm")
              : req.kind === "prompt"
                ? (req.confirmLabel ?? "Save")
                : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
