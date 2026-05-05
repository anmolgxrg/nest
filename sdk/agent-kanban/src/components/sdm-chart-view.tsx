"use client"

import * as React from "react"
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  PlayIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  AgentCard,
  CreateAgentResponse,
  ModelOption,
  RepositoryOption,
} from "@/lib/agents/types"
import { cn } from "@/lib/utils"

type TeamStatus = "idle" | "assigned" | "active"

type SdaRole = {
  id: string
  title: string
  shortTitle: string
  specialty: string
  responsibility: string
  output: string
  tone: string
}

type SdaNode = SdaRole & {
  status: "standby" | "briefed" | "running"
  brief: string
}

type LaunchRecord = {
  roleId: string
  agentId: string
  title: string
}

type Point = {
  x: number
  y: number
}

const graphPositions: Record<string, Point> = {
  sdm: { x: 27, y: 50 },
  product: { x: 66, y: 13 },
  ux: { x: 84, y: 31 },
  frontend: { x: 86, y: 69 },
  backend: { x: 66, y: 87 },
  data: { x: 48, y: 70 },
  security: { x: 48, y: 30 },
}

const sdaRoles: SdaRole[] = [
  {
    id: "product",
    title: "Product Lead SDA",
    shortTitle: "Product",
    specialty: "Scope, milestones, acceptance criteria",
    responsibility: "Turns the request into a sequence of product decisions.",
    output: "Definition of done",
    tone: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  },
  {
    id: "ux",
    title: "UX Systems SDA",
    shortTitle: "UX",
    specialty: "Flows, hierarchy, interaction states",
    responsibility: "Shapes the product experience and edge-case behavior.",
    output: "Interaction model",
    tone: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  },
  {
    id: "frontend",
    title: "Frontend SDA",
    shortTitle: "Frontend",
    specialty: "React, canvas, state, responsive UI",
    responsibility: "Builds the user-facing workflow and visual surface.",
    output: "Interface plan",
    tone: "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200",
  },
  {
    id: "backend",
    title: "Backend SDA",
    shortTitle: "Backend",
    specialty: "APIs, orchestration, event contracts",
    responsibility: "Defines the service shape for launching and tracking agents.",
    output: "API contract",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  },
  {
    id: "data",
    title: "Data SDA",
    shortTitle: "Data",
    specialty: "Persistence, schemas, lineage",
    responsibility: "Designs the durable model for SDMs, SDAs, and assignments.",
    output: "State model",
    tone: "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
  },
  {
    id: "security",
    title: "Security SDA",
    shortTitle: "Security",
    specialty: "Permissions, isolation, review gates",
    responsibility: "Keeps delegated agent work bounded, auditable, and reviewable.",
    output: "Risk controls",
    tone: "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  },
]

const sampleTask =
  "Create a production-ready product feature from a ticket: clarify scope, design the UI, implement app and data changes, check security, and prepare the release."

export function SdmChartView({
  sessionId,
  repositories,
  models,
  canCreateAgents,
  onAgentCreated,
}: {
  sessionId: string
  repositories: RepositoryOption[]
  models: ModelOption[]
  canCreateAgents: boolean
  onAgentCreated: (agent: AgentCard) => Promise<void>
}) {
  const [draftTask, setDraftTask] = React.useState(sampleTask)
  const [activeTask, setActiveTask] = React.useState("")
  const [status, setStatus] = React.useState<TeamStatus>("idle")
  const [selectedSdaId, setSelectedSdaId] = React.useState(sdaRoles[0].id)
  const [repositoryId, setRepositoryId] = React.useState(repositories[0]?.id ?? "")
  const [modelId, setModelId] = React.useState(models[0]?.id ?? "")
  const [branch, setBranch] = React.useState("main")
  const [launching, setLaunching] = React.useState(false)
  const [launchError, setLaunchError] = React.useState<string | null>(null)
  const [launchedAgents, setLaunchedAgents] = React.useState<LaunchRecord[]>([])

  const nodes = React.useMemo(
    () =>
      sdaRoles.map<SdaNode>((role) => ({
        ...role,
        status:
          status === "active"
            ? "running"
            : status === "assigned"
              ? "briefed"
              : "standby",
        brief: buildBrief(role, activeTask || draftTask),
      })),
    [activeTask, draftTask, status],
  )
  const selectedNode =
    nodes.find((node) => node.id === selectedSdaId) ?? nodes[0]
  const capacity = status === "active" ? 6 : status === "assigned" ? 0 : 0
  const selectedRepositoryId = repositoryId || repositories[0]?.id || ""
  const selectedModelId = modelId || models[0]?.id || ""
  const hasModels = models.length > 0
  const canLaunch =
    !launching &&
    canCreateAgents &&
    Boolean(sessionId) &&
    Boolean(selectedRepositoryId) &&
    Boolean((activeTask || draftTask).trim())

  function assignTask() {
    const nextTask = draftTask.trim()
    if (!nextTask) {
      return
    }
    setActiveTask(nextTask)
    setStatus("assigned")
  }

  function spinUpTeam() {
    if (!activeTask && draftTask.trim()) {
      setActiveTask(draftTask.trim())
    }
    setStatus("active")
  }

  function resetChart() {
    setStatus("idle")
    setActiveTask("")
    setSelectedSdaId(sdaRoles[0].id)
    setLaunchError(null)
    setLaunchedAgents([])
  }

  async function launchCloudSdas() {
    const task = (activeTask || draftTask).trim()
    if (!task || !selectedRepositoryId) {
      return
    }

    setStatus("active")
    setActiveTask(task)
    setLaunching(true)
    setLaunchError(null)
    setLaunchedAgents([])

    try {
      const sdmTask = await createSdmTaskRecord({
        sessionId,
        task,
        repositoryId: selectedRepositoryId,
        modelId: hasModels ? selectedModelId : "",
        branch,
      })
      const created: LaunchRecord[] = []
      for (const role of sdaRoles) {
        const response = await createCloudAgent({
          sessionId,
          sdmTaskId: sdmTask.id,
          role,
          task,
          repositoryId: selectedRepositoryId,
          modelId: hasModels ? selectedModelId : "",
          branch,
        })
        created.push({
          roleId: role.id,
          agentId: response.agent.id,
          title: response.agent.title,
        })
        setLaunchedAgents([...created])
        await onAgentCreated(response.agent)
      }
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Failed to launch SDAs.",
      )
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 xl:grid xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-3">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">SDM assignment</CardTitle>
                <CardDescription>
                  One SDM coordinates six specialist SDAs.
                </CardDescription>
              </div>
              <Badge variant={status === "active" ? "secondary" : "outline"}>
                {capacity}/6 active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Task
              <Textarea
                value={draftTask}
                onChange={(event) => setDraftTask(event.target.value)}
                className="min-h-36 resize-none"
                placeholder="Assign the SDM a product task..."
              />
            </label>
            <div className={cn("grid gap-3", hasModels && "md:grid-cols-2")}>
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                Repository
                <Select
                  items={repositories.map((repository) => ({
                    label: repository.label,
                    value: repository.id,
                  }))}
                  value={selectedRepositoryId}
                  onValueChange={(value) => {
                    if (value) {
                      setRepositoryId(value)
                    }
                  }}
                >
                  <SelectTrigger aria-label="Repository" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {repositories.map((repository) => (
                        <SelectItem key={repository.id} value={repository.id}>
                          {repository.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>

              {hasModels ? (
                <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                  Model
                  <Select
                    items={models.map((model) => ({
                      label: model.label,
                      value: model.id,
                    }))}
                    value={selectedModelId}
                    onValueChange={(value) => {
                      if (value) {
                        setModelId(value)
                      }
                    }}
                  >
                    <SelectTrigger aria-label="Model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectGroup>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Branch
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                className="h-8 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="main"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={assignTask} disabled={!draftTask.trim()}>
                <PaperPlaneTiltIcon data-icon="inline-start" />
                Assign
              </Button>
              <Button
                variant="secondary"
                onClick={spinUpTeam}
                disabled={!draftTask.trim() && !activeTask}
              >
                <PlayIcon data-icon="inline-start" />
                Spin up
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => void launchCloudSdas()}
              disabled={!canLaunch}
            >
              <UsersThreeIcon data-icon="inline-start" />
              {launching
                ? "Launching SDAs..."
                : canCreateAgents
                  ? "Launch 6 cloud SDAs"
                  : "Operator access required"}
            </Button>
            <Button variant="ghost" onClick={resetChart}>
              <ArrowClockwiseIcon data-icon="inline-start" />
              Reset chart
            </Button>
            {repositories.length === 0 ? (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                No linked repositories are available for cloud launch.
              </div>
            ) : null}
            {launchError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {launchError}
              </div>
            ) : null}
            {launchedAgents.length > 0 ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Launched agents
                </div>
                <div className="mt-2 flex flex-col gap-1 text-xs">
                  {launchedAgents.map((agent) => (
                    <div
                      key={agent.agentId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{agent.title}</span>
                      <Badge variant="outline">
                        {sdaRoles.find((role) => role.id === agent.roleId)
                          ?.shortTitle ?? "SDA"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <section className="grid grid-cols-3 gap-2 xl:grid-cols-2">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              aria-pressed={selectedNode.id === node.id}
              onClick={() => setSelectedSdaId(node.id)}
              className={cn(
                "flex min-h-20 flex-col justify-between rounded-lg border bg-card p-2 text-left text-xs shadow-sm transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring",
                selectedNode.id === node.id && "border-foreground",
              )}
            >
              <span className="font-medium">{node.shortTitle}</span>
              <span className="text-muted-foreground">{node.output}</span>
            </button>
          ))}
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{selectedNode.title}</CardTitle>
                <CardDescription>{selectedNode.specialty}</CardDescription>
              </div>
              <NodeStatusBadge status={selectedNode.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Responsibility
              </div>
              <p className="mt-1 text-muted-foreground">
                {selectedNode.responsibility}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Current brief
              </div>
              <p className="mt-1">{selectedNode.brief}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="min-h-[640px] min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <UsersThreeIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <h2 className="truncate text-sm font-medium">SDM chart</h2>
          </div>
          <div className="flex items-center gap-2">
            <NodeStatusBadge
              status={
                status === "active"
                  ? "running"
                  : status === "assigned"
                    ? "briefed"
                    : "standby"
              }
            />
            <Badge variant="outline">6 SDA slots</Badge>
          </div>
        </div>
        <SdmCanvas
          nodes={nodes}
          activeTask={activeTask}
          status={status}
          selectedSdaId={selectedNode.id}
          onSelectSda={setSelectedSdaId}
        />
      </section>
    </div>
  )
}

function SdmCanvas({
  nodes,
  activeTask,
  status,
  selectedSdaId,
  onSelectSda,
}: {
  nodes: SdaNode[]
  activeTask: string
  status: TeamStatus
  selectedSdaId: string
  onSelectSda: (id: string) => void
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ width: 900, height: 580 })

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return
      }
      setSize({
        width: Math.max(640, Math.round(entry.contentRect.width)),
        height: Math.max(580, Math.round(entry.contentRect.height)),
      })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext("2d")
    if (!context) {
      return
    }
    drawGraph(context, size, status)
  }, [size, status])

  const sdmLabel =
    status === "active"
      ? "Orchestrating six SDAs"
      : status === "assigned"
        ? "Task assigned"
        : "Ready for assignment"

  return (
    <div ref={hostRef} className="relative h-[calc(100%-3rem)] min-h-[580px]">
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      />

      <div
        className="absolute w-64 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur"
        style={positionStyle(graphPositions.sdm)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              SDM
            </div>
            <div className="mt-1 text-base font-semibold">
              Software Delivery Manager
            </div>
          </div>
          <Badge variant={status === "active" ? "secondary" : "outline"}>
            {status === "active" ? "6/6" : "0/6"}
          </Badge>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
          {activeTask || sdmLabel}
        </p>
      </div>

      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelectSda(node.id)}
          className={cn(
            "absolute w-56 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background/95 p-3 text-left shadow-sm backdrop-blur transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring",
            selectedSdaId === node.id && "ring-2 ring-foreground/70",
          )}
          style={positionStyle(graphPositions[node.id])}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{node.title}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {node.specialty}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                node.tone,
              )}
            >
              {node.shortTitle}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <NodeStatusBadge status={node.status} />
            {node.status === "running" ? (
              <CheckCircleIcon
                aria-hidden="true"
                className="size-4 text-emerald-600"
              />
            ) : null}
          </div>
        </button>
      ))}
    </div>
  )
}

function NodeStatusBadge({ status }: { status: SdaNode["status"] }) {
  const label =
    status === "running" ? "running" : status === "briefed" ? "briefed" : "standby"
  const variant =
    status === "running" ? "secondary" : status === "briefed" ? "outline" : "ghost"
  return <Badge variant={variant}>{label}</Badge>
}

function drawGraph(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  status: TeamStatus,
) {
  const ratio = window.devicePixelRatio || 1
  const canvas = context.canvas
  canvas.width = size.width * ratio
  canvas.height = size.height * ratio
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, size.width, size.height)

  context.fillStyle = "rgba(120, 120, 120, 0.035)"
  for (let x = 0; x < size.width; x += 32) {
    context.fillRect(x, 0, 1, size.height)
  }
  for (let y = 0; y < size.height; y += 32) {
    context.fillRect(0, y, size.width, 1)
  }

  const sdm = toPixels(graphPositions.sdm, size)
  const active = status === "active"
  const assigned = status !== "idle"

  for (const role of sdaRoles) {
    const target = toPixels(graphPositions[role.id], size)
    const gradient = context.createLinearGradient(sdm.x, sdm.y, target.x, target.y)
    gradient.addColorStop(
      0,
      active ? "rgba(20, 184, 166, 0.72)" : "rgba(115, 115, 115, 0.32)",
    )
    gradient.addColorStop(
      1,
      assigned ? "rgba(59, 130, 246, 0.54)" : "rgba(115, 115, 115, 0.18)",
    )
    context.strokeStyle = gradient
    context.lineWidth = active ? 2.5 : 1.5
    context.beginPath()
    context.moveTo(sdm.x, sdm.y)
    const controlX = sdm.x + (target.x - sdm.x) * 0.58
    context.bezierCurveTo(controlX, sdm.y, controlX, target.y, target.x, target.y)
    context.stroke()

    context.fillStyle = active
      ? "rgba(20, 184, 166, 0.88)"
      : assigned
        ? "rgba(59, 130, 246, 0.62)"
        : "rgba(120, 120, 120, 0.3)"
    context.beginPath()
    context.arc(target.x, target.y, active ? 4 : 3, 0, Math.PI * 2)
    context.fill()
  }

  context.strokeStyle = active
    ? "rgba(20, 184, 166, 0.36)"
    : "rgba(120, 120, 120, 0.2)"
  context.lineWidth = 1
  context.beginPath()
  context.arc(sdm.x, sdm.y, 112, 0, Math.PI * 2)
  context.stroke()
}

function positionStyle(point: Point): React.CSSProperties {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
  }
}

function toPixels(
  point: Point,
  size: { width: number; height: number },
): Point {
  return {
    x: (point.x / 100) * size.width,
    y: (point.y / 100) * size.height,
  }
}

function buildBrief(role: SdaRole, task: string) {
  const normalizedTask = task.trim() || "the assigned product task"
  const taskText =
    normalizedTask.length > 120
      ? `${normalizedTask.slice(0, 117).trim()}...`
      : normalizedTask

  switch (role.id) {
    case "product":
      return `Frame "${taskText}" into milestones, acceptance criteria, launch blockers, and a release decision.`
    case "ux":
      return `Map "${taskText}" into the primary workflow, empty states, error states, and review-ready interaction details.`
    case "frontend":
      return `Build the interactive surface for "${taskText}" with resilient state, responsive layout, and clean user feedback.`
    case "backend":
      return `Define the orchestration contract for "${taskText}", including assignment events, agent lifecycle, and failure handling.`
    case "data":
      return `Model durable records for "${taskText}": SDM assignment, SDA slots, task briefs, status, artifacts, and audit trail.`
    case "security":
      return `Review "${taskText}" for repo access, prompt boundaries, token exposure, permission checks, and release risks.`
    default:
      return `Contribute specialist work for "${taskText}".`
  }
}

async function createCloudAgent({
  sessionId,
  sdmTaskId,
  role,
  task,
  repositoryId,
  modelId,
  branch,
}: {
  sessionId: string
  sdmTaskId: string
  role: SdaRole
  task: string
  repositoryId: string
  modelId: string
  branch: string
}): Promise<CreateAgentResponse> {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-kanban-session": sessionId,
    },
    body: JSON.stringify({
      name: `SDA ${role.shortTitle}: ${taskTitle(task)}`,
      prompt: buildCloudPrompt(role, task),
      repositoryId,
      ...(modelId ? { modelId } : {}),
      branch: branch.trim() || "main",
      autoCreatePR: true,
      sdmTaskId,
      sdaRoleId: role.id,
      sdaRoleTitle: role.title,
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as
    | CreateAgentResponse
    | { error?: string }

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : `Failed to create ${role.shortTitle} SDA.`,
    )
  }

  return payload as CreateAgentResponse
}

function buildCloudPrompt(role: SdaRole, task: string) {
  return [
    `You are the ${role.title} in a six-agent SDA team coordinated by an SDM.`,
    `Specialty: ${role.specialty}.`,
    `Primary responsibility: ${role.responsibility}`,
    `Expected output: ${role.output}.`,
    "",
    "Shared SDM assignment:",
    task,
    "",
    "Work only on your specialty. Keep changes focused, preserve unrelated work, and leave clear notes for the SDM and peer SDAs.",
  ].join("\n")
}

async function createSdmTaskRecord({
  sessionId,
  task,
  repositoryId,
  modelId,
  branch,
}: {
  sessionId: string
  task: string
  repositoryId: string
  modelId: string
  branch: string
}) {
  const response = await fetch("/api/sdm/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-kanban-session": sessionId,
    },
    body: JSON.stringify({
      task,
      repositoryId,
      ...(modelId ? { modelId } : {}),
      branch: branch.trim() || "main",
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as
    | { task?: { id?: string }; error?: string }
    | undefined

  if (!response.ok || !payload?.task?.id) {
    throw new Error(payload?.error ?? "Failed to create the SDM task record.")
  }

  return { id: payload.task.id }
}

function taskTitle(task: string) {
  const collapsed = task.replace(/\s+/g, " ").trim()
  if (!collapsed) {
    return "product task"
  }
  return collapsed.length > 54 ? `${collapsed.slice(0, 51).trim()}...` : collapsed
}
