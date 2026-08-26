#!/usr/bin/env bash
# Rebuild the Graft context graph (graft/) including the LLM "meaning" tier.
#
# Model choice: gemini-3.7-flash, PINNED. Not the pipeline's GOOGLE_AI_MODEL,
# and deliberately not the floating gemini-flash-latest alias.
#
# Measured on this repo (212 files):
#   gemini-3.7-flash      1247/1247 symbols, 0 files failed  — clean exit
#   gemini-flash-latest   1251/1254 symbols, 3 files failed  — non-zero exit
#   gemini-2.5-flash      unusable: "model returned no usable symbol summaries"
#   gemini-2.5-pro        404s on the OpenAI-compat endpoint
#
# The alias's 3 failures carry the exact 2.5-flash signature, i.e. the alias can
# drift onto a model with that bug. Without --allow-partial graft exits non-zero
# on any failure, which breaks this script and `graft check` in CI. The summaries
# need schema compliance, not frontier capability, so there is no upside to
# floating. Re-test the alias with:
#   GRAFT_MODEL=gemini-flash-latest npm run graph:graft:deep
#
# Caveat: the two runs above were not perfectly controlled — source files changed
# between them (1248 vs 1254 symbols), so 3 failures could be partly transient.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "error: .env not found — GOOGLE_AI_API_KEY is read from it" >&2
  exit 1
fi

GOOGLE_AI_API_KEY="$(grep '^GOOGLE_AI_API_KEY' .env | cut -d= -f2- | tr -d '"')"
if [ -z "$GOOGLE_AI_API_KEY" ]; then
  echo "error: GOOGLE_AI_API_KEY is empty in .env" >&2
  exit 1
fi

GRAFT_PROVIDER=openai \
GRAFT_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/" \
GRAFT_API_KEY="$GOOGLE_AI_API_KEY" \
GRAFT_MODEL="${GRAFT_MODEL:-gemini-3.7-flash}" \
  graft build . --deep "$@"
