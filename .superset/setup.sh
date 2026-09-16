#!/usr/bin/env bash
# Superset workspace setup — runs once per new worktree, from the worktree root.
#
# Deliberately does NOT run prisma migrate/db push: DATABASE_URL points at a
# shared remote Neon instance, so a migration here would mutate the database
# every other workspace (and prod) is using. Schema changes stay a manual,
# deliberate `prisma migrate deploy`.
set -euo pipefail

ROOT="${SUPERSET_ROOT_PATH:-}"

# --- 1. env ---------------------------------------------------------------
# .env is gitignored, so a fresh worktree has none. Copy the main checkout's.
if [ -f .env ]; then
  echo "✓ .env already present"
elif [ -n "$ROOT" ] && [ -f "$ROOT/.env" ]; then
  cp "$ROOT/.env" .env
  echo "✓ copied .env from $ROOT"
elif [ -f .env.example ]; then
  cp .env.example .env
  echo "⚠ no .env in the main checkout — seeded from .env.example."
  echo "  Scraping, AI and affiliate calls will fail until keys are filled in."
else
  echo "⚠ no .env and no .env.example — the app will not boot"
fi

# --- 2. dependencies ------------------------------------------------------
# Fast path: when the lockfile is byte-identical to the main checkout's, the
# dependency tree is identical too, so an APFS clone (cp -c, copy-on-write) of
# its node_modules is both correct and near-instant. Anything else falls back
# to a real install.
install_deps() {
  if [ -d node_modules ]; then
    echo "✓ node_modules already present"
    return
  fi

  if [ -n "$ROOT" ] && [ -d "$ROOT/node_modules" ] &&
     cmp -s package-lock.json "$ROOT/package-lock.json"; then
    echo "→ lockfile matches the main checkout; cloning its node_modules"
    if cp -Rc "$ROOT/node_modules" node_modules 2>/dev/null; then
      echo "✓ cloned node_modules (copy-on-write)"
      return
    fi
    echo "⚠ clone failed; falling back to a clean install"
    rm -rf node_modules
  fi

  echo "→ npm ci"
  npm ci --no-audit --no-fund || {
    echo "⚠ npm ci failed (lockfile drift?); falling back to npm install"
    npm install --no-audit --no-fund
  }
}
install_deps

# --- 3. prisma client -----------------------------------------------------
# package.json's postinstall covers the npm ci path, but a cloned node_modules
# carries the main checkout's client, which may be built from a different
# schema.prisma on a different branch. Regenerating is ~2s and always correct.
npx --no-install prisma generate

echo "✓ workspace ready — use the Run button for the dev server"
