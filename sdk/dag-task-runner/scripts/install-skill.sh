#!/usr/bin/env bash
# Install the DAG task runner as a personal Cursor skill at ~/.cursor/skills/dag-task-runner/.
#
# After install, the skill is available from any Cursor workspace and the agent
# can invoke the runner from `${DAG_RUNNER_DIR}/src/run_dag.ts`.
#
# Usage:
#   ./scripts/install-skill.sh                # install / update at the default location
#   DEST=~/some/other/skill ./scripts/install-skill.sh
#   ./scripts/install-skill.sh --no-install   # copy files but skip dependency install

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${DEST:-$HOME/.cursor/skills/dag-task-runner}"
SKIP_INSTALL="false"
for arg in "$@"; do
  case "$arg" in
    --no-install) SKIP_INSTALL="true" ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "[install-skill] source: $REPO_ROOT"
echo "[install-skill] dest:   $DEST"

mkdir -p "$DEST/scripts"
cp "$REPO_ROOT/skill/SKILL.md" "$DEST/SKILL.md"
cp -R "$REPO_ROOT/examples" "$DEST/"
cp -R "$REPO_ROOT/src/." "$DEST/scripts/"
cp "$REPO_ROOT/package.json" "$DEST/scripts/package.json"
cp "$REPO_ROOT/tsconfig.json" "$DEST/scripts/tsconfig.json"

if [[ "$SKIP_INSTALL" == "true" ]]; then
  echo "[install-skill] skipping dependency install (--no-install)"
else
  echo "[install-skill] installing dependencies in $DEST/scripts"
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$DEST/scripts" && pnpm install --silent)
  else
    (cd "$DEST/scripts" && npm install --silent)
  fi
fi

cat <<EOF

[install-skill] done.

Skill installed at: $DEST
To use it from another workspace, set DAG_RUNNER_DIR if you didn't use the default:

  export DAG_RUNNER_DIR="$DEST/scripts"

Then in any Cursor chat, ask the agent to "decompose this task as a DAG" and it
will pick up the skill automatically.
EOF
