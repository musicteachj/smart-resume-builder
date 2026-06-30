const MIN_CHARS = 30;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isDocx(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

/**
 * Extract plain text from a PDF or DOCX file in the browser. PDF via pdf.js, DOCX via
 * mammoth (both lazy-loaded). The file never leaves the client; only the returned text
 * is sent on. Generic over document kind — used for both résumé import and JD tailoring.
 */
export async function extractFileText(file: File): Promise<string> {
  let text: string;
  if (isPdf(file)) text = await extractPdf(file);
  else if (isDocx(file)) text = await extractDocx(file);
  else throw new Error("Unsupported file type — upload a PDF or DOCX, or paste text instead.");

  text = text.trim();
  if (text.length < MIN_CHARS) {
    throw new Error("Couldn't read text from this file. If it's a scanned image, paste the text instead.");
  }
  return text;
}
