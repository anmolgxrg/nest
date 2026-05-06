import { jsonError } from "@/lib/agents/http"
import {
  actorForSession,
  createCloudAgent,
  listCloudAgents,
  requireRole,
} from "@/lib/agents/server"
import type { AgentCard, CreateAgentInput } from "@/lib/agents/types"
import {
  listJetsonAgentLaunches,
  type JetsonAgentLaunchRecord,
} from "@/lib/nest-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, "viewer")
    const url = new URL(request.url)

    const response = await listCloudAgents(session.apiKey, {
      cursor: url.searchParams.get("cursor") ?? undefined,
      prUrl: url.searchParams.get("prUrl") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") === "true",
    })

    return Response.json({
      ...response,
      agents: [
        ...listJetsonAgentLaunches().map(jetsonLaunchToAgentCard),
        ...response.agents,
      ],
    })
  } catch (error) {
    return jsonError(error, "Failed to list cloud agents.")
  }
}

function jetsonLaunchToAgentCard(record: JetsonAgentLaunchRecord): AgentCard {
  return {
    id: record.id,
    title: record.title,
    status: `jetson-${record.status}`,
    repository: record.repository_label,
    repositoryUrl: record.repository_url ?? undefined,
    branch: record.branch ?? undefined,
    createdBy: record.created_by_name ?? record.created_by_email ?? "Jetson",
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    latestMessage: record.prompt,
    artifacts: [],
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(request, "operator")
    const body = (await request.json()) as CreateAgentInput
    return Response.json(
      await createCloudAgent(session.apiKey, body, actorForSession(session))
    )
  } catch (error) {
    return jsonError(error, "Failed to create a cloud agent.")
  }
}
