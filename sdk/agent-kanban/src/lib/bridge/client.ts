import "server-only"

/**
 * Server-only client for the Jira-cursor-bridge admin API.
 *
 * Lives behind Next.js API routes so the BRIDGE_ADMIN_TOKEN never reaches
 * the browser. The bridge URL is read from BRIDGE_URL on every call so
 * docker-compose env changes take effect on next request without needing
 * a Next rebuild.
 */
export interface RepoMapping {
  jira_project_key: string
  repo_url: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface BridgeConfigError {
  configured: false
  reason: string
}

export interface BridgeConfigOk {
  configured: true
  baseUrl: string
  token: string
}

export type BridgeConfig = BridgeConfigOk | BridgeConfigError

export function loadBridgeConfig(): BridgeConfig {
  const baseUrl = process.env.BRIDGE_URL?.trim()
  const token = process.env.BRIDGE_ADMIN_TOKEN?.trim()
  if (!baseUrl || !token) {
    return {
      configured: false,
      reason:
        "BRIDGE_URL and BRIDGE_ADMIN_TOKEN must both be set for the Routing page to work.",
    }
  }
  return { configured: true, baseUrl: baseUrl.replace(/\/$/, ""), token }
}

async function request<T>(
  cfg: BridgeConfigOk,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const resp = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  })
  const text = await resp.text()
  if (!resp.ok) {
    let detail = text
    try {
      const json = JSON.parse(text)
      detail = json.error ?? text
    } catch {
      /* keep raw text */
    }
    throw new BridgeError(`Bridge ${resp.status}: ${detail}`, resp.status)
  }
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = "BridgeError"
  }
}

export async function listMappings(cfg: BridgeConfigOk): Promise<RepoMapping[]> {
  const r = await request<{ mappings: RepoMapping[] }>(cfg, "/api/repo-mappings")
  return r.mappings
}

export async function upsertMapping(
  cfg: BridgeConfigOk,
  input: { jira_project_key: string; repo_url: string; description?: string | null },
): Promise<RepoMapping> {
  const r = await request<{ mapping: RepoMapping }>(
    cfg,
    `/api/repo-mappings/${encodeURIComponent(input.jira_project_key)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        repo_url: input.repo_url,
        description: input.description ?? null,
      }),
    },
  )
  return r.mapping
}

export async function deleteMapping(
  cfg: BridgeConfigOk,
  projectKey: string,
): Promise<boolean> {
  const r = await request<{ removed: boolean }>(
    cfg,
    `/api/repo-mappings/${encodeURIComponent(projectKey)}`,
    { method: "DELETE" },
  )
  return r.removed
}
