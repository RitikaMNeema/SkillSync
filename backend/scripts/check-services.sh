#!/usr/bin/env bash
set -euo pipefail

echo "Checking Docker containers..."
docker compose ps

declare -a URLS=(
  "http://localhost:3001/health auth-service"
  "http://localhost:3002/health profile-service"
  "http://localhost:3003/health recruiter-service"
  "http://localhost:3004/health connection-service"
  "http://localhost:3005/health job-service"
  "http://localhost:3006/health application-service"
  "http://localhost:3007/health messaging-service"
  "http://localhost:3008/health analytics-service"
  "http://localhost:3010/ai/health ai-service"
)

echo
echo "Checking HTTP health endpoints..."
for entry in "${URLS[@]}"; do
  url="${entry% *}"
  name="${entry##* }"
  if curl -fsS "$url" >/dev/null; then
    echo "  [OK]    $name"
  else
    echo "  [FAIL]  $name ($url)"
    exit 1
  fi
done

echo
echo "All services are healthy."
