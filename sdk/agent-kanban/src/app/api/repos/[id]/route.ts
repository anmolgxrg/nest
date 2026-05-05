import {
  BridgeError,
  deleteRepo,
  loadBridgeConfig,
  upsertRepo,
} from "@/lib/bridge/client"
import { jsonError as agentJsonError } from "@/lib/agents/http"
import { actorForSession, requireRole } from "@/lib/agents/server"
import { auditEvent, recordRoutingChange } from "@/lib/nest-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await requireRole(request, "admin")
    const cfg = loadBridgeConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "invalid id" }, { status: 400 })
    }

    const body = (await request.json()) as {
      url?: string
      jira_project_key?: string | null
      description?: string | null
    }
    if (!body.url) {
      return Response.json({ error: "url required" }, { status: 400 })
    }
    const repo = await upsertRepo(cfg, {
      id,
      url: body.url,
      jira_project_key: body.jira_project_key ?? null,
      description: body.description ?? null,
    })
    const actor = actorForSession(session)
    recordRoutingChange({
      actor,
      action: "update",
      repoId: repo.id,
      repoUrl: repo.url,
      jiraProjectKey: repo.jira_project_key,
      description: repo.description,
    })
    auditEvent({
      actor,
      action: "routing.update",
      resourceType: "repo",
      resourceId: String(repo.id),
      metadata: {
        jira_project_key: repo.jira_project_key,
        url: repo.url,
      },
    })
    return Response.json({ repo })
  } catch (e) {
    return jsonError(e)
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await requireRole(request, "admin")
    const cfg = loadBridgeConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "invalid id" }, { status: 400 })
    }

    const removed = await deleteRepo(cfg, id)
    const actor = actorForSession(session)
    recordRoutingChange({
      actor,
      action: "delete",
      repoId: id,
      removed,
    })
    auditEvent({
      actor,
      action: "routing.delete",
      resourceType: "repo",
      resourceId: String(id),
      metadata: { removed },
    })
    return Response.json({ removed })
  } catch (e) {
    return jsonError(e)
  }
}

function jsonError(e: unknown) {
  if (e instanceof BridgeError) {
    return Response.json({ error: e.message }, { status: e.status })
  }
  return agentJsonError(e, "Repository routing request failed.")
}
