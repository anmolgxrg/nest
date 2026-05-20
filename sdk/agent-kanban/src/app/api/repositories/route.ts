import { jsonError } from "@/lib/agents/http"
import { listRepositories, requireRole } from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, "viewer")
    const apiKey = session.apiKey?.trim()
    return Response.json({
      repositories: apiKey ? await listRepositories(apiKey) : [],
    })
  } catch (error) {
    return jsonError(error, "Failed to list repositories.")
  }
}
