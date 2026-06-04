"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";

// Email gate. Shown the first time a client favorites or touches a list.
export function EmailModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (email: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError("Enter a valid email.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(value.trim());
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save"));
      setPending(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="email-modal-title"
      className="w-[min(92vw,28rem)]"
    >
      <form onSubmit={submit}>
        <h2
          id="email-modal-title"
          className="text-xs font-extrabold tracking-wider text-ink-muted"
        >
          Your email
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Enter your email to favorite items and build lists. The creator will
          see your selections.
        </p>
        <TextInput
          type="email"
          autoFocus
          value={value}
          onChange={setValue}
          placeholder="you@example.com"
          className="mt-4"
        />
        {error && (
          <p className="mt-2 text-sm font-semibold text-negative">{error}</p>
        )}
        <div className="mt-5 flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="tracking-wider"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="tracking-wider">
            {pending ? "Saving" : "Continue"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
