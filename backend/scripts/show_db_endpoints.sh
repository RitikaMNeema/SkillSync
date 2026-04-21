#!/usr/bin/env bash
# SkillSync mode: Docker app services + local/Homebrew MySQL & MongoDB.
# Run: bash backend/scripts/show_db_endpoints.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "SkillSync GUI:  Workbench local (/tmp/mysql.sock or 127.0.0.1:3306)"
echo "               Compass mongodb://127.0.0.1:27017/"
echo "Steps:          backend/database/GUI_CLIENTS.txt"
echo "(SkillSync services in Docker connect to host.docker.internal for DBs)"
echo ""

echo "=== Docker app services (mysql/mongo are optional profile: docker-db) ==="
if docker info &>/dev/null; then
  docker ps -a --filter "name=linkedin_auth" --filter "name=linkedin_profile" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
else
  echo "Docker is not reachable (start Docker Desktop)."
fi

echo ""
echo "=== Local listeners (Homebrew/local DB expected) ==="
if command -v lsof &>/dev/null; then
  lsof -nP -iTCP:3306 -sTCP:LISTEN 2>/dev/null || echo "(nothing on 3306)"
  lsof -nP -iTCP:27017 -sTCP:LISTEN 2>/dev/null || echo "(nothing on 27017)"
else
  echo "Install lsof for listener details."
fi
