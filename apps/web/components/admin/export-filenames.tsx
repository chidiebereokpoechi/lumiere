"use client";

import { Download } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Downloads a newline-delimited .txt of original filenames — paste into a
// Lightroom filename filter, or feed any other editing app's import list.
export function ExportFilenames({
  filenames,
  downloadName,
  label = "Export .txt",
}: {
  filenames: string[];
  downloadName: string;
  label?: string;
}) {
  function download() {
    if (filenames.length === 0) return;
    const blob = new Blob([filenames.join("\n") + "\n"], {
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
  }

  return (
    <Button
      variant="secondary"
      onClick={download}
      disabled={filenames.length === 0}
      className="gap-1.5 px-3 py-1.5 text-xs tracking-wider"
    >
      <Download size={16} />
      {label}
    </Button>
  );
}
