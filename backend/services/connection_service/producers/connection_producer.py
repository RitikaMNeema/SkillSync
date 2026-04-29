from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_connection_requested(actor_id, request_id, receiver_id) -> None:
    envelope = build_envelope(topics.CONNECTION_REQUESTED, str(actor_id), "connection", str(request_id),
                              {"receiver_id": str(receiver_id)},
                              idempotency_key=f"connection.requested:{request_id}")
    await publish_event(topics.CONNECTION_REQUESTED, envelope)


async def emit_connection_accepted(actor_id, request_id, requester_id, receiver_id) -> None:
    envelope = build_envelope(topics.CONNECTION_ACCEPTED, str(actor_id), "connection", str(request_id),
                              {"requester_id": str(requester_id), "receiver_id": str(receiver_id)},
                              idempotency_key=f"connection.accepted:{request_id}")
    await publish_event(topics.CONNECTION_ACCEPTED, envelope)


async def emit_connection_removed(actor_id, uid1, uid2) -> None:
    a, b = (uid1, uid2) if int(uid1) < int(uid2) else (uid2, uid1)
    envelope = build_envelope(
        topics.CONNECTION_REMOVED,
        str(actor_id),
        "connection",
        f"{a}:{b}",
        {"user_id_1": str(a), "user_id_2": str(b)},
        idempotency_key=f"connection.removed:{a}:{b}",
    )
    await publish_event(topics.CONNECTION_REMOVED, envelope)
