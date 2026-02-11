/**
 * GET /api/content-engine/history/[id]/download
 *
 * Downloads the PDF for a given conversion record.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRecord, getPdfBuffer } from "@/lib/content-engine/history";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const record = getRecord(id);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found" },
      { status: 404 }
    );
  }

  const pdf = getPdfBuffer(id);
  if (!pdf) {
    return NextResponse.json(
      { error: "PDF file not found" },
      { status: 404 }
    );
  }

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(record.pdfName)}"`,
    },
  });
}
