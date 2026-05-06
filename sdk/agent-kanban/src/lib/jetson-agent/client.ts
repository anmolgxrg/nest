import "server-only"

import {
  AuthorizationError,
  InvalidCursorApiKeyError,
  MissingCursorApiKeyError,
  UnknownSessionError,
} from "@/lib/agents/server"

type JetsonAgentConfig =
  | {
      configured: true
      baseUrl: string
      token: string
    }
  | {
      configured: false
      reason: string
    }

export class JetsonAgentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = "JetsonAgentError"
  }
}

export function loadJetsonAgentConfig(): JetsonAgentConfig {
  const baseUrl = (
    process.env.JETSON_AGENT_BASE_URL ??
    process.env.AGENT_CONSOLE_BASE_URL ??
    ""
  ).trim()
  const token = (
    process.env.JETSON_AGENT_TOKEN ??
    process.env.AGENT_CONSOLE_TOKEN ??
    ""
  ).trim()

  if (!baseUrl || !token) {
    return {
      configured: false,
      reason:
        "JETSON_AGENT_BASE_URL and JETSON_AGENT_TOKEN must be set in the agent-kanban server environment. Get the token with: ssh jensen '~/.local/bin/agent-console-token'.",
    }
  }

  return { configured: true, baseUrl: baseUrl.replace(/\/+$/, ""), token }
}

export async function jetsonAgentRequest<T>(
  cfg: Extract<JetsonAgentConfig, { configured: true }>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("Accept", "application/json")
  headers.set("Authorization", `Bearer ${cfg.token}`)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  let response: Response
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new JetsonAgentError(
      `Jetson agent unreachable at ${cfg.baseUrl}. Start the tunnel with: ssh -N -L 8787:127.0.0.1:8787 jensen. ${detail}`,
      502,
    )
  }

  const text = await response.text()
  const payload = parseJson(text)

  if (!response.ok) {
    const detail = payload?.error ?? text
    throw new JetsonAgentError(
      `Jetson agent ${response.status}: ${detail}`,
      response.status,
    )
  }

  return (payload ?? {}) as T
}

export function jetsonAgentJsonError(error: unknown): Response {
  if (
    error instanceof MissingCursorApiKeyError ||
    error instanceof InvalidCursorApiKeyError ||
    error instanceof UnknownSessionError ||
    error instanceof AuthorizationError
  ) {
    const status =
      error instanceof InvalidCursorApiKeyError
        ? 401
        : error instanceof UnknownSessionError
          ? 404
          : error instanceof AuthorizationError
            ? 403
            : 400

    return Response.json(
      { code: error.code, error: error.message },
      { status },
    )
  }

  if (error instanceof JetsonAgentError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : String(error)
  return Response.json({ error: message }, { status: 502 })
}

function parseJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: text }
  }
}
