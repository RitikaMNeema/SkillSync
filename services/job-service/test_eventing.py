from kafka_producer import build_event_envelope


def test_job_event_envelope_uses_provided_trace_and_deterministic_idempotency():
    payload = {"job_id": "J1"}
    first = build_event_envelope(
        "job.closed",
        "job.closed",
        "R1",
        "job",
        "J1",
        payload,
        trace_id="trace-123",
    )
    second = build_event_envelope(
        "job.closed",
        "job.closed",
        "R1",
        "job",
        "J1",
        payload,
        trace_id="trace-123",
    )

    assert first["trace_id"] == "trace-123"
    assert first["idempotency_key"] == second["idempotency_key"]
