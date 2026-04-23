#!/bin/sh
# Run from mongo-init container: apply init.js against the running mongo service.
set -e

: "${MONGO_HOST:=mongo}"
: "${MONGO_INITDB_ROOT_USERNAME:?MONGO_INITDB_ROOT_USERNAME is required}"
: "${MONGO_INITDB_ROOT_PASSWORD:?MONGO_INITDB_ROOT_PASSWORD is required}"

exec mongosh \
  --host "$MONGO_HOST" \
  --port 27017 \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --file /init.js
