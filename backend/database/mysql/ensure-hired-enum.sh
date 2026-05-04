#!/bin/sh
# One-shot for docker-compose `mysql-ensure-hired-enum`: extend applications.status with 'hired'.
set -eu

MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DATABASE="${MYSQL_DATABASE:-linkedin_db}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"

SQL_FILE="/migrations/003_application_status_hired.sql"
if [ ! -f "${SQL_FILE}" ]; then
  echo "[ensure-hired-enum] ERROR: ${SQL_FILE} is missing or not a regular file." >&2
  echo "[ensure-hired-enum] On the host, remove a stray directory and restore the SQL file, e.g.:" >&2
  echo "  rm -rf database/mysql/migrations/003_application_status_hired.sql" >&2
  echo "  git checkout database/mysql/migrations/003_application_status_hired.sql" >&2
  exit 1
fi

echo "[ensure-hired-enum] Applying ${SQL_FILE} to ${MYSQL_DATABASE}@${MYSQL_HOST}:${MYSQL_PORT}..."

mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < "${SQL_FILE}"

echo "[ensure-hired-enum] Done."
