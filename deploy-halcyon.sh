#!/bin/bash

#
# ------------------------------------------------------------
# DEPLOY SCRIPT — halcyon
# ------------------------------------------------------------
#
# ONE-TIME SERVER SETUP (ks-b):
#
# 1) Create releases directory:
#    sudo mkdir -p /var/www/halcyon/releases
#
# 2) Create initial symlink (required for first deploy):
#    sudo ln -s /var/www/halcyon/releases /var/www/halcyon/current
#
# 3) Ensure nginx serves the "current" symlink. The app has its own
#    subdomain, so this is a server block of its own rather than a
#    location under the studio site:
#    server {
#        server_name halcyon.1991computer.com;
#        root /var/www/halcyon/current;
#        index index.html;
#        try_files $uri $uri/ /index.html;
#    }
#
# After any nginx configuration change:
#    sudo nginx -t && sudo systemctl reload nginx
#
# ------------------------------------------------------------
# USAGE:
#   ./deploy-halcyon.sh
#   ./deploy-halcyon.sh rollback
#
# NOTES:
# - This script performs a local Vite build, uploads the dist/
#   folder via rsync, and switches releases atomically.
# - Rollback is supported via symlink switching.
# - Every outcome is reported to Zeus — success, failure and both
#   kinds of rollback. See "Reporting to Zeus" below and the
#   contract in Zeus/docs/reporting/README.md. Reporting can never
#   fail a deploy: every step of it is swallowed.
# - A deploy refuses a working tree that is dirty or not level with
#   origin/master, because the report describes HEAD and an unclean
#   tree would make it a lie.
# ------------------------------------------------------------

# `-E` so the ERR trap installed below is inherited by functions and subshells; without it a
# failure inside `rollback_auto` or the build would exit silently and Zeus would hear nothing.
set -Eeuo pipefail

# The app owns its directory directly under /var/www, like every other app
# on this box — never inside the studio site's webroot.
SERVER_USER="debian"
SERVER_HOST="ks-b"
APP_NAME="halcyon"
REMOTE_FRONT="/var/www/$APP_NAME"

REMOTE_USER_HOST="$SERVER_USER@$SERVER_HOST"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

# The branch a deploy is allowed to ship. The tree must be clean and level with it — see
# `require_clean_tree`.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"

######################################
# Reporting to Zeus
######################################
# Ported from Loamkeep's scripts/deploy.sh, itself from Shatter's — the recipe in
# Zeus/docs/reporting/README.md. The four functions that recipe names are `require_clean_tree`,
# `resolve_base_hash`, `zeus_commits_json` and `zeus_report`; all four are below, adapted to this
# script's symlink-switching shape rather than Loamkeep's copy-into-live-root one.

# Halcyon's slug in Zeus's port registry, and which half of it this script deploys. Zeus refuses a
# report naming an app the registry has never heard of — so halcyon's registry row has to land
# before the next deploy for that deploy to be recorded. An unregistered *role* it records with a
# warning instead, because that means the registry is behind ks-b and dropping it would hide
# exactly that.
ZEUS_APP_NAME="${ZEUS_APP_NAME:-halcyon}"
ZEUS_ROLE="front"

# The two files **on ks-b** that may hold the ingest URL and the shared secret, in the order Zeus's
# API itself resolves them — see `read_setting` in `zeus_report`.
#
# Read there rather than carried on the laptop, for two reasons. The secret never travels: it is
# read on ks-b, used on ks-b, and never appears in this repo or in an ssh command line where `ps`
# would show it. And the endpoint is loopback-only — a report has to be sent from ks-b whatever
# happens, because this script runs on a laptop that Zeus's nginx would refuse.
ZEUS_ECOSYSTEM_FILE="${ZEUS_ECOSYSTEM_FILE:-/var/www/zeus/ecosystem.config.js}"
ZEUS_ENV_FILE="${ZEUS_ENV_FILE:-/var/www/zeus/nest-api/.env}"

# The last successfully deployed commit — the base of the next report's commit range.
#
# A dotfile, and that is load-bearing rather than cosmetic: the cleanup step at the end of this
# script is `ls -1t | tail -n +4 | xargs -r rm -rf`, and `ls` without `-a` does not list dotfiles,
# so the marker is never swept up with the old releases. `manual_rollback`'s `ls -1t` skips it for
# the same reason, and so can never offer the marker as a release to roll back to.
ZEUS_MARKER="$REMOTE_FRONT/releases/.zeus-last-$ZEUS_ROLE"

# ZEU-93. The rollback, as a file on ks-b: written by each deploy before its switch, holding the
# release that was live until then. `rollback_auto` runs it, and so does Zeus's post-deploy
# verification when the release degrades.
ROLLBACK_SCRIPT_REMOTE="$REMOTE_FRONT/rollback-front.sh"

GREEN="\033[0;32m"
BLUE="\033[38;5;81m"
RED="\033[0;31m"
RESET="\033[0m"

log() { printf "${BLUE}%s${RESET}\n" "$1"; }
ok()  { printf "${GREEN}%s${RESET}\n" "$1"; }
err() { printf "${RED}%s${RESET}\n" "$1"; }

# Refuse to ship a tree that is not exactly what is on the remote branch.
#
# The deploy uploads whatever the working tree holds — not what is committed and not what is
# pushed. The report to Zeus, though, describes HEAD: its commit hash and its range of commit
# messages. A dirty or unpushed tree would make every one of those a lie, so the check is part of
# the reporting port, not an extra.
#
# Runs before any ssh or rsync: the whole point is to fail on the laptop, with nothing on the
# server touched.
require_clean_tree() {
  cd "$PROJECT_DIR"

  local dirty
  dirty=$(git status --porcelain)
  if [ -n "$dirty" ]; then
    err "❌ ERROR: refusing to deploy — the working tree is not clean:"
    printf '%s\n' "$dirty" >&2
    err "   commit, stash or clean these first."
    exit 1
  fi

  # Without a fetch, `origin/$DEPLOY_BRANCH` is whatever this laptop last heard — exactly the stale
  # value that lets a behind-by-one tree deploy. A failure here is fatal on purpose: a deploy needs
  # the network anyway, so "cannot reach the remote" is never the moment to guess.
  if ! git fetch --quiet origin "$DEPLOY_BRANCH"; then
    err "❌ ERROR: refusing to deploy — could not fetch origin/$DEPLOY_BRANCH to compare against."
    exit 1
  fi

  local head remote
  head=$(git rev-parse HEAD)
  remote=$(git rev-parse FETCH_HEAD)

  if [ "$head" != "$remote" ]; then
    err "❌ ERROR: refusing to deploy — HEAD does not match origin/$DEPLOY_BRANCH:"
    err "   local  $head"
    err "   remote $remote"
    err "   pull, push or check out the right branch first."
    exit 1
  fi
}

# The commit the previous deploy shipped — the base of this deploy's commit range.
#
# Order: the marker (steady state) → a `ZEUS_SINCE` override → empty, which the consumer reads as
# "no baseline, fall back to the last ten commits".
#
# Loamkeep's script has one more step here, recovering the hash from the newest release folder's
# name. This one cannot: its release folders are bare timestamps — `2026-08-15-21h4811` — and
# carry no commit hash to read back. The cost is exactly one deploy. The first report falls back
# to the last ten commits, and every report after it has the marker this one leaves behind.
#
# Resolved **once, before anything writes**. `write_zeus_marker` moves the marker at the end of a
# successful deploy, so a second resolution later in the run would return this deploy's own commit
# and the report would come out claiming nothing shipped.
resolve_base_hash() {
  local base
  base=$(ssh "$REMOTE_USER_HOST" "cat '$ZEUS_MARKER' 2>/dev/null || true" 2>/dev/null || true)
  [ -z "$base" ] && base="${ZEUS_SINCE:-}"

  # A hash this checkout does not have is no baseline at all — a shallow clone, or a marker left by
  # a deploy from a branch since rewritten.
  if [ -n "$base" ] && ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    base=""
  fi

  printf '%s' "$base"
}

# The commits this deploy ships, as a JSON array, newest first.
#
# `ZEUS_BASE_HASH` is the commit the last deploy shipped; with none — a first report — the last ten
# commits stand in for a range nobody can reconstruct.
#
# Every message is escaped in awk rather than interpolated into a shell string. `%s` is the subject
# line only, so it cannot contain a newline, and splitting on the first two spaces is exact because
# neither a sha nor an ISO-8601 date contains one.
zeus_commits_json() {
  local -a range

  # A manual rollback restores a release rather than shipping one. Falling through to the last-ten
  # baseline there would claim it delivered ten commits it had nothing to do with.
  if [ "${ZEUS_REPORT_COMMITS:-true}" != "true" ]; then
    printf '[]'
    return 0
  fi

  if [ -n "${ZEUS_BASE_HASH:-}" ]; then
    range=("${ZEUS_BASE_HASH}..HEAD")
  else
    range=(-n 10 HEAD)
  fi

  git log --no-merges --pretty=format:'%H %aI %s' "${range[@]}" 2>/dev/null | awk '
    BEGIN { printf "["; first = 1 }
    NF >= 3 {
      sha = $1
      when = $2
      msg = substr($0, length(sha) + length(when) + 3)
      gsub(/\\/, "\\\\", msg)
      gsub(/"/, "\\\"", msg)
      gsub(/\t/, " ", msg)
      if (!first) printf ","
      printf "{\"sha\":\"%s\",\"authoredAt\":\"%s\",\"message\":\"%s\"}", sha, when, msg
      first = 0
    }
    END { printf "]" }'
}

# Escape a value for a JSON string literal.
#
# `zeus_commits_json` escapes commit messages in awk because it reads them a line at a time. Every
# *other* string in the payload is interpolated by hand below, and one
# `zeus_report "failed" "could not read \"x\""` away from posting malformed JSON. Zeus would answer
# 400, and since every error on this path is swallowed the report would vanish with no symptom.
# Applied to every field rather than the ones that look risky, so nothing here needs re-deciding.
#
# Backslash first: the reverse order would escape the backslashes this step adds. Commit subjects
# and git ref names cannot contain a newline, so tab is the only control character left to handle.
json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  printf '%s' "$s"
}

# Tell Zeus what this deploy did: `zeus_report <success|failed|rolled_back> [summary]`.
#
# Three rules, from `Zeus/docs/reporting/README.md`, and none of them is optional:
#   1. reporting must never fail the deploy — every step here is `|| true`, and the caller ignores
#      the return value too;
#   2. fire and forget, 2 second timeout, no retries;
#   3. the payload travels as a **file**, never interpolated into a shell command, because commit
#      messages contain quotes, backticks and `$`.
#
# The POST happens on ks-b over ssh rather than from here: the endpoint is loopback-only and nginx
# denies it from outside ks-b.
zeus_report() {
  local status="$1"
  local summary="${2:-}"
  local commits payload remote_payload duration

  commits=$(zeus_commits_json 2>/dev/null || echo "[]")
  duration=$(( ($(date +%s) - ${ZEUS_STARTED_EPOCH:-$(date +%s)}) * 1000 ))
  payload=$(mktemp)
  remote_payload="/tmp/.zeus-deploy-report.$$.json"

  {
    printf '{"app":"%s","role":"%s","status":"%s"' \
      "$(json_escape "$ZEUS_APP_NAME")" "$(json_escape "$ZEUS_ROLE")" "$(json_escape "$status")"
    printf ',"startedAt":"%s","durationMs":%s' "$(json_escape "${ZEUS_STARTED_AT}")" "$duration"
    [ -n "${ZEUS_RELEASE:-}" ] && printf ',"release":"%s"' "$(json_escape "$ZEUS_RELEASE")"
    [ -n "${ZEUS_COMMIT:-}" ] && printf ',"commit":"%s"' "$(json_escape "$ZEUS_COMMIT")"
    [ -n "${ZEUS_BRANCH:-}" ] && printf ',"branch":"%s"' "$(json_escape "$ZEUS_BRANCH")"
    [ -n "$summary" ] && printf ',"summary":"%s"' "$(json_escape "$summary")"
    # ZEU-93. A static site has no database: 0, so Zeus may roll it back — with the file below.
    [[ "${ZEUS_MIGRATIONS_APPLIED:-}" =~ ^[0-9]+$ ]] && printf ',"migrationsApplied":%s' "$ZEUS_MIGRATIONS_APPLIED"
    [ "$status" = "success" ] && [ -n "${ZEUS_ROLLBACK_SCRIPT:-}" ] && printf ',"rollbackScript":"%s"' "$ZEUS_ROLLBACK_SCRIPT"
    printf ',"commits":%s}' "$commits"
  } > "$payload"

  scp -q "$payload" "$REMOTE_USER_HOST:$remote_payload" || { rm -f "$payload"; return 0; }
  rm -f "$payload"

  ssh "$REMOTE_USER_HOST" \
    ZEUS_ECOSYSTEM_FILE="$ZEUS_ECOSYSTEM_FILE" \
    ZEUS_ENV_FILE="$ZEUS_ENV_FILE" \
    PAYLOAD="$remote_payload" \
    'bash -s' << 'EOF' || true
set -uo pipefail

cleanup() { rm -f "$PAYLOAD"; }
trap cleanup EXIT

# One setting, looked for in the pm2 ecosystem file first and the `.env` second.
#
# **That order is not a preference, it is the order Zeus's API itself resolves them.** pm2 injects
# `env_production` into the process environment before Nest starts, and dotenv does not overwrite a
# variable that is already there — so a value in the ecosystem file wins, and the `.env` is only
# consulted when the ecosystem file is silent. Reading the `.env` alone would present a token the
# API is not validating against the day the two files disagree, which is a `401` on every deploy
# report and no other symptom.
#
# Neither value is ever defaulted here. A fallback URL would put Zeus's port in this repo's source,
# which is the one place a port reassignment cannot rewrite — and since every error below is
# swallowed, a stale default would fail quietly and forever.
#
# `\042` and `\047` are the double and single quote, so a value written either way is unwrapped
# without this needing quotes of its own inside a heredoc.
read_setting() {
  local key="$1" value=""

  if [ -f "$ZEUS_ECOSYSTEM_FILE" ]; then
    value=$(sed -n "s/.*${key}: *['\"]\([^'\"]*\)['\"].*/\1/p" "$ZEUS_ECOSYSTEM_FILE" 2>/dev/null | tail -1)
  fi

  if [ -z "$value" ] && [ -f "$ZEUS_ENV_FILE" ]; then
    value=$(sed -n "s/^${key}=//p" "$ZEUS_ENV_FILE" 2>/dev/null | tail -1 | tr -d '\042\047')
  fi

  printf '%s' "$value"
}

url=$(read_setting ZEUS_DEPLOY_INGEST_URL)
token=$(read_setting ZEUS_INGEST_TOKEN)

if [ -z "$url" ] || [ -z "$token" ]; then
  echo "zeus: not reported — ZEUS_DEPLOY_INGEST_URL or ZEUS_INGEST_TOKEN found in neither" \
    "$ZEUS_ECOSYSTEM_FILE nor $ZEUS_ENV_FILE"
  exit 0
fi

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
  -X POST "$url" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $token" \
  --data-binary @"$PAYLOAD" || true)

# 202 is the contract. Anything else is worth one line in the deploy output and nothing more —
# a deploy that shipped and could not say so still shipped.
[ "$code" = "202" ] || echo "zeus: report not recorded (HTTP ${code:-none})"
EOF
}

# Move the marker to the commit this deploy just shipped. Only a hex hash travels, so inlining it
# in the ssh command is safe — everything else in the reporting path goes by file.
write_zeus_marker() {
  ssh "$REMOTE_USER_HOST" \
    "mkdir -p '$REMOTE_FRONT/releases' && printf '%s\n' '$(git rev-parse HEAD)' > '$ZEUS_MARKER'"
}

manual_rollback() {
  # A manual rollback is reported for the same reason an automatic one is: it changes what is live,
  # and Zeus's whole claim is to know which build each service is serving. It ships no commits —
  # see `zeus_commits_json` — but unlike Loamkeep's backup-directory rollback it does know exactly
  # which release it restores, so the report names it.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_REPORT_COMMITS="false"

  log "Searching releases..."
  RELEASES=$(ssh "$SERVER_USER@$SERVER_HOST" "ls -1t '$REMOTE_FRONT/releases'")
  CURRENT=$(ssh "$SERVER_USER@$SERVER_HOST" "readlink '$REMOTE_FRONT/current' | xargs basename")

  PREVIOUS=$(echo "$RELEASES" | grep -v "$CURRENT" | head -n 1)

  if [ -z "$PREVIOUS" ]; then
    err "No previous release available."
    # Nothing changed on ks-b, but a rollback was asked for and could not happen — which is
    # precisely the fact somebody wants on `/deploys` at 2am, so it is reported rather than
    # swallowed as a no-op.
    zeus_report "failed" "manual rollback impossible — no previous release on ks-b" || true
    exit 1
  fi

  log "Rolling back to: $PREVIOUS"
  ZEUS_RELEASE="$PREVIOUS"

  if ssh "$SERVER_USER@$SERVER_HOST" \
    "rm -rf '$REMOTE_FRONT/current' && ln -s '$REMOTE_FRONT/releases/$PREVIOUS' '$REMOTE_FRONT/current'"; then
    zeus_report "rolled_back" "manual rollback to $PREVIOUS" || true
  else
    err "Rollback failed. Check server state manually."
    zeus_report "failed" "manual rollback to $PREVIOUS failed — ks-b needs looking at" || true
    exit 1
  fi

  ok "Rollback complete. Reload nginx manually when ready."
  exit 0
}

# The build below runs against local dependencies, which the previous deploy deleted
# (`clean_local_build`). Reinstalled from the lockfile, exactly, and only when missing. A failed
# install is not caught here: it falls through to the ERR trap like a failed build, so Zeus hears
# about it and nothing is uploaded. No subshell: `-E` would hand it the ERR trap and report twice.
ensure_local_deps() {
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    log "➡️  Installing local dependencies for the build"
    pnpm --dir "$SCRIPT_DIR" install --frozen-lockfile > /dev/null
  fi
}

# The laptop is short on disk: a deploy leaves no build output behind, whether it succeeds or not.
# The local `vite build` stays: its `dist` is the release, rsynced as is, and ks-b never builds.
# Once uploaded it is deleted, along with Playwright's `test-results` and `node_modules`, which the
# next deploy reinstalls (`ensure_local_deps`). The film's takes in `e2e/demo/out` are recordings,
# not build output, and stay. A vite running from this checkout (dev or preview) loads from
# `node_modules` and serves `dist`, so both are kept while one is; the checkout's path in the
# pattern keeps another project's vite from counting. The size is `|| true`: `du` exits non-zero on
# a single unreadable file, and errexit would end the trap before the `rm`.
clean_local_build() {
  local dev_server="$SCRIPT_DIR/node_modules/.*vite"
  local freed=() dir
  for dir in test-results; do
    if [ -d "$SCRIPT_DIR/$dir" ]; then
      freed+=("$(du -sh "$SCRIPT_DIR/$dir" 2>/dev/null | cut -f1 || true) $dir")
      rm -rf -- "${SCRIPT_DIR:?}/$dir"
    fi
  done
  if pgrep -f "$dev_server" > /dev/null 2>&1; then
    log "ℹ️  vite is running from this checkout: local dist and node_modules kept"
  else
    for dir in dist node_modules; do
      if [ -d "$SCRIPT_DIR/$dir" ]; then
        freed+=("$(du -sh "$SCRIPT_DIR/$dir" 2>/dev/null | cut -f1 || true) $dir")
        rm -rf -- "${SCRIPT_DIR:?}/$dir"
      fi
    done
  fi
  [ ${#freed[@]} -gt 0 ] && log "🧹 Local build output removed: ${freed[*]}"
  return 0
}

if [ "${1:-}" = "rollback" ]; then
  manual_rollback
fi

# Armed after the rollback branch, which builds nothing and exits on its own.
trap clean_local_build EXIT

TIMESTAMP=$(date +"%Y-%m-%d-%Hh%M%S")
RELEASE_DIR="$REMOTE_FRONT/releases/$TIMESTAMP"

if [ ! -d "src" ]; then
  err "src/ directory not found. Run this script from the project root."
  exit 1
fi

# Before any ssh or rsync — see the function itself for why this guards the report's honesty.
require_clean_tree

# What the report to Zeus will carry, gathered here so that a deploy which fails at its very first
# step still reports something true. `ZEUS_RELEASE` is the release directory name: this fleet has
# no build number and Zeus does not invent one, so the folder still sitting under `releases/` is
# the build identifier.
ZEUS_STARTED_AT=$(date -u +%FT%TZ)
ZEUS_STARTED_EPOCH=$(date +%s)
ZEUS_RELEASE="$TIMESTAMP"
ZEUS_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
ZEUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || true)
ZEUS_BASE_HASH=$(resolve_base_hash)

# Whether the live symlink has been re-pointed yet. It decides which of the two failure statuses a
# broken deploy reports.
#
# Today the switch itself is the only post-switch step that can fail — it carries its own
# `|| rollback_auto`, and the prune after it is non-fatal on purpose. This flag is what keeps that
# true for the next step somebody adds there: a healthcheck between the switch and the prune, the
# obvious next addition and the one thing this script still lacks next to Loamkeep's, would leave
# a broken release live without it.
switch_done="false"

# The catch-all for everything the explicit `||` handlers below do not cover — a failed build, a
# failed `mkdir` over ssh, a failed `readlink`. Without it those exit through `set -e` in silence
# and Zeus records a deploy that simply never ended.
on_error() {
  local lineno="$1"

  # Disarm first: a failure inside the reporting path would otherwise re-enter this handler and
  # recurse.
  trap - ERR

  err "❌ ERROR: Deployment failed at line $lineno"

  if [ "$switch_done" = "true" ]; then
    # `rollback_auto` reports for itself — it is the only place that knows whether the previous
    # release was actually restored, which is the whole difference between `rolled_back` and
    # `failed`.
    rollback_auto
  else
    zeus_report "failed" "deploy failed at line $lineno — production was not modified" || true
    exit 1
  fi
}

trap 'on_error $LINENO' ERR

ensure_local_deps
log "Building project..."
pnpm build
ok "Build complete."

log "Preparing release folder..."
ssh "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_FRONT/releases'"

CURRENT_RELEASE=$(ssh "$SERVER_USER@$SERVER_HOST" "readlink '$REMOTE_FRONT/current' || true")

# ZEU-93. The way back to what is live now, written before anything changes. A first deploy has
# nothing to go back to: no file, no rollback reported, and Zeus can only alert on it.
ZEUS_MIGRATIONS_APPLIED=0
ZEUS_ROLLBACK_SCRIPT=""
if [ -n "$CURRENT_RELEASE" ]; then
  ssh "$REMOTE_USER_HOST" \
    PREVIOUS="$CURRENT_RELEASE" \
    LINK="$REMOTE_FRONT/current" \
    TARGET="$ROLLBACK_SCRIPT_REMOTE" \
    'bash -s' << 'EOF'
set -Eeuo pipefail
TMP="$TARGET.tmp.$$"
{
  echo '#!/usr/bin/env bash'
  echo '# Written by deploy-halcyon.sh on every deploy (ZEU-93) - do not edit it here, edit the script.'
  echo '# Points current back at the release that was live before the latest deploy.'
  echo 'set -Eeuo pipefail'
  printf 'PREVIOUS=%q\nLINK=%q\n' "$PREVIOUS" "$LINK"
  cat << 'BODY'
[ -d "$PREVIOUS" ] || { echo "the previous release $PREVIOUS is gone" >&2; exit 1; }
rm -rf "$LINK" && ln -s "$PREVIOUS" "$LINK"
echo "current points at $PREVIOUS again"
BODY
} > "$TMP"
chmod 700 "$TMP"
mv "$TMP" "$TARGET"
EOF
  ZEUS_ROLLBACK_SCRIPT="$ROLLBACK_SCRIPT_REMOTE"
fi

log "Uploading new release..."
# The `||` swallows the ERR trap, so this path reports for itself. Nothing is live yet — the
# upload writes into a fresh release folder and the symlink still points at the old one.
rsync -az dist/ "$SERVER_USER@$SERVER_HOST:$RELEASE_DIR/" || {
  err "Upload failed."
  trap - ERR
  zeus_report "failed" "upload to $TIMESTAMP failed — production was not modified" || true
  exit 1
}
ok "Upload complete."

rollback_auto() {
  trap - ERR

  err "Deploy failed. Rolling back..."

  # `rolled_back`, not `failed`, and the distinction is the whole reason Zeus has three statuses:
  # the deploy did fail, and ks-b is serving exactly what it served before. It is only earned when
  # the symlink is actually back on the old release — the `else` branches below leave the site
  # broken and say so.
  local restored="false"
  if [ -n "$CURRENT_RELEASE" ]; then
    if ssh "$SERVER_USER@$SERVER_HOST" \
      "bash '$ROLLBACK_SCRIPT_REMOTE'"; then
      ok "Rollback restored previous release."
      restored="true"
    else
      err "Rollback failed. Manual intervention required."
    fi
  else
    err "No previous release to restore."
  fi

  ssh "$SERVER_USER@$SERVER_HOST" "rm -rf '$RELEASE_DIR'" || true

  if [ "$restored" = "true" ]; then
    zeus_report "rolled_back" "deploy of $TIMESTAMP failed — previous release restored" || true
  else
    zeus_report "failed" "deploy of $TIMESTAMP failed and the rollback did not restore it — ks-b needs looking at" || true
  fi

  exit 1
}

log "Switching active release..."
# From here on a failure has changed what is live, so the ERR trap routes through `rollback_auto`
# and the report becomes `rolled_back` rather than `failed`.
switch_done="true"
ssh "$SERVER_USER@$SERVER_HOST" \
  "rm -rf '$REMOTE_FRONT/current' && ln -s '$RELEASE_DIR' '$REMOTE_FRONT/current'" \
  || rollback_auto

ok "Active release set to $TIMESTAMP."

log "Cleaning old releases..."
# `ls` without `-a` lists no dotfiles, which is what keeps `.zeus-last-front` out of this sweep.
#
# Non-fatal, and deliberately so. The switch has already happened: the new release is live and
# working, and old folders left on disk are untidy rather than broken. Letting this reach the ERR
# trap would roll back a good deploy because a `rm` failed — which is both wrong and a behaviour
# this script did not have before the trap existed.
ssh "$SERVER_USER@$SERVER_HOST" \
  "cd '$REMOTE_FRONT/releases' && ls -1t | tail -n +4 | xargs -r rm -rf" \
  || log "⚠️  Old releases not pruned — the deploy is live regardless (non-fatal)"

ok "Cleanup complete."

trap - ERR

write_zeus_marker || log "⚠️  Zeus marker not moved — the next report's commit range will overshoot (non-fatal)"
zeus_report "success" || log "⚠️  Zeus was not told about this deploy (non-fatal)"

ok "Deployment successful. Reload nginx manually when ready."