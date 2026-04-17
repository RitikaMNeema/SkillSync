from kafka_producer import build_event_envelope


def test_message_event_envelope_is_deterministic():
    payload = {"thread_id": "T1"}
    first = build_event_envelope(
        "message.sent",
        "message.sent",
        "U1",
        "message",
        "M1",
        payload,
        trace_id="trace-x",
    )
    second = build_event_envelope(
        "message.sent",
        "message.sent",
        "U1",
        "message",
        "M1",
        payload,
        trace_id="trace-x",
    )

    assert first["trace_id"] == "trace-x"
    assert first["idempotency_key"] == second["idempotency_key"]
