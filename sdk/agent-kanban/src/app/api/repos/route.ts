import {
  BridgeError,
  listRepos,
  loadBridgeConfig,
  upsertRepo,
} from "@/lib/bridge/client"
import { jsonError as agentJsonError } from "@/lib/agents/http"
import { actorForSession, requireRole } from "@/lib/agents/server"
import { auditEvent, recordRoutingChange } from "@/lib/nest-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side proxy to the bridge's repos API. NEST owns the canonical
 * repo list now; chaos's /api/repos is no longer involved. Bridge admin
 * token stays server-side via this proxy.
 */
export async function GET(request: Request) {
  try {
    const session = await requireRole(request, "viewer")
    const cfg = loadBridgeConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }

    const repos = await listRepos(cfg)
    auditEvent({
      actor: actorForSession(session),
      action: "routing.list",
      resourceType: "routing",
      metadata: { count: repos.length },
    })
    return Response.json({ repos })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(request, "admin")
    const cfg = loadBridgeConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
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
      url: body.url,
      jira_project_key: body.jira_project_key ?? null,
      description: body.description ?? null,
    })
    const actor = actorForSession(session)
    recordRoutingChange({
      actor,
      action: "upsert",
      repoId: repo.id,
      repoUrl: repo.url,
      jiraProjectKey: repo.jira_project_key,
      description: repo.description,
    })
    auditEvent({
      actor,
      action: "routing.upsert",
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

function jsonError(e: unknown) {
  if (e instanceof BridgeError) {
    return Response.json({ error: e.message }, { status: e.status })
  }
  return agentJsonError(e, "Repository routing request failed.")
}
