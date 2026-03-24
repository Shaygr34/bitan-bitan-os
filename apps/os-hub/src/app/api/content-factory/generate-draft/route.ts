import { NextRequest, NextResponse } from "next/server";
import { generateDraftFromRefs } from "@/lib/content-factory/draft-from-refs";

export const maxDuration = 300; // 5 min for streaming

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refUploadIds, topic, userNotes } = body;

    if (!Array.isArray(refUploadIds) || !refUploadIds.length) {
      return NextResponse.json({ error: "refUploadIds required" }, { status: 400 });
    }

    const result = await generateDraftFromRefs({ refUploadIds, topic, userNotes });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-draft] Error:", err);
    const message = err instanceof Error ? err.message : "Draft generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
