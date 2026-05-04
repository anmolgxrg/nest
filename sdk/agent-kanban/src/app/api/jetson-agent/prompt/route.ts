import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import type { JetsonPromptResponse } from "@/lib/jetson-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const cfg = loadJetsonAgentConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }

  try {
    const body = (await request.json()) as { prompt?: string }
    const prompt = body.prompt?.trim()
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 })
    }

    const result = await jetsonAgentRequest<JetsonPromptResponse>(
      cfg,
      "/api/prompt",
      {
        method: "POST",
        body: JSON.stringify({ prompt }),
      },
    )
    return Response.json(result)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}
