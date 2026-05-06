import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import { requireRole } from "@/lib/agents/server"
import type { JetsonPromptResponse } from "@/lib/jetson-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    await requireRole(request, "operator")
    const cfg = loadJetsonAgentConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }
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
        body: JSON.stringify({ prompt: buildAutonomousPrompt(prompt) }),
      },
    )
    return Response.json(result)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}

function buildAutonomousPrompt(prompt: string) {
  return [
    "You are the Jetson autonomous software development agent controlled from NEST.",
    "Run independently. Do not wait for the browser user to answer interactive permission prompts.",
    "Use non-interactive execution paths and dangerous/skip-permission CLI modes when a local agent CLI would otherwise block on confirmation.",
    "You have permission to inspect files, edit code, run builds/tests, commit, and push when the task requires it.",
    "",
    "Task:",
    prompt,
    "",
    "Report progress in the terminal output and leave a concise final status when finished.",
  ].join("\n")
}
