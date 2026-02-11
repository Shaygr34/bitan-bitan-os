import { NextResponse } from "next/server";
import { proxyGet, proxyDelete, BASE_URL } from "../../proxy";

/** GET /api/sumit-sync/runs/[id] → Python GET /runs/{id} */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const res = await proxyGet(`/runs/${id}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "שירות Sumit Sync לא זמין",
        target: `${BASE_URL}/runs/${id}`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}

/** DELETE /api/sumit-sync/runs/[id] → Python DELETE /runs/{id} */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const res = await proxyDelete(`/runs/${id}`);
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "שירות Sumit Sync לא זמין",
        target: `${BASE_URL}/runs/${id}`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}
