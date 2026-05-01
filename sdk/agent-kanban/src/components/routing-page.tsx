"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeftIcon,
  GitBranchIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface RepoMapping {
  jira_project_key: string
  repo_url: string
  description: string | null
  created_at: string
  updated_at: string
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; mappings: RepoMapping[] }
  | { kind: "error"; message: string }

export function RoutingPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [actionError, setActionError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const resp = await fetch("/api/repo-mappings", { cache: "no-store" })
      const json = await resp.json()
      if (!resp.ok) {
        setState({
          kind: "error",
          message: json?.error ?? `HTTP ${resp.status}`,
        })
        return
      }
      setState({ kind: "ready", mappings: json.mappings ?? [] })
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const onUpsert = async (input: {
    jira_project_key: string
    repo_url: string
    description: string
  }) => {
    setActionError(null)
    const resp = await fetch(
      `/api/repo-mappings/${encodeURIComponent(input.jira_project_key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: input.repo_url,
          description: input.description.trim() || null,
        }),
      },
    )
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      setActionError(json?.error ?? `HTTP ${resp.status}`)
      return false
    }
    await load()
    return true
  }

  const onDelete = async (projectKey: string) => {
    setActionError(null)
    const resp = await fetch(
      `/api/repo-mappings/${encodeURIComponent(projectKey)}`,
      { method: "DELETE" },
    )
    if (!resp.ok) {
      const json = await resp.json().catch(() => null)
      setActionError(json?.error ?? `HTTP ${resp.status}`)
      return
    }
    await load()
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <header className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            back to kanban
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Routing</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Map a Jira project key (e.g.{" "}
                <code className="font-mono text-foreground">PAY</code>) to the
                GitHub repo where Cursor agents should run. Tickets in unmapped
                projects fall back to the bridge&apos;s{" "}
                <code className="font-mono text-foreground">
                  TARGET_REPO_URL
                </code>
                .
              </p>
            </div>
          </div>
        </header>

        {state.kind === "error" ? (
          <ErrorBanner message={state.message} onRetry={load} />
        ) : null}

        {actionError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </div>
        ) : null}

        <AddMappingCard onSubmit={onUpsert} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Existing mappings</CardTitle>
            <CardDescription>
              {state.kind === "ready"
                ? `${state.mappings.length} configured`
                : "loading…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {state.kind === "loading" ? (
              <p className="text-sm text-muted-foreground">loading…</p>
            ) : null}
            {state.kind === "ready" && state.mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing routed yet. Tickets will use the bridge fallback repo.
              </p>
            ) : null}
            {state.kind === "ready"
              ? state.mappings.map((m) => (
                  <MappingRow
                    key={m.jira_project_key}
                    mapping={m}
                    onDelete={() => onDelete(m.jira_project_key)}
                  />
                ))
              : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <div className="font-medium">Bridge unreachable</div>
      <div className="mt-0.5 text-xs opacity-80">{message}</div>
      <Button
        variant="outline"
        size="xs"
        className="mt-2"
        onClick={onRetry}
      >
        retry
      </Button>
    </div>
  )
}

function AddMappingCard({
  onSubmit,
}: {
  onSubmit: (input: {
    jira_project_key: string
    repo_url: string
    description: string
  }) => Promise<boolean>
}) {
  const [projectKey, setProjectKey] = React.useState("")
  const [repoUrl, setRepoUrl] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const canSubmit = projectKey.trim().length > 0 && repoUrl.trim().length > 0

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    const ok = await onSubmit({
      jira_project_key: projectKey.trim(),
      repo_url: repoUrl.trim(),
      description: description.trim(),
    })
    setSubmitting(false)
    if (ok) {
      setProjectKey("")
      setRepoUrl("")
      setDescription("")
    }
  }

  return (
    <Card>
      <form onSubmit={handle}>
        <CardHeader>
          <CardTitle className="text-base">Add mapping</CardTitle>
          <CardDescription>
            Set how a Jira project routes. Adding the same project key updates
            the existing row.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Jira project key
              <Input
                placeholder="PAY"
                value={projectKey}
                onChange={(e) =>
                  setProjectKey(e.target.value.toUpperCase().slice(0, 16))
                }
                spellCheck={false}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              GitHub repo URL
              <Input
                placeholder="https://github.com/acme/payments"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Description (optional)
            <Input
              placeholder="Backend services"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={!canSubmit || submitting}
          >
            <PlusIcon /> {submitting ? "Saving…" : "Save mapping"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function MappingRow({
  mapping,
  onDelete,
}: {
  mapping: RepoMapping
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <GitBranchIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-medium">
            {mapping.jira_project_key}
          </span>
          <span className="text-xs text-muted-foreground">→</span>
          <a
            href={mapping.repo_url}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate text-sm text-foreground hover:underline"
          >
            {trimRepoUrl(mapping.repo_url)}
          </a>
        </div>
        {mapping.description ? (
          <div className="truncate text-xs text-muted-foreground">
            {mapping.description}
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={`Remove mapping for ${mapping.jira_project_key}`}
        title="Remove"
      >
        <TrashIcon />
      </Button>
    </div>
  )
}

function trimRepoUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\.git$/, "")
}
