import { jsonError } from "@/lib/agents/http"
import {
  listArtifactsForAgent,
  requireCursorApiKey,
  requireSession,
} from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await requireSession(request)
    const apiKey = requireCursorApiKey(session)
    const { agentId } = await params
    return Response.json({
      artifacts: await listArtifactsForAgent(apiKey, agentId),
    })
  } catch (error) {
    return jsonError(error, "Failed to list agent artifacts.")
  }
}
