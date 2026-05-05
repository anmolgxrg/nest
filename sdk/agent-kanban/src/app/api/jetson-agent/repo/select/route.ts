import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import { requireRole } from "@/lib/agents/server"
import type { JetsonSelectRepoResponse } from "@/lib/jetson-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    await requireRole(request, "operator")
    const cfg = loadJetsonAgentConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }
    const body = (await request.json()) as { path?: string }
    const path = body.path?.trim()
    if (!path) {
      return Response.json({ error: "Repo path is required" }, { status: 400 })
    }

    const result = await jetsonAgentRequest<JetsonSelectRepoResponse>(
      cfg,
      "/api/repo/select",
      {
        method: "POST",
        body: JSON.stringify({ path }),
      },
    )
    return Response.json(result)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}
