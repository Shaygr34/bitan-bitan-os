import { NextResponse } from "next/server";
import { BASE_URL } from "../../../../../proxy";

/** GET /api/sumit-sync/runs/[id]/files/[fileId]/download → Python download */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; fileId: string } }
) {
  const { id, fileId } = params;
  const url = `${BASE_URL}/runs/${id}/files/${fileId}/download`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || `Download failed: ${res.status}` },
        { status: res.status }
      );
    }

    // Stream the file through, forwarding content headers
    const headers = new Headers();
    const cd = res.headers.get("content-disposition");
    if (cd) headers.set("content-disposition", cd);
    const ct = res.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    const cl = res.headers.get("content-length");
    if (cl) headers.set("content-length", cl);

    return new Response(res.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: "Sumit Sync service unreachable", detail: String(err) },
      { status: 502 }
    );
  }
}
