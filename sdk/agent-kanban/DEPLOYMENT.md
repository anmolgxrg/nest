# Agent Kanban Deployment

Production currently runs on `trc3` from `/srv/cookbook/sdk/agent-kanban` under
the `agent-kanban` systemd unit. The working tree should stay on `main`.

## Required Gates

Run these before deploying:

```bash
pnpm -C sdk/agent-kanban install --frozen-lockfile
pnpm -C sdk/agent-kanban run typecheck
pnpm -C sdk/agent-kanban run lint
pnpm -C sdk/agent-kanban test
pnpm -C sdk/agent-kanban run build
```

The GitHub workflows mirror the same gate:

- `.github/workflows/agent-kanban-ci.yml` runs on PRs and pushes to `main`.
- `.github/workflows/agent-kanban-deploy.yml` runs manually and deploys only
  after typecheck, lint, test, and build pass.

## Runtime State

NEST writes durable operational state to SQLite. By default the database lives
at `~/.agent-kanban/nest.db`; set `NEST_DB_PATH` in production if the database
should live in a mounted backup directory.

The database records:

- `sdm_tasks` for SDM task requests.
- `sda_launches` for the six launched Software Development Agents.
- `jetson_agent_launches` for browser-launched Jetson work.
- `routing_changes` for repository/Jira routing mutations.
- `audit_log` for sessions, agent creation, routing views, and routing writes.

## RBAC

Authentication is still Cursor API-key based, but authorization is role based.
Set these environment variables on `trc3` for shared-company use:

```bash
NEST_ADMIN_EMAILS="founder@example.com,lead@example.com"
NEST_OPERATOR_EMAILS="engineer@example.com"
NEST_VIEWER_EMAILS="observer@example.com"
NEST_ALLOWED_DOMAINS="example.com"
NEST_DEFAULT_ROLE="operator"
```

If no RBAC allowlist variables are set, NEST keeps local single-user behavior
and treats a valid Cursor user as `admin`.

## Jetson Agent

Jetson launches require both server-side variables:

```bash
JETSON_AGENT_BASE_URL="http://127.0.0.1:<forwarded-agent-console-port>"
JETSON_AGENT_TOKEN="<token from ssh jensen '~/.local/bin/agent-console-token'>"
```

Do not point `JETSON_AGENT_BASE_URL` at the bridge service. `BRIDGE_URL` and
`JETSON_AGENT_BASE_URL` are separate services even if they have historically
used nearby ports.

The `cloud-agent` helper defaults `CLOUD_AGENT_DANGEROUS_PERMISSIONS=1`, which
starts Claude/Codex with non-interactive permission bypass flags when possible.
Set it to `0` only for manual sessions where a human can answer CLI prompts.

## Rollback

Use the manual deploy workflow and set `rollback_ref` to a known-good commit on
`main`. The workflow checks out `main` on `trc3`, resets it to that ref, runs the
same gates, restarts `agent-kanban`, and health-checks `http://127.0.0.1:3210/`.

Manual server fallback:

```bash
ssh trc3
cd /srv/cookbook
git fetch origin --tags
git checkout main
git reset --hard <known-good-ref>
pnpm -C sdk/agent-kanban install --frozen-lockfile
pnpm -C sdk/agent-kanban run typecheck
pnpm -C sdk/agent-kanban run lint
pnpm -C sdk/agent-kanban test
pnpm -C sdk/agent-kanban run build
systemctl restart agent-kanban
curl -fsS http://127.0.0.1:3210/ >/dev/null
```
