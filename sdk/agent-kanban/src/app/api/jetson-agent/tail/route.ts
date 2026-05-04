import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import type { JetsonTailResponse } from "@/lib/jetson-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const cfg = loadJetsonAgentConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }

  try {
    const incoming = new URL(request.url)
    const query = new URLSearchParams()
    const lines = incoming.searchParams.get("lines")
    if (lines) {
      query.set("lines", lines)
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    const tail = await jetsonAgentRequest<JetsonTailResponse>(
      cfg,
      `/api/tail${suffix}`,
    )
    return Response.json(tail)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}
