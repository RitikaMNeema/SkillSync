from kafka_producer import build_event_envelope
from schemas import ApplicationStatusUpdate
import pytest


def test_application_event_envelope_is_stable():
    payload = {"new_status": "reviewing"}
    a = build_event_envelope(
        "application.statusChanged",
        "application.statusChanged",
        "R1",
        "application",
        "A1",
        payload,
        trace_id="trace-abc",
    )
    b = build_event_envelope(
        "application.statusChanged",
        "application.statusChanged",
        "R1",
        "application",
        "A1",
        payload,
        trace_id="trace-abc",
    )
    assert a["trace_id"] == "trace-abc"
    assert a["idempotency_key"] == b["idempotency_key"]


def test_application_status_validator_rejects_invalid_status():
    with pytest.raises(ValueError):
        ApplicationStatusUpdate(status="pending")
