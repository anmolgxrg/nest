import { Octokit } from "@octokit/rest"

export interface CheckRunSummary {
  name: string
  status: string // queued | in_progress | completed
  conclusion: string | null // success | failure | neutral | cancelled | skipped | timed_out | action_required | null
  startedAt: string | null
  completedAt: string | null
  htmlUrl: string
  durationMs: number | null
}

export interface WorkflowRunSummary {
  id: number
  name: string
  workflow: string
  event: string
  status: string
  conclusion: string | null
  branch: string | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowStatusResponse {
  pr?: {
    url: string
    number: number
    state: string
    merged: boolean
    draft: boolean
    headSha: string
    headRef: string
  }
  combinedStatus?: string
  checkRuns: CheckRunSummary[]
  workflowRuns: WorkflowRunSummary[]
  source: "pr" | "branch"
}

function parsePrUrl(url: string) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) throw new Error(`Cannot parse PR url: ${url}`)
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]!) }
}

function parseRepoUrl(url: string) {
  const cleaned = url.startsWith("http") ? url : `https://${url}`
  const m = cleaned.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/)
  if (!m) throw new Error(`Cannot parse repo url: ${url}`)
  return { owner: m[1]!, repo: m[2]! }
}

let cached: Octokit | null = null
function octokit() {
  if (cached) return cached
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error("GITHUB_TOKEN not set in kanban env")
  cached = new Octokit({ auth: token })
  return cached
}

export async function fetchWorkflowStatus(opts: {
  prUrl?: string
  repoUrl?: string
  branch?: string
}): Promise<WorkflowStatusResponse> {
  const gh = octokit()

  let owner: string
  let repo: string
  let headRef: string
  let headSha: string | null = null
  let prInfo: WorkflowStatusResponse["pr"] | undefined
  let source: "pr" | "branch"

  if (opts.prUrl) {
    const parsed = parsePrUrl(opts.prUrl)
    owner = parsed.owner
    repo = parsed.repo
    const { data } = await gh.pulls.get({
      owner,
      repo,
      pull_number: parsed.number,
    })
    headRef = data.head.ref
    headSha = data.head.sha
    prInfo = {
      url: data.html_url,
      number: data.number,
      state: data.state,
      merged: !!data.merged,
      draft: !!data.draft,
      headSha,
      headRef,
    }
    source = "pr"
  } else {
    const parsed = parseRepoUrl(opts.repoUrl!)
    owner = parsed.owner
    repo = parsed.repo
    headRef = opts.branch!
    try {
      const ref = await gh.git.getRef({ owner, repo, ref: `heads/${headRef}` })
      headSha = ref.data.object.sha
    } catch {
      headSha = null
    }
    source = "branch"
  }

  const [checkRunsResp, runsResp, combinedResp] = await Promise.all([
    headSha
      ? gh.checks.listForRef({ owner, repo, ref: headSha, per_page: 50 })
      : Promise.resolve({ data: { check_runs: [] } }),
    gh.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch: headRef,
      per_page: 20,
    }),
    headSha
      ? gh.repos
          .getCombinedStatusForRef({ owner, repo, ref: headSha })
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const checkRuns: CheckRunSummary[] = checkRunsResp.data.check_runs.map(
    (c) => ({
      name: c.name,
      status: c.status ?? "unknown",
      conclusion: c.conclusion,
      startedAt: c.started_at ?? null,
      completedAt: c.completed_at ?? null,
      htmlUrl: c.html_url ?? "",
      durationMs:
        c.started_at && c.completed_at
          ? new Date(c.completed_at).getTime() -
            new Date(c.started_at).getTime()
          : null,
    }),
  )

  const workflowRuns: WorkflowRunSummary[] = runsResp.data.workflow_runs.map(
    (r) => ({
      id: r.id,
      name: r.name ?? r.display_title ?? "",
      workflow: r.path ?? "",
      event: r.event ?? "",
      status: r.status ?? "unknown",
      conclusion: r.conclusion,
      branch: r.head_branch ?? null,
      htmlUrl: r.html_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  )

  return {
    pr: prInfo,
    combinedStatus: combinedResp?.data.state ?? undefined,
    checkRuns,
    workflowRuns,
    source,
  }
}
