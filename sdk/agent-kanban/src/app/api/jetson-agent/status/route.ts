import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import { requireRole } from "@/lib/agents/server"
import type { JetsonStatusResponse } from "@/lib/jetson-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireRole(request, "viewer")
    const cfg = loadJetsonAgentConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }
    const status = await jetsonAgentRequest<JetsonStatusResponse>(
      cfg,
      "/api/status",
    )
    return Response.json(status)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}
