#!/usr/bin/env bash
# Superset workspace teardown — runs when the workspace is deleted.
#
# There are no containers or local services to stop: the database is a remote
# Neon instance shared with every other workspace, so teardown must not touch
# it. All that is left is local state, and the only piece that matters is the
# copied .env — Superset removes the worktree, but a stray secrets file should
# never outlive the workspace if removal is interrupted.
set -euo pipefail

rm -f .env
rm -rf .next tsconfig.tsbuildinfo

echo "✓ workspace-local build artifacts and .env removed"
