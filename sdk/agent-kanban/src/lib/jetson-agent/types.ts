export interface ConfiguredRepo {
  id: number
  owner: string
  name: string
  url: string
  jira_project_key: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface JetsonRepo {
  name: string
  path: string
  branch?: string
}

export interface JetsonStatusResponse {
  ok: boolean
  host: string
  sessionName: string
  windowName: string
  currentRepo: string
  repos: JetsonRepo[]
  windows: string[]
  tail: string
}

export interface JetsonTailResponse {
  tail: string
}

export interface JetsonPromptResponse {
  ok: boolean
  repo: string
  tail: string
}

export interface JetsonSelectRepoResponse {
  ok: boolean
  currentRepo: string
  tail: string
}

export interface JetsonCloneRepoResponse {
  ok: boolean
  repo: {
    url: string
    name: string
    path: string
    output: string
  }
  tail: string
}
