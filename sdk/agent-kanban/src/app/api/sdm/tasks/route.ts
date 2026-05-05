import { jsonError } from "@/lib/agents/http"
import { actorForSession, requireRole } from "@/lib/agents/server"
import { createSdmTask } from "@/lib/nest-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CreateSdmTaskRequest = {
  task?: string
  repositoryId?: string
  modelId?: string
  branch?: string
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(request, "operator")
    const body = (await request.json()) as CreateSdmTaskRequest
    const task = body.task?.trim()
    const repositoryId = body.repositoryId?.trim()

    if (!task) {
      return Response.json({ error: "task is required" }, { status: 400 })
    }
    if (!repositoryId) {
      return Response.json({ error: "repositoryId is required" }, { status: 400 })
    }

    return Response.json({
      task: createSdmTask({
        actor: actorForSession(session),
        task,
        repositoryId,
        modelId: body.modelId?.trim() || undefined,
        branch: body.branch?.trim() || undefined,
      }),
    })
  } catch (error) {
    return jsonError(error, "Failed to create SDM task.")
  }
}
