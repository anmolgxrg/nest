import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import type { JetsonCloneRepoResponse } from "@/lib/jetson-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const cfg = loadJetsonAgentConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }

  try {
    const body = (await request.json()) as { url?: string; name?: string }
    const url = body.url?.trim()
    const name = body.name?.trim()
    if (!url) {
      return Response.json({ error: "Repo URL is required" }, { status: 400 })
    }

    const result = await jetsonAgentRequest<JetsonCloneRepoResponse>(
      cfg,
      "/api/repo/clone",
      {
        method: "POST",
        body: JSON.stringify({ url, name }),
      },
    )
    return Response.json(result)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}
