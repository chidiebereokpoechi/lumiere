'use client';

// Downloads a newline-delimited .txt of original filenames — paste into a
// Lightroom filename filter, or feed any other editing app's import list.
export function ExportFilenames({ filenames, downloadName, label = 'Export .txt' }: {
  filenames: string[];
  downloadName: string;
  label?: string;
}) {
  function download() {
    if (filenames.length === 0) return;
    const blob = new Blob([filenames.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName.replace(/[^\w.-]+/g, '_') + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={filenames.length === 0}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-bold uppercase tracking-wider font-[family-name:'Ika_Compact'] text-ink-strong hover:bg-surface-2 hover:border-border-strong transition-colors disabled:opacity-40"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  );
}
