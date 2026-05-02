import type { NextRequest } from "next/server";
import { proxyChaos } from "../../_proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyChaos(req, `/api/claude-sessions/${encodeURIComponent(id)}`);
}
