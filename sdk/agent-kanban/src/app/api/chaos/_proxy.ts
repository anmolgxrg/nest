import { NextRequest, NextResponse } from "next/server";

const CHAOS_BASE = (
  process.env.CHAOS_BASE_URL ?? "https://chaos.reasoning.company"
).replace(/\/+$/, "");

export async function proxyChaos(
  req: NextRequest,
  upstreamPath: string,
): Promise<NextResponse> {
  const incoming = new URL(req.url);
  const upstream = new URL(CHAOS_BASE + upstreamPath);
  incoming.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  try {
    const resp = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await resp.text();
    const ct = resp.headers.get("content-type") ?? "application/json";
    return new NextResponse(body, {
      status: resp.status,
      headers: { "content-type": ct },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
