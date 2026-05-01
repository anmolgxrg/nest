import {
  BridgeError,
  deleteMapping,
  loadBridgeConfig,
  upsertMapping,
} from "@/lib/bridge/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Ctx {
  params: Promise<{ projectKey: string }>
}

export async function PUT(req: Request, { params }: Ctx) {
  const { projectKey } = await params
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }

  let body: { repo_url?: string; description?: string | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 })
  }
  if (!body.repo_url || typeof body.repo_url !== "string") {
    return Response.json({ error: "repo_url is required" }, { status: 400 })
  }

  try {
    const mapping = await upsertMapping(cfg, {
      jira_project_key: projectKey,
      repo_url: body.repo_url,
      description: body.description ?? null,
    })
    return Response.json({ mapping })
  } catch (e) {
    return jsonError(e)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { projectKey } = await params
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }

  try {
    const removed = await deleteMapping(cfg, projectKey)
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
