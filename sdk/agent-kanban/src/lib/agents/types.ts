export type PublicUser = {
  name: string
  email?: string
}

export type AppRole = "admin" | "operator" | "viewer"

export type AppPermissions = {
  createAgents: boolean
  manageRouting: boolean
  useJetsonAgent: boolean
  viewAgents: boolean
}

export type PublicSession = {
  id: string
  user: PublicUser | null
  hasPersistedKey: boolean
  role: AppRole
  permissions: AppPermissions
}

export type ModelOption = {
  id: string
  label: string
  description?: string
}

export type RepositoryOption = {
  id: string
  label: string
  url: string
  owner?: string
  name?: string
  defaultBranch?: string
}

export type ArtifactPreview = {
  path: string
  name: string
  size?: number
  contentType?: string
  mediaUrl?: string
  previewKind: "image" | "video" | "file"
}

export type AgentCard = {
  id: string
  title: string
  status: string
  latestRunId?: string
  durationMs?: number
  repository: string
  repositoryUrl?: string
  branch?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  prUrl?: string
  latestMessage?: string
  artifacts: ArtifactPreview[]
}

export type AgentListResponse = {
  agents: AgentCard[]
  nextCursor?: string
}

export type CreateAgentInput = {
  name?: string
  prompt: string
  repositoryId: string
  modelId?: string
  branch?: string
  autoCreatePR?: boolean
  sdmTaskId?: string
  sdaRoleId?: string
  sdaRoleTitle?: string
}

export type CreateAgentResponse = {
  agent: AgentCard
}
