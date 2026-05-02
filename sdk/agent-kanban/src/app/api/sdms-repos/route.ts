export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side proxy to chaos's /api/repos endpoint.
 *
 * Chaos owns the canonical company repo list (config/sources.yaml), and the
 * NEST SDMs page renders it as kanban columns. We proxy here rather than
 * hitting chaos directly from the browser so:
 *   1. Chaos URL is config-driven (CHAOS_URL env), not baked into client.
 *   2. We can short-circuit a stable response if chaos is briefly down.
 *
 * Response shape (matches chaos /api/repos):
 *   { repos: [{ owner, name, url, jiraProjectKey | null }] }
 */

const DEFAULT_CHAOS_URL = "https://chaos.reasoning.company"

export async function GET() {
  const chaosUrl = (process.env.CHAOS_URL ?? DEFAULT_CHAOS_URL).replace(
    /\/$/,
    "",
  )

  try {
    const resp = await fetch(`${chaosUrl}/api/repos`, { cache: "no-store" })
    if (!resp.ok) {
      return Response.json(
        { error: `Chaos ${resp.status}` },
        { status: 502 },
      )
    }
    const json = await resp.json()
    return Response.json(json)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: msg }, { status: 502 })
  }
}
