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

  // chaos's middleware redirects unauthenticated /api/* to /login (HTML),
  // which would arrive here as text/html and break JSON.parse on the client.
  // The same token chaos uses for telemetry ingest doubles as a server-to-
  // server read bypass — pass it through when it's set.
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.CHAOS_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers,
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
