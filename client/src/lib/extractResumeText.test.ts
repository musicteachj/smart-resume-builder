import { describe, expect, it, vi } from "vitest";

import { extractResumeText } from "./extractResumeText";

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getTextContent: () =>
            Promise.resolve({ items: [{ str: "Maya Chen" }, { str: "Senior Product Designer" }] }),
        }),
    }),
  }),
}));
vi.mock("mammoth", () => ({
  default: { extractRawText: () => Promise.resolve({ value: "Short" }) },
}));

function file(name: string, type: string): File {
  const f = new File([new Uint8Array([1, 2, 3])], name, { type });
  // jsdom's File doesn't implement arrayBuffer(); stub it for the extractors.
  Object.defineProperty(f, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
  return f;
}

describe("extractResumeText", () => {
  it("extracts text from a PDF", async () => {
    const text = await extractResumeText(file("cv.pdf", "application/pdf"));
    expect(text).toContain("Maya Chen");
    expect(text).toContain("Senior Product Designer");
  });

  it("rejects an unsupported file type", async () => {
    await expect(extractResumeText(file("cv.png", "image/png"))).rejects.toThrow(/PDF or DOCX/);
  });

  it("rejects a near-empty extraction (likely scanned)", async () => {
    await expect(
      extractResumeText(
        file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      ),
    ).rejects.toThrow(/scanned|paste/i);
  });
});
