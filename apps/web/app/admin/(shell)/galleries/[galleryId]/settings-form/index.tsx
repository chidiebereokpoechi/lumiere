"use client";

import type { GalleryDetail } from "@/lib/api/galleries";
import type { WatermarkPreset } from "@/lib/api/watermarks";
import { useGallerySettings } from "@/hooks/use-gallery-settings";
import {
  Field,
  TextInput,
  Textarea,
  Select,
  Toggle,
  Button,
  FormError,
} from "@/components/admin/form";
import { DateField } from "@/components/ui/date-field";
import { Section, SaveStatus } from "./parts";

interface Props {
  gallery: GalleryDetail;
  watermarks: WatermarkPreset[];
}

export function SettingsForm({ gallery, watermarks }: Props) {
  const {
    saveState,
    error,
    fields,
    setters,
    password,
    flushNow,
    immediate,
    applyPassword,
    onDelete,
    broadcastStatus,
  } = useGallerySettings(gallery);
  const { passwordEdit, setPasswordEdit, newPassword, setNewPassword } =
    password;

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <Section title="Basics">
        <Field id="title" label="Title" required>
          <TextInput
            id="title"
            required
            value={fields.title}
            onChange={setters.setTitle}
            onBlur={flushNow}
          />
        </Field>
        <Field id="subtitle" label="Subtitle" hint="optional">
          <Textarea
            id="subtitle"
            rows={2}
            value={fields.subtitle}
            onChange={setters.setSubtitle}
            onBlur={flushNow}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="status" label="Status">
            <Select
              id="status"
              value={fields.status}
              onChange={immediate((v) => {
                setters.setStatus(v);
                broadcastStatus(gallery.id, v);
              })}
              options={[
                { value: "active", label: "Active" },
                { value: "draft", label: "Draft" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </Field>
          <Field id="layout" label="Layout">
            <Select
              id="layout"
              value={fields.layout}
              onChange={immediate(setters.setLayout)}
              options={[
                { value: "grid", label: "Grid" },
                { value: "masonry", label: "Masonry" },
                { value: "slideshow", label: "Slideshow" },
              ]}
            />
          </Field>
        </div>
        <Field
          id="navStyle"
          label="Navigation"
          hint="how clients move between sets"
        >
          <Select
            id="navStyle"
            value={fields.navStyle}
            onChange={immediate(setters.setNavStyle)}
            options={[
              { value: "tabs", label: "Tabs — one row of collection tabs" },
              {
                value: "collections",
                label: "Collections — albums grid you drill into",
              },
            ]}
          />
        </Field>
      </Section>

      <Section title="Client">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="clientName" label="Client name">
            <TextInput
              id="clientName"
              value={fields.clientName}
              onChange={setters.setClientName}
              onBlur={flushNow}
            />
          </Field>
          <Field id="clientEmail" label="Client email">
            <TextInput
              id="clientEmail"
              type="email"
              value={fields.clientEmail}
              onChange={setters.setClientEmail}
              onBlur={flushNow}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="eventDate" label="Event date">
            <DateField
              id="eventDate"
              value={fields.eventDate}
              onChange={immediate(setters.setEventDate)}
              placeholder="No date"
            />
          </Field>
          <Field id="eventType" label="Event type">
            <TextInput
              id="eventType"
              value={fields.eventType}
              onChange={setters.setEventType}
              onBlur={flushNow}
              placeholder="Wedding"
            />
          </Field>
        </div>
      </Section>

      <Section title="Access">
        <Field
          id="password"
          label="Password"
          hint={gallery.passwordHash ? "currently set" : "currently unset"}
        >
          {passwordEdit ? (
            <div className="space-y-2">
              <TextInput
                id="password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="leave blank to remove the password"
              />
              <div className="flex items-center gap-3">
                <Button type="button" onClick={applyPassword}>
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPasswordEdit(false);
                    setNewPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPasswordEdit(true)}
            >
              {gallery.passwordHash ? "Change password" : "Set password"}
            </Button>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="expiresAt" label="Expires on" hint="optional">
            <DateField
              id="expiresAt"
              value={fields.expiresAt}
              onChange={immediate(setters.setExpiresAt)}
              placeholder="Never"
            />
          </Field>
          <Field
            id="gracePeriodDays"
            label="Grace period (days)"
            hint="after expiry"
          >
            <TextInput
              id="gracePeriodDays"
              value={fields.gracePeriodDays}
              onChange={setters.setGracePeriodDays}
              onBlur={flushNow}
              placeholder="0"
            />
          </Field>
        </div>
      </Section>

      <Section title="Permissions">
        <Toggle
          id="allowFavorites"
          checked={fields.allowFavorites}
          onChange={immediate(setters.setAllowFavorites)}
          label="Favorites"
          description="Clients can mark photos as favorites."
        />
        <Toggle
          id="allowComments"
          checked={fields.allowComments}
          onChange={immediate(setters.setAllowComments)}
          label="Comments"
          description="Clients can leave comments (with moderation)."
        />
        <Toggle
          id="allowDownload"
          checked={fields.allowDownload}
          onChange={immediate(setters.setAllowDownload)}
          label="Downloads"
          description="Clients can download photos and gallery ZIPs."
        />
        <Toggle
          id="notifyOnView"
          checked={fields.notifyOnView}
          onChange={immediate(setters.setNotifyOnView)}
          label="Notify on view"
          description="Email you the first time the gallery is opened (rate-limited to once every 4h)."
        />
      </Section>

      <Section title="Delivery">
        <Field id="downloadMode" label="Download mode">
          <Select
            id="downloadMode"
            value={fields.downloadMode}
            onChange={immediate(setters.setDownloadMode)}
            options={[
              {
                value: "watermarked",
                label: "Watermarked (preview-quality with logo)",
              },
              { value: "full", label: "Full resolution" },
              {
                value: "selected",
                label: "Selected favorites get full, rest watermarked",
              },
              { value: "none", label: "Disabled" },
            ]}
          />
        </Field>
        <Field
          id="watermarkPresetId"
          label="Watermark"
          hint={
            watermarks.length === 0
              ? "none created yet"
              : "applied to image previews"
          }
        >
          <Select
            id="watermarkPresetId"
            value={fields.watermarkPresetId}
            onChange={immediate(setters.setWatermarkPresetId)}
            options={[
              {
                value: "",
                label:
                  watermarks.length === 0
                    ? "No watermarks — create one first"
                    : "None",
              },
              ...watermarks.map((w) => ({
                value: w.id,
                label: `${w.name} (${w.type})`,
              })),
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-subtle">
            Changing this reprocesses existing photos; clearing it removes the
            watermarked copies.
          </p>
        </Field>
      </Section>

      <Section title="Advanced">
        <Field
          id="customCss"
          label="Custom CSS"
          hint="scoped to the gallery container; sanitised"
        >
          <Textarea
            id="customCss"
            rows={4}
            value={fields.customCss}
            onChange={setters.setCustomCss}
            onBlur={flushNow}
            placeholder=".gallery-hero { letter-spacing: 0.5em; }"
          />
        </Field>
      </Section>

      <FormError message={error} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="danger" onClick={onDelete}>
          Delete gallery
        </Button>
        <SaveStatus state={saveState} />
      </div>
    </form>
  );
}
