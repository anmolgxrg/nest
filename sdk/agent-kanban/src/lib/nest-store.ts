import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"

type DatabaseSync = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    all?: (...values: unknown[]) => unknown[]
    get?: (...values: unknown[]) => unknown
    run: (...values: unknown[]) => unknown
  }
}

type DatabaseConstructor = new (filename: string) => DatabaseSync

export type AuditActor = {
  role?: string
  sessionId?: string
  userEmail?: string
  userName?: string
}

export type AuditInput = {
  actor?: AuditActor
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

export type SdmTaskInput = {
  actor?: AuditActor
  task: string
  repositoryId: string
  modelId?: string
  branch?: string
}

export type SdaLaunchInput = {
  taskId?: string
  roleId?: string
  roleTitle?: string
  agentId: string
  agentTitle: string
  status: string
}

export type RoutingChangeInput = {
  actor?: AuditActor
  action: "upsert" | "update" | "delete"
  repoId?: number | string
  repoUrl?: string
  jiraProjectKey?: string | null
  description?: string | null
  removed?: boolean
}

export type JetsonAgentLaunchInput = {
  actor?: AuditActor
  title: string
  prompt: string
  repositoryLabel?: string
  repositoryUrl?: string
  branch?: string
  sdmTaskId?: string
  sdaRoleId?: string
  sdaRoleTitle?: string
  tail?: string
}

export type JetsonAgentLaunchRecord = {
  id: string
  created_at: string
  updated_at: string
  created_by_email: string | null
  created_by_name: string | null
  created_by_role: string | null
  title: string
  prompt: string
  repository_label: string
  repository_url: string | null
  branch: string | null
  status: string
  sdm_task_id: string | null
  sda_role_id: string | null
  sda_role_title: string | null
  tail: string | null
}

const storeDir = path.join(os.homedir(), ".agent-kanban")
const dbPath = process.env.NEST_DB_PATH?.trim() || path.join(storeDir, "nest.db")
const require = createRequire(import.meta.url)

let db: DatabaseSync | null = null
let dbUnavailableReason: string | null = null
const memoryJetsonLaunches = new Map<string, JetsonAgentLaunchRecord>()

export function auditEvent(input: AuditInput) {
  const database = getDatabase()
  const id = randomUUID()
  if (!database) {
    return id
  }
  try {
    database.prepare(
      `insert into audit_log (
        id, created_at, actor_email, actor_name, actor_role, session_id,
        action, resource_type, resource_id, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      new Date().toISOString(),
      input.actor?.userEmail ?? null,
      input.actor?.userName ?? null,
      input.actor?.role ?? null,
      input.actor?.sessionId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      JSON.stringify(input.metadata ?? {}),
    )
  } catch (error) {
    disableDatabase(error)
  }
  return id
}

export function createSdmTask(input: SdmTaskInput) {
  const database = getDatabase()
  const id = randomUUID()
  if (database) {
    try {
      database.prepare(
        `insert into sdm_tasks (
          id, created_at, created_by_email, created_by_name, created_by_role,
          task, repository_id, model_id, branch, status
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        new Date().toISOString(),
        input.actor?.userEmail ?? null,
        input.actor?.userName ?? null,
        input.actor?.role ?? null,
        input.task,
        input.repositoryId,
        input.modelId ?? null,
        input.branch ?? null,
        "launching",
      )
    } catch (error) {
      disableDatabase(error)
    }
  }
  auditEvent({
    actor: input.actor,
    action: "sdm_task.create",
    resourceType: "sdm_task",
    resourceId: id,
    metadata: {
      branch: input.branch,
      modelId: input.modelId,
      repositoryId: input.repositoryId,
    },
  })
  return { id }
}

export function recordSdaLaunch(input: SdaLaunchInput) {
  const database = getDatabase()
  const id = randomUUID()
  if (!database) {
    return id
  }

  try {
    database.prepare(
      `insert into sda_launches (
        id, task_id, role_id, role_title, agent_id, agent_title, status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.taskId ?? null,
      input.roleId ?? null,
      input.roleTitle ?? null,
      input.agentId,
      input.agentTitle,
      input.status,
      new Date().toISOString(),
    )

    if (input.taskId) {
      const count = database
        .prepare("select count(*) as count from sda_launches where task_id = ?")
        .get?.(input.taskId) as { count?: number } | undefined
      database
        .prepare("update sdm_tasks set status = ? where id = ?")
        .run((count?.count ?? 0) >= 6 ? "launched" : "launching", input.taskId)
    }
  } catch (error) {
    disableDatabase(error)
  }

  return id
}

export function recordRoutingChange(input: RoutingChangeInput) {
  const database = getDatabase()
  const id = randomUUID()
  if (!database) {
    return id
  }
  try {
    database.prepare(
      `insert into routing_changes (
        id, created_at, actor_email, actor_name, actor_role, session_id,
        action, repo_id, repo_url, jira_project_key, description, removed
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      new Date().toISOString(),
      input.actor?.userEmail ?? null,
      input.actor?.userName ?? null,
      input.actor?.role ?? null,
      input.actor?.sessionId ?? null,
      input.action,
      input.repoId == null ? null : String(input.repoId),
      input.repoUrl ?? null,
      input.jiraProjectKey ?? null,
      input.description ?? null,
      input.removed == null ? null : input.removed ? 1 : 0,
    )
  } catch (error) {
    disableDatabase(error)
  }
  return id
}

export function recordJetsonAgentLaunch(input: JetsonAgentLaunchInput) {
  const database = getDatabase()
  const id = `jetson-${randomUUID()}`
  const now = new Date().toISOString()
  const record: JetsonAgentLaunchRecord = {
    id,
    created_at: now,
    updated_at: now,
    created_by_email: input.actor?.userEmail ?? null,
    created_by_name: input.actor?.userName ?? null,
    created_by_role: input.actor?.role ?? null,
    title: input.title,
    prompt: input.prompt,
    repository_label: input.repositoryLabel ?? "Jetson",
    repository_url: input.repositoryUrl ?? null,
    branch: input.branch?.trim() || null,
    status: "sent",
    sdm_task_id: input.sdmTaskId ?? null,
    sda_role_id: input.sdaRoleId ?? null,
    sda_role_title: input.sdaRoleTitle ?? null,
    tail: input.tail ?? null,
  }
  memoryJetsonLaunches.set(id, record)

  if (!database) {
    return record
  }

  try {
    database.prepare(
      `insert into jetson_agent_launches (
        id, created_at, updated_at, created_by_email, created_by_name,
        created_by_role, title, prompt, repository_label, repository_url,
        branch, status, sdm_task_id, sda_role_id, sda_role_title, tail
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.created_at,
      record.updated_at,
      record.created_by_email,
      record.created_by_name,
      record.created_by_role,
      record.title,
      record.prompt,
      record.repository_label,
      record.repository_url,
      record.branch,
      record.status,
      record.sdm_task_id,
      record.sda_role_id,
      record.sda_role_title,
      record.tail,
    )
    return getJetsonAgentLaunch(id) ?? record
  } catch (error) {
    disableDatabase(error)
    return record
  }
}

export function listJetsonAgentLaunches(): JetsonAgentLaunchRecord[] {
  const database = getDatabase()
  if (database) {
    try {
      return (
        database
          .prepare(
            `select * from jetson_agent_launches
            order by created_at desc
            limit 100`
          )
          .all?.() as JetsonAgentLaunchRecord[] | undefined
      ) ?? []
    } catch (error) {
      disableDatabase(error)
    }
  }

  return Array.from(memoryJetsonLaunches.values())
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 100)
}

function getJetsonAgentLaunch(id: string) {
  const database = getDatabase()
  if (!database) {
    return memoryJetsonLaunches.get(id) ?? null
  }
  const record = database
    .prepare("select * from jetson_agent_launches where id = ?")
    .get?.(id) as JetsonAgentLaunchRecord | undefined
  return record ?? memoryJetsonLaunches.get(id) ?? null
}

function getDatabase() {
  if (db) {
    return db
  }
  if (dbUnavailableReason) {
    return null
  }

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true })
    db = createDatabase(dbPath)
    db.exec("pragma journal_mode = wal")
    db.exec("pragma foreign_keys = on")
    db.exec(`
      create table if not exists audit_log (
        id text primary key,
        created_at text not null,
        actor_email text,
        actor_name text,
        actor_role text,
        session_id text,
        action text not null,
        resource_type text not null,
        resource_id text,
        metadata_json text not null default '{}'
      );

      create table if not exists sdm_tasks (
        id text primary key,
        created_at text not null,
        created_by_email text,
        created_by_name text,
        created_by_role text,
        task text not null,
        repository_id text not null,
        model_id text,
        branch text,
        status text not null
      );

      create table if not exists sda_launches (
        id text primary key,
        task_id text,
        role_id text,
        role_title text,
        agent_id text not null,
        agent_title text not null,
        status text not null,
        created_at text not null,
        foreign key (task_id) references sdm_tasks(id)
      );

      create table if not exists routing_changes (
        id text primary key,
        created_at text not null,
        actor_email text,
        actor_name text,
        actor_role text,
        session_id text,
        action text not null,
        repo_id text,
        repo_url text,
        jira_project_key text,
        description text,
        removed integer
      );

      create table if not exists jetson_agent_launches (
        id text primary key,
        created_at text not null,
        updated_at text not null,
        created_by_email text,
        created_by_name text,
        created_by_role text,
        title text not null,
        prompt text not null,
        repository_label text not null,
        repository_url text,
        branch text,
        status text not null,
        sdm_task_id text,
        sda_role_id text,
        sda_role_title text,
        tail text,
        foreign key (sdm_task_id) references sdm_tasks(id)
      );

      create index if not exists idx_audit_log_created_at
        on audit_log(created_at);
      create index if not exists idx_sdm_tasks_created_at
        on sdm_tasks(created_at);
      create index if not exists idx_sda_launches_task_id
        on sda_launches(task_id);
      create index if not exists idx_routing_changes_created_at
        on routing_changes(created_at);
      create index if not exists idx_routing_changes_repo_id
        on routing_changes(repo_id);
      create index if not exists idx_jetson_agent_launches_created_at
        on jetson_agent_launches(created_at);
      create index if not exists idx_jetson_agent_launches_sdm_task_id
        on jetson_agent_launches(sdm_task_id);
    `)
    return db
  } catch (error) {
    disableDatabase(error)
    return null
  }
}

function createDatabase(filename: string): DatabaseSync {
  try {
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: DatabaseConstructor
    }
    return new DatabaseSync(filename)
  } catch {
    return new SqliteCliDatabase(filename)
  }
}

class SqliteCliDatabase implements DatabaseSync {
  constructor(private filename: string) {}

  exec(sql: string) {
    this.call([], sql)
  }

  prepare(sql: string) {
    return {
      all: (...values: unknown[]) => this.query(sql, values),
      get: (...values: unknown[]) => {
        const rows = this.query(sql, values)
        return rows[0]
      },
      run: (...values: unknown[]) => {
        this.call([], bindSql(sql, values))
      },
    }
  }

  private query(sql: string, values: unknown[]) {
    const output = this.call(["-json"], bindSql(sql, values))
    if (!output.trim()) {
      return []
    }
    return JSON.parse(output) as unknown[]
  }

  private call(args: string[], input: string) {
    const result = spawnSync("sqlite3", [...args, this.filename], {
      encoding: "utf8",
      input,
      maxBuffer: 1024 * 1024,
    })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "sqlite3 command failed")
    }
    return result.stdout
  }
}

function bindSql(sql: string, values: unknown[]) {
  let index = 0
  return sql.replace(/\?/g, () => {
    if (index >= values.length) {
      throw new Error("Not enough SQLite bind values.")
    }
    return quoteSqlValue(values[index++])
  })
}

function quoteSqlValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null"
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot bind a non-finite number to SQLite.")
    }
    return String(value)
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0"
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

function disableDatabase(error: unknown) {
  db = null
  dbUnavailableReason =
    error instanceof Error ? error.message : "SQLite store is unavailable."
  console.error(`NEST SQLite store disabled: ${dbUnavailableReason}`)
}
