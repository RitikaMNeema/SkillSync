#!/bin/sh
# Run from mongo-init container: apply init.js against the running mongo service.
set -eu 

: "${MONGO_HOST:=mongo}"
: "${MONGO_INITDB_ROOT_USERNAME:?MONGO_INITDB_ROOT_USERNAME is required}"
: "${MONGO_INITDB_ROOT_PASSWORD:?MONGO_INITDB_ROOT_PASSWORD is required}"

# Some existing dev volumes run without admin auth enabled/root user provisioned.
# Try authenticated first; fall back to unauthenticated localhost-style init.
if mongosh \
  --host "$MONGO_HOST" \
  --port 27017 \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --file /init.js; then
  exit 0
fi

exec mongosh \
  --host "$MONGO_HOST" \
  --port 27017 \
  --file /init.js
