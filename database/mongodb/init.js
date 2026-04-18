// MongoDB initialization — runs once on first container start
db = db.getSiblingDB('linkedin_db');

// ── profiles_unstructured ────────────────────────────────────────
db.createCollection('profiles_unstructured');
db.profiles_unstructured.createIndex({ member_id: 1 }, { unique: true });

// ── threads ──────────────────────────────────────────────────────
db.createCollection('threads');
db.threads.createIndex({ thread_id: 1 }, { unique: true });
db.threads.createIndex({ participant_ids: 1 });
db.threads.createIndex({ last_message_at: -1 });

// ── messages ─────────────────────────────────────────────────────
db.createCollection('messages');
db.messages.createIndex({ message_id: 1 }, { unique: true });
db.messages.createIndex({ thread_id: 1, timestamp: 1 });

// ── events ───────────────────────────────────────────────────────
db.createCollection('events');
db.events.createIndex({ idempotency_key: 1 }, { unique: true });
db.events.createIndex({ event_type: 1 });
db.events.createIndex({ timestamp: -1 });
db.events.createIndex({ actor_id: 1 });

// ── analytics_aggregations ───────────────────────────────────────
db.createCollection('analytics_aggregations');
db.analytics_aggregations.createIndex({ type: 1, window: 1 });
db.analytics_aggregations.createIndex({ computed_at: -1 });

print('MongoDB linkedin_db initialized with collections and indexes.');
