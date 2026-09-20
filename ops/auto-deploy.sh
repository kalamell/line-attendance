#!/usr/bin/env bash
# Fallback auto-deploy: polls GitHub main and redeploys on new commits.
# Runs as the `jenkins` user via cron (every ~2 min). Independent of Jenkins polling.
# Installed at /usr/local/bin/poszee-deploy.sh; state/log/src live under /opt/poszee-ci.
set -euo pipefail

REPO=https://github.com/kalamell/line-attendance.git
APP=/opt/poszee-attendance
WORK=/opt/poszee-ci
SRC="$WORK/src"
STATE="$WORK/last_sha"
LOCK=/tmp/poszee-deploy.lock
COMPOSE="docker-compose -f docker-compose.prod.yml"

# single-instance
exec 9>"$LOCK"
flock -n 9 || { echo "$(date '+%F %T') deploy already running, skip"; exit 0; }

remote=$(git ls-remote "$REPO" refs/heads/main | awk '{print $1}')
[ -z "$remote" ] && { echo "$(date '+%F %T') cannot reach repo"; exit 0; }
last=$(cat "$STATE" 2>/dev/null || echo none)
if [ "$remote" = "$last" ]; then exit 0; fi

echo "$(date '+%F %T') new commit ${remote:0:8} (was ${last:0:8}) — deploying"

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q origin main && git -C "$SRC" reset -q --hard origin/main
else
  git clone -q "$REPO" "$SRC"
fi

rsync -a --delete --exclude .env --exclude node_modules --exclude .git --exclude 'packages/*/dist' "$SRC"/ "$APP"/
cd "$APP"
$COMPOSE build poszee-api poszee-web
$COMPOSE run --rm poszee-api pnpm db:migrate
$COMPOSE up -d poszee-api poszee-web

echo "$remote" > "$STATE"
echo "$(date '+%F %T') deployed ${remote:0:8}"
