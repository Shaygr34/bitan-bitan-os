import { NextRequest, NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";

/**
 * GET /api/settings?group=integrations
 * Returns all settings, optionally filtered by group.
 */
export async function GET(req: NextRequest) {
  try {
    const group = req.nextUrl.searchParams.get("group");
    const where = group ? { group } : {};
    const settings = await withRetry(() =>
      prisma.setting.findMany({ where, orderBy: { key: "asc" } }),
    );
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return NextResponse.json(map);
  } catch (err) {
    console.error("[Settings] GET error:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

/**
 * PUT /api/settings
 * Body: { key: string, value: string, label?: string, group?: string }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { key, value, label, group } = body;
    if (!key || typeof value !== "string") {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
    }
    const setting = await withRetry(() =>
      prisma.setting.upsert({
        where: { key },
        update: { value, ...(label ? { label } : {}), ...(group ? { group } : {}) },
        create: { key, value, label: label ?? key, group: group ?? "integrations" },
      }),
    );
    return NextResponse.json(setting);
  } catch (err) {
    console.error("[Settings] PUT error:", err);
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 });
  }
}
