import { readdirSync, existsSync } from "fs";

export function GET() {
  const topLevel = (() => {
    try {
      return readdirSync("/app");
    } catch {
      return ["(unable to read /app)"];
    }
  })();

  return Response.json({
    cwd: process.cwd(),
    serverJsExists: {
      "/app/server.js": existsSync("/app/server.js"),
      "/app/apps/os-hub/server.js": existsSync("/app/apps/os-hub/server.js"),
    },
    appTopLevel: topLevel,
    env: {
      PORT: process.env.PORT ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
    },
  });
}
