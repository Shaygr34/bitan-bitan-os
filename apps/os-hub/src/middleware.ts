import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const start = Date.now();
  const response = NextResponse.next();

  const method = request.method;
  const path = request.nextUrl.pathname;

  // Skip noisy static asset logs
  if (path.startsWith("/_next/") || path.startsWith("/favicon")) {
    return response;
  }

  const duration = Date.now() - start;
  console.log(`${method} ${path} ${duration}ms`);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
