"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClientMutation, apiErrorMessage } from "@/lib/api-client";
import type { CurrentPhotographer } from "@/lib/api/galleries";
import { toast } from "@/lib/toast";
import { Field, TextInput, Button, FormError } from "@/components/admin/form";

// Bound to the authenticated creator's row. Empty strings clear the field.
export function SettingsForm({ initial }: { initial: CurrentPhotographer }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [brandName, setBrandName] = useState(initial.brandName ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [instagram, setInstagram] = useState(initial.instagram ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save is offered only when something actually changed (see CLAUDE.md).
  const dirty =
    name !== initial.name ||
    brandName !== (initial.brandName ?? "") ||
    website !== (initial.website ?? "") ||
    instagram !== (initial.instagram ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setPending(true);
    try {
      await apiClientMutation("/api/auth/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brandName,
          website,
          instagram,
        }),
      });
      toast.success("Profile updated");
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn’t save profile"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4" noValidate>
      <section className="rounded-xl bg-surface border border-border p-4 space-y-4">
        <h2 className="text-xs font-extrabold tracking-wider text-ink-muted">
          Profile
        </h2>

        <Field
          id="email"
          label="Email"
          hint="used to sign in and as the contact address on client galleries"
        >
          <TextInput
            id="email"
            value={initial.email}
            onChange={() => {}}
            disabled
          />
        </Field>

        <Field id="name" label="Name" required>
          <TextInput
            id="name"
            value={name}
            onChange={setName}
            placeholder="your name"
          />
        </Field>

        <Field
          id="brandName"
          label="Brand name"
          hint="shown to clients instead of your name when set"
        >
          <TextInput
            id="brandName"
            value={brandName}
            onChange={setBrandName}
            placeholder="Studio name"
          />
        </Field>

        <Field
          id="website"
          label="Website"
          hint="public URL - shown as a link on every gallery landing"
        >
          <TextInput
            id="website"
            value={website}
            onChange={setWebsite}
            placeholder="https://yourstudio.com"
          />
        </Field>

        <Field
          id="instagram"
          label="Instagram"
          hint="handle, with or without the @"
        >
          <TextInput
            id="instagram"
            value={instagram}
            onChange={setInstagram}
            placeholder="yourhandle"
          />
        </Field>
      </section>

      <FormError message={error} />

      <div className="flex items-center justify-end gap-4">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
