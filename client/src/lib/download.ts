/** Trigger a browser download of a Blob under the given filename. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sanitize a résumé title into a safe file basename (no extension). */
export function safeFileName(title: string): string {
  return title.replace(/[^\w\- ]+/g, "").trim() || "resume";
}
