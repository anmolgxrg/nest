export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side proxy to chaos's /api/repos. Chaos owns the canonical
 * company repo list (config/sources.yaml); we mirror it through here so
 * the chaos URL stays config-driven (CHAOS_URL) and the page never sees
 * a stub failure due to one transient blip.
 *
 * Strategy: try once, retry once on network/5xx errors. Good enough for
 * the dashboard refresh cadence; anything chronic surfaces as a 502.
 */

const DEFAULT_CHAOS_URL = "https://chaos.reasoning.company"

export async function GET() {
  const chaosUrl = (process.env.CHAOS_URL ?? DEFAULT_CHAOS_URL).replace(
    /\/$/,
    "",
  )
  const target = `${chaosUrl}/api/repos`

  let lastError = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(target, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      })
      if (resp.ok) {
        const json = await resp.json()
        return Response.json(json)
      }
      lastError = `Chaos ${resp.status}`
      // Don't retry 4xx — chaos said no for a reason.
      if (resp.status < 500) break
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  console.error(`[sdms-repos] proxy failed after retries: ${lastError}`)
  return Response.json({ error: lastError }, { status: 502 })
}
