# Cursor SDK Agent Kanban

A Linear-style board for Cursor Cloud Agents. It uses the Cursor SDK to list
cloud agents, group them into kanban columns, preview artifacts on cards, and
create new cloud agents from a repository and prompt.

This example demonstrates:

- required API-key onboarding before any Cloud Agent data loads,
- cloud-agent listing with grouping by status, repository, branch, or created
  date,
- agent cards with status, repo/branch metadata, latest activity, PR link, and
  artifact previews,
- create-agent flows backed by `Agent.create({ cloud: { repos } })`,
- authenticated artifact media previews proxied through local API routes.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open the local Next.js URL and complete onboarding by entering a Cursor API key
from the [Cursor integrations dashboard](https://cursor.com/dashboard/integrations).
If you keep "Remember this key" checked, the key is stored locally at
`~/.agent-kanban/settings.json`; otherwise it is kept only in the in-memory app
session.

## Jetson Agent

The sidebar includes a Jetson agent page that proxies to the persistent Claude
tmux console on `jensen`. Start the local tunnel and run Next with the Jetson
console token:

```bash
ssh -N -L 8787:127.0.0.1:8787 jensen
export JETSON_AGENT_TOKEN="$(ssh jensen '~/.local/bin/agent-console-token')"
export JETSON_AGENT_BASE_URL="http://127.0.0.1:8787"
pnpm dev
```

The token stays on the Next.js server. The browser talks only to
`/api/jetson-agent/*`. The clone picker uses linked Cursor/GitHub repositories
and also includes the Routing page repositories when `BRIDGE_URL` and
`BRIDGE_ADMIN_TOKEN` are configured.

### CLI

Install the local shims once:

```bash
./scripts/cloud-agent install
```

Then attach or send prompts from any shell:

```bash
cloud-agent
cloud agent status
cloud agent prompt "Open ChefOS, run the relevant tests, and summarize failures."
cloud agent tail 80
cloud agent tunnel
```

The CLI uses SSH to `jensen` and the existing tmux/helper scripts on Jetson. It
does not store or print the web-console token unless you explicitly run
`cloud agent token`.

## Notes

Repository listing is rate-limited by the Cloud Agents API and is cached briefly
in memory. Artifact previews are fetched through authenticated local API routes,
so refresh the board if a preview stops loading.
