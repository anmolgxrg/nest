import {
  BridgeError,
  deleteRepo,
  loadBridgeConfig,
  upsertRepo,
} from "@/lib/bridge/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: RouteParams) {
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }
  try {
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
    return Response.json({ repo })
  } catch (e) {
    return jsonError(e)
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }
  try {
    const removed = await deleteRepo(cfg, id)
    return Response.json({ removed })
  } catch (e) {
    return jsonError(e)
  }
}

function jsonError(e: unknown) {
  if (e instanceof BridgeError) {
    return Response.json({ error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  return Response.json({ error: msg }, { status: 502 })
}
