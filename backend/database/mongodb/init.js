// MongoDB schema for linkedin_db — safe to run multiple times (compose "mongo-init" job).
// The mongo image only runs files in /docker-entrypoint-initdb.d/ on a *brand-new* data volume;
// this script is also executed by the mongo-init service so existing volumes get the schema.

db = db.getSiblingDB('linkedin_db');

function ensureCollection(name) {
  const existing = db.getCollectionNames();
  if (!existing.includes(name)) {
    db.createCollection(name);
    print('Created collection: ' + name);
  } else {
    print('Collection already exists: ' + name);
  }
}

function ensureIndex(collName, keys, options) {
  db.getCollection(collName).createIndex(keys, options || {});
}

// ── profiles_unstructured ────────────────────────────────────────
ensureCollection('profiles_unstructured');
ensureIndex('profiles_unstructured', { member_id: 1 }, { unique: true });

// ── threads ──────────────────────────────────────────────────────
ensureCollection('threads');
ensureIndex('threads', { thread_id: 1 }, { unique: true });
ensureIndex('threads', { participant_ids: 1 }, {});
ensureIndex('threads', { last_message_at: -1 }, {});

// ── messages ─────────────────────────────────────────────────────
ensureCollection('messages');
ensureIndex('messages', { message_id: 1 }, { unique: true });
ensureIndex('messages', { thread_id: 1, timestamp: 1 }, {});


// ── thread_preferences ─────────────────────────────────────────
ensureCollection('thread_preferences');
ensureIndex('thread_preferences', { thread_id: 1, user_id: 1 }, { unique: true });
ensureIndex('thread_preferences', { user_id: 1, archived: 1, muted: 1, starred: 1 }, {});

// ── events ───────────────────────────────────────────────────────
ensureCollection('events');
ensureIndex('events', { idempotency_key: 1 }, { unique: true });
ensureIndex('events', { event_type: 1 }, {});
ensureIndex('events', { timestamp: -1 }, {});
ensureIndex('events', { actor_id: 1 }, {});

// ── analytics_aggregations ───────────────────────────────────────
ensureCollection('analytics_aggregations');
ensureIndex('analytics_aggregations', { type: 1, window: 1 }, {});
ensureIndex('analytics_aggregations', { computed_at: -1 }, {});

print('MongoDB linkedin_db schema applied (idempotent).');
