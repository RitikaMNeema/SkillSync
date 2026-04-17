import asyncio
from datetime import datetime

from fastapi.testclient import TestClient
from main import app
from database import get_database


class FakeCursor:
    def __init__(self, items):
        self.items = items

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=1000):
        return self.items[:length]


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if not doc:
            return type("Result", (), {"matched_count": 0})()
        if "$set" in update:
            doc.update(update["$set"])
        return type("Result", (), {"matched_count": 1})()

    def find(self, query):
        items = [doc for doc in self.docs if all(doc.get(k) == v for k, v in query.items())]
        return FakeCursor(items)


class FakeDB:
    def __init__(self):
        self.threads = FakeCollection()
        self.messages = FakeCollection()


fake_db = FakeDB()
app.dependency_overrides[get_database] = lambda: fake_db
client = TestClient(app)


def test_open_send_list_and_mark_read():
    thread_resp = client.post("/threads/open", json={"participant_ids": ["user1", "user2"]})
    assert thread_resp.status_code == 200
    thread_id = thread_resp.json()["thread_id"]

    msg_resp = client.post(
        "/messages/send",
        json={
            "thread_id": thread_id,
            "sender_id": "user1",
            "receiver_id": "user2",
            "message_text": "Hello!",
        },
    )
    assert msg_resp.status_code == 200
    message_id = msg_resp.json()["message_id"]

    list_resp = client.post("/messages/list", params={"thread_id": thread_id})
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["message_id"] == message_id

    read_resp = client.post("/messages/markRead", json={"message_id": message_id})
    assert read_resp.status_code == 200
    assert fake_db.messages.docs[0]["is_read"] is True
