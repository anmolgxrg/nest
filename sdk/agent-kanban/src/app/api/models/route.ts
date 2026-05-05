import { jsonError } from "@/lib/agents/http"
import { listModels, requireRole } from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, "viewer")
    return Response.json({ models: await listModels(session.apiKey) })
  } catch (error) {
    return jsonError(error, "Failed to list models.")
  }
}
