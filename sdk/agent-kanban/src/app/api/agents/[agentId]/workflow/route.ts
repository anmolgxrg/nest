import { jsonError } from "@/lib/agents/http"
import { requireSession } from "@/lib/agents/server"
import { fetchWorkflowStatus } from "@/lib/github/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireSession(request)
    const url = new URL(request.url)
    const prUrl = url.searchParams.get("prUrl")
    const repoUrl = url.searchParams.get("repoUrl")
    const branch = url.searchParams.get("branch")

    if (!prUrl && !(repoUrl && branch)) {
      return Response.json(
        { error: "missing query: provide prUrl OR (repoUrl AND branch)" },
        { status: 400 },
      )
    }

    const data = await fetchWorkflowStatus({
      prUrl: prUrl ?? undefined,
      repoUrl: repoUrl ?? undefined,
      branch: branch ?? undefined,
    })
    return Response.json(data)
  } catch (error) {
    return jsonError(error, "Failed to fetch workflow status.")
  }
}
