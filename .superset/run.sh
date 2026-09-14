#!/usr/bin/env bash
# Superset Run button — the Next.js dev server.
#
# Parallel workspaces would all want :3000, so honour $PORT when Superset sets
# one. Next auto-increments off a busy port either way, but an explicit port
# keeps the URL predictable per workspace.
set -euo pipefail

exec npm run dev -- --port "${PORT:-3000}"
