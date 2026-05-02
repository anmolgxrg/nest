import {
  BridgeError,
  listRepos,
  loadBridgeConfig,
  upsertRepo,
} from "@/lib/bridge/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side proxy to the bridge's repos API. NEST owns the canonical
 * repo list now; chaos's /api/repos is no longer involved. Bridge admin
 * token stays server-side via this proxy.
 */
export async function GET() {
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }
  try {
    const repos = await listRepos(cfg)
    return Response.json({ repos })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(request: Request) {
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
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
      url: body.url,
      jira_project_key: body.jira_project_key ?? null,
      description: body.description ?? null,
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
  const msg = e instanceof Error ? e.message : String(e)
  return Response.json({ error: msg }, { status: 502 })
}
