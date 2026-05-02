import type { NextRequest } from "next/server";
import { proxyChaos } from "../_proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return proxyChaos(req, "/api/claude-sessions");
}
