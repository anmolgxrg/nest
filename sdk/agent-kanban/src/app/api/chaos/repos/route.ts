import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/agents/server";

const CHAOS_BASE = (
  process.env.CHAOS_BASE_URL ?? "https://chaos.reasoning.company"
).replace(/\/+$/, "");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "viewer");
    return forwardChaos("GET");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 403 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, "admin");
    const body = await req.text();
    return forwardChaos("POST", body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 403 },
    );
  }
}

async function forwardChaos(method: "GET" | "POST", body?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (method === "POST") headers["Content-Type"] = "application/json";
  const token = process.env.CHAOS_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(`${CHAOS_BASE}/api/repos`, {
      method,
      cache: "no-store",
      headers,
      body,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
