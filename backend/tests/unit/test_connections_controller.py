import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch
from services.connection_service.controllers import connections as ctrl


@pytest.mark.asyncio
async def test_request_self_connection():
    with pytest.raises(HTTPException) as exc:
        await ctrl.request(1, 1)

    assert exc.value.status_code == 400
    assert exc.value.detail == "Cannot connect with yourself"


@pytest.mark.asyncio
async def test_request_duplicate_pending():
    with patch(
        "services.connection_service.controllers.connections.find_request",
        new=AsyncMock(return_value={"status": "pending"})
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.request(1, 2)

    assert exc.value.status_code == 409
    assert exc.value.detail == "Connection request already pending"

@pytest.mark.asyncio
async def test_request_already_connected_from_request_status():
    with patch(
        "services.connection_service.controllers.connections.find_request",
        new=AsyncMock(return_value={"status": "accepted"})
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.request(1, 2)

    assert exc.value.status_code == 409
    assert exc.value.detail == "Already connected"

@pytest.mark.asyncio
async def test_request_already_connected_from_connections_table():
    with patch(
        "services.connection_service.controllers.connections.find_request",
        new=AsyncMock(return_value=None)
    ), patch(
        "services.connection_service.controllers.connections.connection_exists",
        new=AsyncMock(return_value=True)
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.request(1, 2)

    assert exc.value.status_code == 409
    assert exc.value.detail == "Already connected"

@pytest.mark.asyncio
async def test_request_success():
    with patch(
        "services.connection_service.controllers.connections.find_request",
        new=AsyncMock(return_value=None)
    ), patch(
        "services.connection_service.controllers.connections.connection_exists",
        new=AsyncMock(return_value=False)
    ), patch(
        "services.connection_service.controllers.connections.create_request",
        new=AsyncMock(return_value=10)
    ), patch(
        "services.connection_service.controllers.connections.emit_connection_requested",
        new=AsyncMock()
    ):

        result = await ctrl.request(1, 2)

    assert result == {"request_id": 10, "status": "pending"}

@pytest.mark.asyncio
async def test_accept_request_not_found():
    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value=None)
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.accept(99)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Connection request not found"


@pytest.mark.asyncio
async def test_accept_request_not_pending():
    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value={
            "id": 1,
            "requester_id": 1,
            "receiver_id": 2,
            "status": "rejected"
        })
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.accept(1)

    assert exc.value.status_code == 400
    assert exc.value.detail == "Request already rejected"


@pytest.mark.asyncio
async def test_accept_success():
    req = {
        "id": 1,
        "requester_id": 1,
        "receiver_id": 2,
        "status": "pending"
    }

    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value=req)
    ), patch(
        "services.connection_service.controllers.connections.accept_connection_transaction",
        new=AsyncMock()
    ) as mock_accept_txn, patch(
        "services.connection_service.controllers.connections.cache_del",
        new=AsyncMock()
    ) as mock_cache_del, patch(
        "services.connection_service.controllers.connections.emit_connection_accepted",
        new=AsyncMock()
    ):

        result = await ctrl.accept(1)

    assert result == {"request_id": 1, "status": "accepted"}
    mock_accept_txn.assert_awaited_once_with(1, 2, 1)
    assert mock_cache_del.await_count == 2

@pytest.mark.asyncio
async def test_reject_request_not_found():
    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value=None)
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.reject(99)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Connection request not found"


@pytest.mark.asyncio
async def test_reject_success():
    req = {
        "id": 5,
        "requester_id": 1,
        "receiver_id": 2,
        "status": "pending"
    }

    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value=req)
    ), patch(
        "services.connection_service.controllers.connections.update_request_status",
        new=AsyncMock()
    ) as mock_update:

        result = await ctrl.reject(5)

    assert result == {"request_id": 5, "status": "rejected"}
    mock_update.assert_awaited_once_with(5, "rejected")


@pytest.mark.asyncio
async def test_withdraw_request_not_found():
    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value=None)
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.withdraw(99)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Connection request not found"


@pytest.mark.asyncio
async def test_withdraw_success():
    req = {
        "id": 9,
        "requester_id": 1,
        "receiver_id": 2,
        "status": "pending"
    }

    with patch(
        "services.connection_service.controllers.connections.find_request_by_id",
        new=AsyncMock(return_value=req)
    ), patch(
        "services.connection_service.controllers.connections.update_request_status",
        new=AsyncMock()
    ) as mock_update:

        result = await ctrl.withdraw(9)

    assert result == {"request_id": 9, "status": "withdrawn"}
    mock_update.assert_awaited_once_with(9, "withdrawn")


@pytest.mark.asyncio
async def test_remove_connection_not_found():
    with patch(
        "services.connection_service.controllers.connections.connection_exists",
        new=AsyncMock(return_value=False)
    ):
        with pytest.raises(HTTPException) as exc:
            await ctrl.remove(1, 2)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Connection does not exist"


@pytest.mark.asyncio
async def test_remove_success():
    with patch(
        "services.connection_service.controllers.connections.connection_exists",
        new=AsyncMock(return_value=True)
    ), patch(
        "services.connection_service.controllers.connections.remove_connection_transaction",
        new=AsyncMock()
    ) as mock_remove, patch(
        "services.connection_service.controllers.connections.cache_del",
        new=AsyncMock()
    ) as mock_cache_del:

        result = await ctrl.remove(1, 2)

    assert result == {"removed": True}
    mock_remove.assert_awaited_once_with(1, 2)
    assert mock_cache_del.await_count == 2

@pytest.mark.asyncio
async def test_mutual_same_users_invalid():
    with pytest.raises(HTTPException) as exc:
        await ctrl.mutual(1, 1)

    assert exc.value.status_code == 400
    assert exc.value.detail == "user_id_1 and user_id_2 must differ"