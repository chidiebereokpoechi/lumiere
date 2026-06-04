"use client";

import { useMemo, useState } from "react";
import { Copy, Download } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

type CaseMode = "normal" | "upper" | "lower";
type Delim = "newline" | "comma" | "space" | "custom";

const CASES: { value: CaseMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "upper", label: "UPPERCASE" },
  { value: "lower", label: "lowercase" },
];

const DELIMS: { value: Delim; label: string }[] = [
  { value: "newline", label: "Return" },
  { value: "comma", label: "Comma" },
  { value: "space", label: "Space" },
  { value: "custom", label: "Custom" },
];

// Export the original filenames (paste into a Lightroom filter, a CSV, etc.) -
// opens a widget to pick the name style (case, extension) and delivery (download
// a .txt or copy to the clipboard).
export function ExportFilenames({
  filenames,
  downloadName,
  label = "Export",
}: {
  filenames: string[];
  downloadName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [caseMode, setCaseMode] = useState<CaseMode>("normal");
  const [withExt, setWithExt] = useState(true);
  const [delim, setDelim] = useState<Delim>("newline");
  const [custom, setCustom] = useState(", ");

  const transformed = useMemo(
    () =>
      filenames.map((n) => {
        let s = withExt ? n : n.replace(/\.[^./\\]+$/, "");
        if (caseMode === "upper") s = s.toUpperCase();
        else if (caseMode === "lower") s = s.toLowerCase();
        return s;
      }),
    [filenames, withExt, caseMode],
  );

  const sep =
    delim === "newline"
      ? "\n"
      : delim === "comma"
        ? ", "
        : delim === "space"
          ? " "
          : custom;
  const output = transformed.join(sep);

  function download() {
    const blob = new Blob([output], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName.replace(/[^\w.-]+/g, "_") + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${transformed.length} filename${transformed.length !== 1 ? "s" : ""}`,
    );
    setOpen(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      toast.success(
        `Copied ${transformed.length} filename${transformed.length !== 1 ? "s" : ""} to clipboard`,
      );
      setOpen(false);
    } catch {
      toast.error("Clipboard blocked - download instead");
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={filenames.length === 0}
        className="gap-1.5 px-3 py-1.5 text-xs tracking-wider"
      >
        <Download size={16} />
        {label}
      </Button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          className="w-[min(92vw,28rem)]"
          labelledBy="export-title"
        >
          <h2
            id="export-title"
            className="text-xs font-extrabold tracking-wider text-ink-muted"
          >
            Export filenames
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted tabular-nums">
            {filenames.length} item{filenames.length !== 1 ? "s" : ""}
          </p>

          <div className="mt-4 space-y-4">
            <Segmented
              label="Case"
              value={caseMode}
              options={CASES}
              onChange={setCaseMode}
            />
            <Segmented
              label="Extension"
              value={withExt ? "with" : "without"}
              options={[
                { value: "with", label: "With .ext" },
                { value: "without", label: "Without" },
              ]}
              onChange={(v) => setWithExt(v === "with")}
            />
            <div>
              <Segmented
                label="Delimiter"
                value={delim}
                options={DELIMS}
                onChange={setDelim}
              />
              {delim === "custom" && (
                <TextInput
                  value={custom}
                  onChange={setCustom}
                  placeholder="e.g. ; or |"
                  className="mt-2"
                />
              )}
            </div>

            {/* Live preview of the first few transformed names, joined. */}
            <div>
              <p className="mb-1 text-xs font-extrabold tracking-wider text-ink-muted">
                Preview
              </p>
              <div className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface-sunken p-3 text-xs text-ink-strong tabular-nums">
                {transformed.slice(0, 8).join(sep)}
                {transformed.length > 8 && (
                  <span className="text-ink-muted">
                    {sep}+{transformed.length - 8} more
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={copy}
              className="gap-1.5 tracking-wider"
            >
              <Copy size={16} />
              Copy
            </Button>
            <Button onClick={download} className="gap-1.5 tracking-wider">
              <Download size={16} />
              Download
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-extrabold tracking-wider text-ink-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
              value === o.value
                ? "bg-surface-strong text-ink-inverse border-surface-strong"
                : "bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
