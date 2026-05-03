from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.kafka_utils import topics
from shared.utils.idempotency import is_duplicate
from shared.redis_utils.cache import cache_del
from models.member_mysql import apply_connection_delta
from models.recruiters_mysql import apply_recruiter_connection_delta


def _profile_key(member_id: str | int) -> str:
    return f"profile:{member_id}"


async def start_connection_events_consumer() -> None:
    async def handler(topic, partition, envelope):
        validate_event_envelope(envelope, topic)
        key = envelope.get("idempotency_key")
        if key and await is_duplicate(f"profile:{key}"):
            return

        payload = envelope.get("payload") or {}
        if topic == topics.CONNECTION_ACCEPTED:
            requester_id = payload.get("requester_id")
            receiver_id = payload.get("receiver_id")
            if requester_id is None or receiver_id is None:
                return
            rid, rv = int(requester_id), int(receiver_id)
            await apply_connection_delta(rid, 1)
            await apply_connection_delta(rv, 1)
            await apply_recruiter_connection_delta(rid, 1)
            await apply_recruiter_connection_delta(rv, 1)
            await cache_del(_profile_key(requester_id))
            await cache_del(_profile_key(receiver_id))
            return

        if topic == topics.CONNECTION_REMOVED:
            uid1 = payload.get("user_id_1")
            uid2 = payload.get("user_id_2")
            if uid1 is None or uid2 is None:
                return
            a, b = int(uid1), int(uid2)
            await apply_connection_delta(a, -1)
            await apply_connection_delta(b, -1)
            await apply_recruiter_connection_delta(a, -1)
            await apply_recruiter_connection_delta(b, -1)
            await cache_del(_profile_key(uid1))
            await cache_del(_profile_key(uid2))

    await start_consumer(
        "profile-service-connections",
        [topics.CONNECTION_ACCEPTED, topics.CONNECTION_REMOVED],
        handler,
    )

