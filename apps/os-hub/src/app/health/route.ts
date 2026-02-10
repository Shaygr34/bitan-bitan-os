const startedAt = Date.now();

export function GET() {
  return Response.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    port: process.env.PORT ?? "unknown",
  });
}
