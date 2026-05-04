"use client"

import * as React from "react"
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  GitBranchIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  TerminalWindowIcon,
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { RepositoryOption } from "@/lib/agents/types"
import type {
  ConfiguredRepo,
  JetsonCloneRepoResponse,
  JetsonPromptResponse,
  JetsonSelectRepoResponse,
  JetsonStatusResponse,
  JetsonTailResponse,
} from "@/lib/jetson-agent/types"
import { cn } from "@/lib/utils"

type ApiError = {
  error?: string
}

type CloneRepoOption = {
  id: string
  label: string
  url: string
  name?: string
  source: "cursor" | "routing"
}

export function JetsonAgentView({
  configuredRepos,
  cloudRepositories,
  reposError,
  reposLoading,
  onRefreshRepos,
}: {
  configuredRepos: ConfiguredRepo[]
  cloudRepositories: RepositoryOption[]
  reposError: string | null
  reposLoading: boolean
  onRefreshRepos: () => Promise<void>
}) {
  const [status, setStatus] = React.useState<JetsonStatusResponse | null>(null)
  const [tail, setTail] = React.useState("")
  const [selectedRepoPath, setSelectedRepoPath] = React.useState("")
  const [cloneRepoId, setCloneRepoId] = React.useState("")
  const [cloneName, setCloneName] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [action, setAction] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const cloneOptions = React.useMemo(
    () => cloneRepoOptions(cloudRepositories, configuredRepos),
    [cloudRepositories, configuredRepos],
  )
  const selectedCloneRepoId =
    cloneRepoId || (cloneOptions[0] ? cloneOptions[0].id : "")
  const selectedCloneRepo = cloneOptions.find(
    (repo) => repo.id === selectedCloneRepoId,
  )
  const activeRepo = status?.repos.find((repo) => repo.path === status.currentRepo)
  const busy = loading || action !== null

  const loadStatus = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchJson<JetsonStatusResponse>(
        "/api/jetson-agent/status",
      )
      setStatus(next)
      setTail(next.tail ?? "")
      setSelectedRepoPath((current) => {
        if (current && next.repos.some((repo) => repo.path === current)) {
          return current
        }
        return next.currentRepo || next.repos[0]?.path || ""
      })
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load Jetson agent status."))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => void loadStatus(), 0)
    return () => window.clearTimeout(id)
  }, [loadStatus])

  async function refreshTail() {
    setAction("tail")
    setError(null)
    try {
      const next = await fetchJson<JetsonTailResponse>(
        "/api/jetson-agent/tail?lines=220",
      )
      setTail(next.tail ?? "")
    } catch (tailError) {
      setError(errorMessage(tailError, "Could not refresh terminal output."))
    } finally {
      setAction(null)
    }
  }

  async function selectRepo() {
    if (!selectedRepoPath) {
      return
    }
    setAction("select")
    setError(null)
    try {
      const result = await fetchJson<JetsonSelectRepoResponse>(
        "/api/jetson-agent/repo/select",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: selectedRepoPath }),
        },
      )
      setTail(result.tail ?? "")
      await loadStatus()
    } catch (selectError) {
      setError(errorMessage(selectError, "Could not switch Jetson repo."))
    } finally {
      setAction(null)
    }
  }

  async function cloneRepo() {
    if (!selectedCloneRepo) {
      return
    }
    setAction("clone")
    setError(null)
    try {
      const result = await fetchJson<JetsonCloneRepoResponse>(
        "/api/jetson-agent/repo/clone",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: selectedCloneRepo.url,
            name: cloneName.trim() || undefined,
          }),
        },
      )
      setTail(result.tail ?? "")
      setSelectedRepoPath(result.repo.path)
      setCloneName("")
      await loadStatus()
    } catch (cloneError) {
      setError(errorMessage(cloneError, "Could not clone repo on Jetson."))
    } finally {
      setAction(null)
    }
  }

  async function sendPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextPrompt = prompt.trim()
    if (!nextPrompt) {
      return
    }
    setAction("prompt")
    setError(null)
    try {
      const result = await fetchJson<JetsonPromptResponse>(
        "/api/jetson-agent/prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: nextPrompt }),
        },
      )
      setPrompt("")
      setTail(result.tail ?? "")
      await loadStatus()
    } catch (promptError) {
      setError(errorMessage(promptError, "Could not send prompt to Claude."))
    } finally {
      setAction(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TerminalWindowIcon
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
            <h2 className="text-lg font-semibold tracking-tight">
              Jetson agent
            </h2>
            <Badge variant={status ? "secondary" : "outline"}>
              {status ? status.host : loading ? "checking" : "offline"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{status?.sessionName ?? "ai"}</span>
            <span>/</span>
            <span>{status?.windowName ?? "Claude"}</span>
            {activeRepo ? (
              <>
                <span>/</span>
                <span className="font-mono text-xs text-foreground">
                  {activeRepo.name}
                </span>
                {activeRepo.branch ? (
                  <Badge variant="outline">{activeRepo.branch}</Badge>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshTail()}
            disabled={busy}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Tail
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadStatus()}
            disabled={busy}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Prompt Claude</CardTitle>
            <CardDescription>
              Sends text into the persistent tmux Claude window on Jetson.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={sendPrompt}>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Open the current repo, run the relevant tests, and fix the failing authz test."
                className="min-h-36 font-mono text-sm"
                disabled={!status || action === "prompt"}
                required
              />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-xs text-muted-foreground">
                  {status?.currentRepo ?? "No Jetson repo selected"}
                </div>
                <Button
                  type="submit"
                  disabled={!status || !prompt.trim() || busy}
                >
                  <PaperPlaneTiltIcon data-icon="inline-start" />
                  {action === "prompt" ? "Sending…" : "Send"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Jetson repo</CardTitle>
              <CardDescription>
                Switch the tmux Claude window to an existing repo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Select
                items={(status?.repos ?? []).map((repo) => ({
                  label: repo.name,
                  value: repo.path,
                }))}
                value={selectedRepoPath}
                onValueChange={(value) => value && setSelectedRepoPath(value)}
              >
                <SelectTrigger
                  aria-label="Jetson repo"
                  className="w-full"
                  disabled={!status || status.repos.length === 0}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {(status?.repos ?? []).map((repo) => (
                      <SelectItem key={repo.path} value={repo.path}>
                        <span className="flex min-w-0 items-center gap-2">
                          <GitBranchIcon
                            aria-hidden="true"
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="truncate">{repo.name}</span>
                          {repo.branch ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              {repo.branch}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void selectRepo()}
                disabled={!selectedRepoPath || busy}
              >
                <CheckCircleIcon data-icon="inline-start" />
                {action === "select" ? "Opening…" : "Open"}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Clone GitHub repo</CardTitle>
              <CardDescription>
                Pulls a linked repo onto the Jetson SSD.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {reposError && cloneOptions.length === 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {reposError}
                </div>
              ) : null}
              <Select
                items={cloneOptions.map((repo) => ({
                  label: repo.label,
                  value: repo.id,
                }))}
                value={selectedCloneRepoId}
                onValueChange={(value) => value && setCloneRepoId(value)}
              >
                <SelectTrigger
                  aria-label="GitHub repo"
                  className="w-full"
                  disabled={cloneOptions.length === 0 || reposLoading}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {cloneOptions.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{repo.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {repo.source}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                value={cloneName}
                onChange={(event) => setCloneName(event.target.value)}
                placeholder={selectedCloneRepo?.name ?? "folder name"}
                className="font-mono text-sm"
                disabled={!selectedCloneRepo || busy}
              />
            </CardContent>
            <CardFooter className="justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onRefreshRepos()}
                disabled={reposLoading || busy}
              >
                <ArrowClockwiseIcon data-icon="inline-start" />
                Repos
              </Button>
              <Button
                size="sm"
                onClick={() => void cloneRepo()}
                disabled={!selectedCloneRepo || reposLoading || busy}
              >
                <PlusIcon data-icon="inline-start" />
                {action === "clone" ? "Cloning…" : "Clone"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Terminal output</CardTitle>
          <CardDescription>
            Latest captured output from the Claude tmux pane.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre
            className={cn(
              "min-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground",
              !tail && "flex items-center text-muted-foreground",
            )}
          >
            {tail || "No terminal output yet."}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as ApiError

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}.`)
  }

  return payload as T
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function cloneRepoOptions(
  cloudRepositories: RepositoryOption[],
  configuredRepos: ConfiguredRepo[],
): CloneRepoOption[] {
  const seen = new Set<string>()
  const options: CloneRepoOption[] = []

  for (const repo of cloudRepositories) {
    if (!repo.url) {
      continue
    }
    const key = normalizeRepoUrl(repo.url)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    options.push({
      id: `cursor:${repo.id}`,
      label: repo.label || repoNameFromUrl(repo.url),
      url: repo.url,
      name: repo.name,
      source: "cursor",
    })
  }

  for (const repo of configuredRepos) {
    const key = normalizeRepoUrl(repo.url)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    options.push({
      id: `routing:${repo.id}`,
      label: `${repo.owner}/${repo.name}`,
      url: repo.url,
      name: repo.name,
      source: "routing",
    })
  }

  return options
}

function normalizeRepoUrl(url: string) {
  return url.trim().toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "")
}

function repoNameFromUrl(url: string) {
  const clean = url.replace(/\.git$/, "").replace(/\/+$/, "")
  return clean.slice(clean.lastIndexOf("/") + 1).replace(/^.*:/, "")
}
