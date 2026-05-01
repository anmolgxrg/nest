"use client"

import * as React from "react"
import {
  XIcon,
  ArrowSquareOutIcon,
  GitBranchIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  WarningCircleIcon,
  XCircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { AgentCard } from "@/lib/agents/types"

interface CheckRun {
  name: string
  status: string
  conclusion: string | null
  htmlUrl: string
  durationMs: number | null
}

interface WorkflowRun {
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

interface WorkflowResponse {
  pr?: {
    url: string
    number: number
    state: string
    merged: boolean
    draft: boolean
    headRef: string
  }
  combinedStatus?: string
  checkRuns: CheckRun[]
  workflowRuns: WorkflowRun[]
  source: "pr" | "branch"
}

export function AgentDetailsDialog({
  agent,
  sessionId,
  onClose,
}: {
  agent: AgentCard
  sessionId: string
  onClose: () => void
}) {
  const [data, setData] = React.useState<WorkflowResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const params = new URLSearchParams()
    if (agent.prUrl) {
      params.set("prUrl", agent.prUrl)
    } else if (agent.repositoryUrl && agent.branch) {
      params.set("repoUrl", agent.repositoryUrl)
      params.set("branch", agent.branch)
    } else {
      setLoading(false)
      setError("Agent has no PR or branch metadata yet.")
      return
    }

    let cancelled = false
    setLoading(true)
    fetch(`/api/agents/${agent.id}/workflow?${params.toString()}`, {
      headers: { "x-session-id": sessionId },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new Error(`${res.status} ${body.slice(0, 200)}`)
        }
        return res.json() as Promise<WorkflowResponse>
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [agent.id, agent.prUrl, agent.repositoryUrl, agent.branch, sessionId])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-details-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl"
      >
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle id="agent-details-title" className="line-clamp-2">
                  {agent.title}
                </CardTitle>
                <StatusBadge status={agent.status} />
              </div>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <GitBranchIcon aria-hidden="true" className="size-3.5" />
                  {agent.repository}
                </span>
                {agent.branch ? (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {agent.branch}
                    </code>
                  </>
                ) : null}
                {agent.prUrl ? (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <a
                      href={agent.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
                    >
                      PR <ArrowSquareOutIcon className="size-3" />
                    </a>
                  </>
                ) : null}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 py-4">
            {agent.latestMessage ? (
              <Section title="Prompt / latest message">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {agent.latestMessage}
                </pre>
              </Section>
            ) : null}

            <Section
              title="GitHub deploy + check status"
              right={
                data?.combinedStatus ? (
                  <Badge variant="secondary" className="text-xs">
                    combined: {data.combinedStatus}
                  </Badge>
                ) : null
              }
            >
              {loading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CircleNotchIcon className="size-3.5 animate-spin" />
                  Loading workflow status…
                </p>
              ) : error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : data ? (
                <WorkflowPanel data={data} />
              ) : null}
            </Section>

            {agent.artifacts && agent.artifacts.length > 0 ? (
              <Section title={`Artifacts (${agent.artifacts.length})`}>
                <ul className="flex flex-col gap-1 text-xs">
                  {agent.artifacts.slice(0, 12).map((a) => (
                    <li
                      key={a.path}
                      className="flex items-center justify-between gap-2 rounded border bg-card/50 px-2 py-1.5"
                    >
                      <span className="truncate font-mono">{a.name}</span>
                      <span className="text-muted-foreground">
                        {a.previewKind ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Metadata">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Agent ID</dt>
                <dd className="font-mono">{agent.id}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{agent.status}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{agent.createdAt ?? "—"}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{agent.updatedAt ?? "—"}</dd>
                {agent.createdBy ? (
                  <>
                    <dt className="text-muted-foreground">Created by</dt>
                    <dd>{agent.createdBy}</dd>
                  </>
                ) : null}
              </dl>
            </Section>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      <Separator />
      <div className="pt-1">{children}</div>
    </section>
  )
}

function WorkflowPanel({ data }: { data: WorkflowResponse }) {
  if (data.checkRuns.length === 0 && data.workflowRuns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No check runs or workflow runs found for this branch yet.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {data.checkRuns.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Check runs ({data.checkRuns.length})
          </p>
          <ul className="flex flex-col gap-1">
            {data.checkRuns.map((c) => (
              <li
                key={`${c.name}-${c.htmlUrl}`}
                className="flex items-center justify-between gap-2 rounded border bg-card/50 px-2 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ConclusionIcon
                    status={c.status}
                    conclusion={c.conclusion}
                  />
                  <span className="truncate font-medium">{c.name}</span>
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {formatDuration(c.durationMs)}
                  <a
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open check"
                  >
                    <ArrowSquareOutIcon className="size-3" />
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.workflowRuns.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Workflow runs ({data.workflowRuns.length})
          </p>
          <ul className="flex flex-col gap-1">
            {data.workflowRuns.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded border bg-card/50 px-2 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ConclusionIcon
                    status={r.status}
                    conclusion={r.conclusion}
                  />
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="truncate text-muted-foreground">
                    · {r.event}
                  </span>
                </span>
                <a
                  href={r.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open run"
                >
                  <ArrowSquareOutIcon className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function ConclusionIcon({
  status,
  conclusion,
}: {
  status: string
  conclusion: string | null
}) {
  const cls = "size-3.5 shrink-0"
  if (status !== "completed") {
    if (status === "in_progress" || status === "queued" || status === "pending")
      return (
        <CircleNotchIcon
          className={`${cls} animate-spin text-muted-foreground`}
          aria-label={status}
        />
      )
    return (
      <CircleDashedIcon
        className={`${cls} text-muted-foreground`}
        aria-label={status}
      />
    )
  }
  switch (conclusion) {
    case "success":
      return (
        <CheckCircleIcon
          className={`${cls} text-green-600`}
          aria-label="success"
        />
      )
    case "failure":
    case "timed_out":
    case "action_required":
      return (
        <XCircleIcon className={`${cls} text-red-600`} aria-label={conclusion} />
      )
    case "neutral":
    case "skipped":
    case "cancelled":
      return (
        <WarningCircleIcon
          className={`${cls} text-muted-foreground`}
          aria-label={conclusion ?? ""}
        />
      )
    default:
      return (
        <CircleDashedIcon
          className={`${cls} text-muted-foreground`}
          aria-label={conclusion ?? "unknown"}
        />
      )
  }
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const variant: "default" | "secondary" | "destructive" =
    status === "merged" || status === "completed" || status === "succeeded"
      ? "default"
      : status === "failed" || status === "errored"
        ? "destructive"
        : "secondary"
  return <Badge variant={variant}>{status}</Badge>
}

function formatDuration(ms: number | null): string {
  if (ms == null) return ""
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}
