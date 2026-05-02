"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  GitBranchIcon,
  KanbanIcon,
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AgentDetailsDialog } from "@/components/agent-details-dialog"
import type {
  AgentCard,
  AgentListResponse,
  PublicSession,
} from "@/lib/agents/types"

interface ChaosRepo {
  owner: string
  name: string
  url: string
  jiraProjectKey: string | null
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; repos: ChaosRepo[]; agents: AgentCard[] }
  | { kind: "error"; message: string }
  | { kind: "no_session" }

const sessionStorageKey = "agent-kanban-session-id"
const POLL_MS = 5000

/**
 * Statuses we treat as "this agent is no longer running". Anything not in
 * this set (including unknown values) is shown — leans permissive so a new
 * Cursor status doesn't silently disappear from the board.
 */
const TERMINAL_STATUSES = new Set([
  "completed",
  "complete",
  "done",
  "finished",
  "failed",
  "error",
  "errored",
  "cancelled",
  "canceled",
  "expired",
  "stopped",
  "aborted",
])

function isActive(status: string | undefined) {
  if (!status) return false
  return !TERMINAL_STATUSES.has(status.trim().toLowerCase())
}

function repoMatchesAgent(repo: ChaosRepo, agent: AgentCard): boolean {
  const target = `${repo.owner}/${repo.name}`.toLowerCase()
  const candidates: string[] = []
  if (agent.repository) candidates.push(agent.repository.toLowerCase().trim())
  if (agent.repositoryUrl)
    candidates.push(agent.repositoryUrl.toLowerCase().trim())

  for (const c of candidates) {
    if (!c) continue
    if (c === target) return true
    const m = c.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (m && `${m[1]}/${m[2]}` === target) return true
    if (c === repo.name.toLowerCase()) return true
  }
  return false
}

export function SdmsPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [selectedAgent, setSelectedAgent] = React.useState<AgentCard | null>(
    null,
  )
  const [refreshing, setRefreshing] = React.useState(false)
  const sessionIdRef = React.useRef<string | null>(null)

  const load = React.useCallback(async (showSpinner = false) => {
    const sessionId = sessionIdRef.current
    if (!sessionId) {
      setState({ kind: "no_session" })
      return
    }

    if (showSpinner) setRefreshing(true)
    try {
      const [reposResp, agentsResp] = await Promise.all([
        fetch("/api/sdms-repos", { cache: "no-store" }),
        fetch("/api/agents", {
          cache: "no-store",
          headers: { "x-agent-kanban-session": sessionId },
        }),
      ])

      if (!reposResp.ok) {
        const json = await reposResp.json().catch(() => ({}))
        throw new Error(json.error ?? `repos HTTP ${reposResp.status}`)
      }
      if (!agentsResp.ok) {
        const json = await agentsResp.json().catch(() => ({}))
        throw new Error(json.error ?? `agents HTTP ${agentsResp.status}`)
      }

      const repos = ((await reposResp.json()) as { repos: ChaosRepo[] }).repos
      const agents = ((await agentsResp.json()) as AgentListResponse).agents
      setState({ kind: "ready", repos, agents })
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      if (showSpinner) setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(sessionStorageKey)

    // Restore via /api/session so the cookie is set before the agents call.
    let cancelled = false
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: stored }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`session HTTP ${resp.status}`)
        return (await resp.json()) as PublicSession
      })
      .then((s) => {
        if (cancelled) return
        window.localStorage.setItem(sessionStorageKey, s.id)
        sessionIdRef.current = s.id
        load()
      })
      .catch(() => {
        if (cancelled) return
        sessionIdRef.current = null
        setState({ kind: "no_session" })
      })

    return () => {
      cancelled = true
    }
  }, [load])

  React.useEffect(() => {
    if (state.kind !== "ready") return
    const t = setInterval(() => load(), POLL_MS)
    return () => clearInterval(t)
  }, [state.kind, load])

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          back to kanban
        </Link>
        <div className="ml-3 flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">SDMs</h1>
          <span className="text-xs text-muted-foreground">
            Active Cursor agents per repo · refresh {POLL_MS / 1000}s
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {state.kind === "ready" ? (
            <Badge variant="outline">
              {countActive(state.agents)} active ·{" "}
              {state.repos.length} repos
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing || state.kind !== "ready"}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Refresh
          </Button>
        </div>
      </header>

      {state.kind === "no_session" ? (
        <NoSessionMessage />
      ) : state.kind === "error" ? (
        <ErrorMessage message={state.message} onRetry={() => load(true)} />
      ) : state.kind === "loading" ? (
        <LoadingMessage />
      ) : (
        <Board
          repos={state.repos}
          agents={state.agents}
          onSelectAgent={setSelectedAgent}
        />
      )}

      {selectedAgent && sessionIdRef.current ? (
        <AgentDetailsDialog
          agent={selectedAgent}
          sessionId={sessionIdRef.current}
          onClose={() => setSelectedAgent(null)}
        />
      ) : null}
    </div>
  )
}

function countActive(agents: AgentCard[]) {
  return agents.filter((a) => isActive(a.status)).length
}

function Board({
  repos,
  agents,
  onSelectAgent,
}: {
  repos: ChaosRepo[]
  agents: AgentCard[]
  onSelectAgent: (a: AgentCard) => void
}) {
  const activeAgents = React.useMemo(
    () => agents.filter((a) => isActive(a.status)),
    [agents],
  )

  // Bucket each active agent into its matching repo column. Anything that
  // doesn't match a known chaos repo lands in an "Other" column at the end
  // — better than dropping it silently.
  const buckets = new Map<string, AgentCard[]>()
  const other: AgentCard[] = []
  for (const repo of repos) {
    buckets.set(repoKey(repo), [])
  }
  for (const agent of activeAgents) {
    const repo = repos.find((r) => repoMatchesAgent(r, agent))
    if (repo) {
      buckets.get(repoKey(repo))!.push(agent)
    } else {
      other.push(agent)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full gap-3 p-4">
          {repos.map((repo) => (
            <RepoColumn
              key={repoKey(repo)}
              repo={repo}
              agents={buckets.get(repoKey(repo)) ?? []}
              onSelectAgent={onSelectAgent}
            />
          ))}
          {other.length > 0 ? (
            <OtherColumn agents={other} onSelectAgent={onSelectAgent} />
          ) : null}
        </div>
      </ScrollArea>
    </section>
  )
}

function repoKey(repo: ChaosRepo) {
  return `${repo.owner}/${repo.name}`
}

function RepoColumn({
  repo,
  agents,
  onSelectAgent,
}: {
  repo: ChaosRepo
  agents: AgentCard[]
  onSelectAgent: (a: AgentCard) => void
}) {
  return (
    <section className="flex w-80 shrink-0 flex-col rounded-xl bg-muted/20">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <KanbanIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <h2 className="truncate text-sm font-medium" title={repoKey(repo)}>
            {repo.name}
          </h2>
          {repo.jiraProjectKey ? (
            <span
              className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              title={`Jira project ${repo.jiraProjectKey}`}
            >
              {repo.jiraProjectKey}
            </span>
          ) : null}
        </div>
        <Badge variant="secondary">{agents.length}</Badge>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {agents.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] italic text-muted-foreground/70">
            no active agents
          </p>
        ) : (
          agents.map((a) => (
            <SdmsAgentCard key={a.id} agent={a} onSelect={onSelectAgent} />
          ))
        )}
      </div>
    </section>
  )
}

function OtherColumn({
  agents,
  onSelectAgent,
}: {
  agents: AgentCard[]
  onSelectAgent: (a: AgentCard) => void
}) {
  return (
    <section className="flex w-80 shrink-0 flex-col rounded-xl border border-dashed bg-muted/10">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <GitBranchIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <h2 className="truncate text-sm font-medium">Other</h2>
          <span className="text-[11px] text-muted-foreground">
            not in chaos
          </span>
        </div>
        <Badge variant="outline">{agents.length}</Badge>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {agents.map((a) => (
          <SdmsAgentCard key={a.id} agent={a} onSelect={onSelectAgent} />
        ))}
      </div>
    </section>
  )
}

function SdmsAgentCard({
  agent,
  onSelect,
}: {
  agent: AgentCard
  onSelect: (a: AgentCard) => void
}) {
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(agent)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(agent)
        }
      }}
      className="cursor-pointer gap-3 bg-card/70 ring-border/60 transition-colors hover:bg-card/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-2">{agent.title}</CardTitle>
          <SdmsStatusBadge status={agent.status} />
        </div>
        <CardDescription className="flex items-center gap-1.5 truncate text-xs">
          <GitBranchIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{agent.branch ?? agent.repository}</span>
        </CardDescription>
      </CardHeader>
      {agent.latestMessage ? (
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {agent.latestMessage}
          </p>
        </CardContent>
      ) : null}
      <CardFooter className="flex-wrap justify-between gap-2 border-t-0 bg-transparent text-xs text-muted-foreground">
        <span>{formatRelativeTime(agent.updatedAt ?? agent.createdAt)}</span>
        {agent.prUrl ? (
          <a
            href={agent.prUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-foreground underline-offset-4 hover:underline"
          >
            PR
          </a>
        ) : null}
      </CardFooter>
    </Card>
  )
}

function SdmsStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const variant: "destructive" | "secondary" | "default" | "outline" =
    normalized.includes("fail") || normalized.includes("error")
      ? "destructive"
      : normalized.includes("complete") || normalized.includes("done")
        ? "secondary"
        : normalized.includes("run") || normalized.includes("active")
          ? "default"
          : "outline"
  return <Badge variant={variant}>{formatStatusLabel(status)}</Badge>
}

function formatStatusLabel(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === "no_status") return "No status"
  return trimmed
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatRelativeTime(value: string | undefined) {
  if (!value) return "no activity"
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return "no activity"
  const diff = Date.now() - t
  const minutes = Math.max(1, Math.floor(diff / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function LoadingMessage() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      loading…
    </div>
  )
}

function ErrorMessage({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <div className="font-medium">Could not load SDMs board</div>
        <div className="mt-0.5 text-xs opacity-80">{message}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        retry
      </Button>
    </div>
  )
}

function NoSessionMessage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="text-base font-medium">Sign in to NEST first</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The SDMs board reads live Cursor agents through your NEST session.
        Open the kanban, paste a Cursor API key, then come back.
      </p>
      <Link
        href="/"
        className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open kanban
      </Link>
    </div>
  )
}
