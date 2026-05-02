import "server-only"

/**
 * Server-only client for the Jira-cursor-bridge admin API.
 *
 * Lives behind Next.js API routes so the BRIDGE_ADMIN_TOKEN never reaches
 * the browser. The bridge URL is read from BRIDGE_URL on every call so
 * env changes take effect on next request without a rebuild.
 */
export interface Repo {
  id: number
  owner: string
  name: string
  url: string
  jira_project_key: string | null
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

export async function listRepos(cfg: BridgeConfigOk): Promise<Repo[]> {
  const r = await request<{ repos: Repo[] }>(cfg, "/api/repos")
  return r.repos
}

export async function upsertRepo(
  cfg: BridgeConfigOk,
  input: {
    url: string
    jira_project_key?: string | null
    description?: string | null
    id?: number
  },
): Promise<Repo> {
  const path = input.id ? `/api/repos/${input.id}` : "/api/repos"
  const method = input.id ? "PUT" : "POST"
  const r = await request<{ repo: Repo }>(cfg, path, {
    method,
    body: JSON.stringify({
      url: input.url,
      jira_project_key: input.jira_project_key ?? null,
      description: input.description ?? null,
    }),
  })
  return r.repo
}

export async function deleteRepo(
  cfg: BridgeConfigOk,
  id: number,
): Promise<boolean> {
  const r = await request<{ removed: boolean }>(cfg, `/api/repos/${id}`, {
    method: "DELETE",
  })
  return r.removed
}
