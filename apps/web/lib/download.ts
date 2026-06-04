// Trigger a browser download by clicking a transient anchor. Used wherever we
// need the browser's native "save file" behavior (Content-Disposition driven)
// rather than navigating the page - single files, ZIP scopes, attachments.
export function downloadViaAnchor(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
