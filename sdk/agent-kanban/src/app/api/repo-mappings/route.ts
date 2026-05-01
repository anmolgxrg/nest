import { BridgeError, listMappings, loadBridgeConfig } from "@/lib/bridge/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side proxy to the bridge admin API.
 *
 * The browser hits *this* route (no auth, same-origin), and we forward to
 * the bridge with BRIDGE_ADMIN_TOKEN attached. That keeps the secret off
 * the client and lets us add UI-level auth here later (e.g. only allow
 * authenticated NEST sessions to manage routing).
 */
export async function GET() {
  const cfg = loadBridgeConfig()
  if (!cfg.configured) {
    return Response.json({ error: cfg.reason }, { status: 503 })
  }
  try {
    const mappings = await listMappings(cfg)
    return Response.json({ mappings })
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
