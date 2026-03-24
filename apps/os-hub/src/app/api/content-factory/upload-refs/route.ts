import { NextRequest, NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { extractText } from "@/lib/content-factory/ref-extractor";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds 20MB limit` },
          { status: 400 },
        );
      }

      // Validate file type
      const isAllowed =
        ALLOWED_TYPES.includes(file.type) || /\.(pdf|docx)$/i.test(file.name);
      if (!isAllowed) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name} (${file.type})` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractText(buffer, file.name, file.type);

      if (!extracted.text.trim()) {
        return NextResponse.json(
          { error: "No readable text extracted from file" },
          { status: 400 },
        );
      }

      const record = await withRetry(() =>
        prisma.refUpload.create({
          data: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            textContent: extracted.text,
          },
        }),
      );

      results.push({
        id: record.id,
        filename: file.name,
        charCount: extracted.charCount,
        preview: extracted.text.slice(0, 200) + (extracted.text.length > 200 ? "..." : ""),
      });
    }

    return NextResponse.json({ uploads: results });
  } catch (err) {
    console.error("[upload-refs] Error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
