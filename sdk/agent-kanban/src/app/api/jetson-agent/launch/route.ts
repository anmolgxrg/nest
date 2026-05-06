import {
  actorForSession,
  listRepositories,
  requireRole,
} from "@/lib/agents/server"
import type {
  AgentCard,
  CreateAgentResponse,
  RepositoryOption,
} from "@/lib/agents/types"
import {
  jetsonAgentJsonError,
  jetsonAgentRequest,
  loadJetsonAgentConfig,
} from "@/lib/jetson-agent/client"
import type { JetsonPromptResponse } from "@/lib/jetson-agent/types"
import {
  auditEvent,
  recordJetsonAgentLaunch,
  recordSdaLaunch,
  type JetsonAgentLaunchRecord,
} from "@/lib/nest-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type JetsonLaunchRequest = {
  name?: string
  prompt?: string
  repositoryId?: string
  repositoryLabel?: string
  repositoryUrl?: string
  branch?: string
  sdmTaskId?: string
  sdaRoleId?: string
  sdaRoleTitle?: string
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(request, "operator")
    const cfg = loadJetsonAgentConfig()
    if (!cfg.configured) {
      return Response.json({ error: cfg.reason }, { status: 503 })
    }

    const body = (await request.json()) as JetsonLaunchRequest
    const prompt = body.prompt?.trim()
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 })
    }

    const repository = await resolveRepository(session.apiKey, body)
    const title =
      body.name?.trim() ||
      `${body.sdaRoleTitle?.trim() || "Jetson agent"}: ${taskTitle(prompt)}`
    const branch = body.branch?.trim() || repository?.defaultBranch || "main"
    const autonomousPrompt = buildAutonomousPrompt({
      branch,
      prompt,
      repository,
      title,
    })

    const result = await jetsonAgentRequest<JetsonPromptResponse>(
      cfg,
      "/api/prompt",
      {
        method: "POST",
        body: JSON.stringify({ prompt: autonomousPrompt }),
      },
    )

    const actor = actorForSession(session)
    const record = recordJetsonAgentLaunch({
      actor,
      title,
      prompt: autonomousPrompt,
      repositoryLabel: repository?.label,
      repositoryUrl: repository?.url,
      branch,
      sdmTaskId: body.sdmTaskId,
      sdaRoleId: body.sdaRoleId,
      sdaRoleTitle: body.sdaRoleTitle,
      tail: result.tail,
    })
    if (body.sdmTaskId || body.sdaRoleId) {
      recordSdaLaunch({
        taskId: body.sdmTaskId,
        roleId: body.sdaRoleId,
        roleTitle: body.sdaRoleTitle,
        agentId: record.id,
        agentTitle: record.title,
        status: record.status,
      })
    }
    auditEvent({
      actor,
      action: "jetson_agent.launch",
      resourceType: "jetson_agent",
      resourceId: record.id,
      metadata: {
        branch,
        repositoryId: body.repositoryId,
        repositoryUrl: repository?.url,
        sdaRoleId: body.sdaRoleId,
        sdmTaskId: body.sdmTaskId,
      },
    })

    return Response.json({
      agent: jetsonRecordToAgentCard(record),
    } satisfies CreateAgentResponse)
  } catch (error) {
    return jetsonAgentJsonError(error)
  }
}

async function resolveRepository(
  apiKey: string,
  body: JetsonLaunchRequest,
): Promise<RepositoryOption | null> {
  const repositoryId = body.repositoryId?.trim()
  if (repositoryId) {
    const repositories = await listRepositories(apiKey).catch(() => [])
    const repository = repositories.find((option) => option.id === repositoryId)
    if (repository) {
      return repository
    }
  }

  const url = body.repositoryUrl?.trim()
  const label = body.repositoryLabel?.trim()
  if (url || label) {
    return {
      id: repositoryId || url || label || "jetson",
      label: label || repoNameFromUrl(url) || "Jetson",
      url: url || "",
      defaultBranch: body.branch?.trim() || undefined,
    }
  }

  return null
}

function buildAutonomousPrompt({
  branch,
  prompt,
  repository,
  title,
}: {
  branch: string
  prompt: string
  repository: RepositoryOption | null
  title: string
}) {
  return [
    "You are the Jetson autonomous software development agent launched from NEST.",
    "Run independently. Do not wait for the browser user to answer yes/no prompts.",
    "Use non-interactive execution paths and dangerous/skip-permission CLI modes when a local agent CLI would otherwise block on confirmation.",
    "You have permission to inspect files, edit code, run builds/tests, commit, and push when the task requires it.",
    "",
    `Agent title: ${title}`,
    repository?.url ? `Repository URL: ${repository.url}` : null,
    repository?.label ? `Repository label: ${repository.label}` : null,
    `Target branch/ref: ${branch}`,
    "",
    "Task:",
    prompt,
    "",
    "Report progress in the terminal output and leave a concise final status when finished.",
  ]
    .filter(Boolean)
    .join("\n")
}

function jetsonRecordToAgentCard(record: JetsonAgentLaunchRecord): AgentCard {
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

function taskTitle(task: string) {
  const collapsed = task.replace(/\s+/g, " ").trim()
  if (!collapsed) {
    return "task"
  }
  return collapsed.length > 54 ? `${collapsed.slice(0, 51).trim()}...` : collapsed
}

function repoNameFromUrl(url: string | undefined) {
  if (!url) {
    return ""
  }
  const clean = url.replace(/\.git$/, "").replace(/\/+$/, "")
  return clean.slice(clean.lastIndexOf("/") + 1).replace(/^.*:/, "")
}
