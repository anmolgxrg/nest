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

const storeDir = path.join(os.homedir(), ".agent-kanban")
const dbPath = process.env.NEST_DB_PATH?.trim() || path.join(storeDir, "nest.db")
const require = createRequire(import.meta.url)

let db: DatabaseSync | null = null

export function auditEvent(input: AuditInput) {
  const database = getDatabase()
  const id = randomUUID()
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
  return id
}

export function createSdmTask(input: SdmTaskInput) {
  const database = getDatabase()
  const id = randomUUID()
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

  return id
}

export function recordRoutingChange(input: RoutingChangeInput) {
  const database = getDatabase()
  const id = randomUUID()
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
  return id
}

function getDatabase() {
  if (db) {
    return db
  }

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
  `)
  return db
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
