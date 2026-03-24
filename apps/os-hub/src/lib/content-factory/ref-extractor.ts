/**
 * Extract readable text from uploaded reference files (PDF, DOCX).
 * Used to build Claude context for article draft generation.
 */


export interface ExtractedRef {
  filename: string;
  text: string;
  charCount: number;
}

/**
 * Extract readable text from a PDF buffer.
 */
export async function extractPdfText(buffer: Buffer, filename: string): Promise<ExtractedRef> {
  let pdfModule;
  try {
    pdfModule = await import("pdf-parse");
  } catch (err) {
    throw new Error(`Failed to load pdf-parse module. Ensure it is installed: ${(err as Error).message}`);
  }
  // pdf-parse v1: handle CJS/ESM interop
  const pdfFn = typeof pdfModule === "function"
    ? pdfModule
    : (pdfModule as any).default || pdfModule; // eslint-disable-line
  const data = await pdfFn(buffer);
  const text = data.text.trim();
  return { filename, text, charCount: text.length };
}

/**
 * Extract readable text from a DOCX buffer.
 */
export async function extractDocxText(buffer: Buffer, filename: string): Promise<ExtractedRef> {
  let mammoth;
  try {
    mammoth = await import("mammoth");
  } catch (err) {
    throw new Error(`Failed to load mammoth module. Ensure it is installed: ${(err as Error).message}`);
  }
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  return { filename, text, charCount: text.length };
}

/**
 * Route extraction based on MIME type / file extension.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ExtractedRef> {
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    return extractPdfText(buffer, filename);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    return extractDocxText(buffer, filename);
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Truncate extracted text to fit within Claude context budget.
 * Reserve ~80K chars for reference content (roughly 20K tokens).
 */
export function truncateForContext(refs: ExtractedRef[], maxChars = 80000): string {
  const combined = refs.map((r) => `=== ${r.filename} ===\n${r.text}`).join("\n\n---\n\n");
  if (combined.length <= maxChars) return combined;
  return combined.slice(0, maxChars) + "\n\n[... תוכן נוסף קוצר עקב אורך]";
}
