"use client";

import { useState } from "react";
import {
  apiClientMutation,
  apiErrorMessage,
} from "@/lib/api-client";
import type { AdminRow } from "@/lib/api/admins";
import type { CurrentPhotographer } from "@/lib/api/galleries";
import { Field, TextInput, Button, FormError } from "@/components/admin/form";
import { confirmDialog } from "@/components/ui/dialog";
import { Trash } from "@/components/ui/icons";
import { toast } from "@/lib/toast";

// Lists every photographer, lets the signed-in admin invite another or remove
// one. Self-delete and last-admin delete are both blocked server-side; the UI
// hides the trash button for `me` so it's obvious.
export function AdminsManager({
  me,
  initial,
}: {
  me: CurrentPhotographer;
  initial: AdminRow[];
}) {
  const [admins, setAdmins] = useState<AdminRow[]>(initial);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setPending(true);
    try {
      const created = await apiClientMutation<AdminRow>("/api/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });
      setAdmins((prev) =>
        [...prev, created].sort((a, b) => a.createdAt - b.createdAt),
      );
      setEmail("");
      setName("");
      setPassword("");
      toast.success(`Invited ${created.email}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn’t invite admin"));
    } finally {
      setPending(false);
    }
  }

  async function remove(row: AdminRow) {
    const ok = await confirmDialog({
      title: `Remove ${row.email}?`,
      message:
        "Their account, all galleries they own, and all media in those galleries will be permanently deleted. This cannot be undone.",
      confirmLabel: "Remove admin",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await apiClientMutation<{
        ok: true;
        galleriesRemoved: number;
      }>(`/api/admins/${row.id}`, { method: "DELETE" });
      setAdmins((prev) => prev.filter((a) => a.id !== row.id));
      toast.success(
        res.galleriesRemoved > 0
          ? `Removed ${row.email} and ${res.galleriesRemoved} ${res.galleriesRemoved === 1 ? "gallery" : "galleries"}`
          : `Removed ${row.email}`,
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn’t remove admin"));
    }
  }

  return (
    <section className="rounded-xl bg-surface border border-border p-4 space-y-6">
      <div>
        <h2 className="text-xs font-extrabold tracking-wider text-ink-muted">
          Admins
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Each admin sees only their own galleries. Adding one here just
          creates their account — share the email and password with them
          directly.
        </p>
      </div>

      <ul className="divide-y divide-border border border-border rounded-md">
        {admins.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-strong truncate">
                {a.name}
                {a.id === me.id && (
                  <span className="ml-2 text-xs font-bold tracking-wider text-ink-subtle">
                    you
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-muted truncate">{a.email}</p>
            </div>
            {a.id !== me.id && (
              <button
                type="button"
                onClick={() => remove(a)}
                aria-label={`Remove ${a.email}`}
                className="shrink-0 text-ink-muted hover:text-negative transition-colors"
              >
                <Trash size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={invite} className="space-y-4 pt-2" noValidate>
        <h3 className="text-xs font-extrabold tracking-wider text-ink-muted">
          Invite admin
        </h3>
        <Field id="admin-email" label="Email" required>
          <TextInput
            id="admin-email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="them@studio.com"
            autoComplete="off"
          />
        </Field>
        <Field id="admin-name" label="Name" hint="Optional — defaults to the email handle">
          <TextInput
            id="admin-name"
            value={name}
            onChange={setName}
            placeholder="Their name"
          />
        </Field>
        <Field
          id="admin-password"
          label="Password"
          required
          hint="Share with them directly, then they can change it after signing in"
        >
          <TextInput
            id="admin-password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 12 characters"
            autoComplete="new-password"
          />
        </Field>
        <FormError message={error} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Inviting…" : "Add admin"}
          </Button>
        </div>
      </form>
    </section>
  );
}
