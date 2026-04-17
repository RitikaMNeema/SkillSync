from fastapi import FastAPI, Depends, HTTPException
import uuid
from datetime import datetime
from typing import List
import logging

import schemas
from database import connect_to_mongo, close_mongo_connection, get_database
from kafka_producer import send_kafka_event_async

logger = logging.getLogger(__name__)

app = FastAPI(title="Messaging Service", description="Dev 2 - Messaging Module")

@app.on_event("startup")
async def startup():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown():
    await close_mongo_connection()

@app.post("/threads/open", response_model=schemas.ThreadResponse)
async def open_thread(thread_in: schemas.ThreadCreate, db = Depends(get_database)):
    # Check if thread already exists with exact participants
    # Simple strategy: sort participant IDs
    sorted_p = sorted(thread_in.participant_ids)
    existing = await db.threads.find_one({"participant_ids": sorted_p})
    
    if existing:
        return existing

    thread_id = str(uuid.uuid4())
    thread_doc = {
        "thread_id": thread_id,
        "participant_ids": sorted_p,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db.threads.insert_one(thread_doc)
    return thread_doc

@app.post("/threads/get", response_model=schemas.ThreadResponse)
async def get_thread(thread_id: str, db = Depends(get_database)):
    thread = await db.threads.find_one({"thread_id": thread_id})
    if not thread:
        raise HTTPException(status_code=404)
    return thread

@app.post("/threads/byUser", response_model=List[schemas.ThreadResponse])
async def threads_by_user(user_id: str, db = Depends(get_database)):
    cursor = db.threads.find({"participant_ids": user_id}).sort("updated_at", -1)
    return await cursor.to_list(length=100)

@app.post("/messages/send", response_model=schemas.MessageResponse)
async def send_message(
    msg_in: schemas.MessageCreate,
    trace_id: str = None,
    idempotency_key: str = None,
    db = Depends(get_database),
):
    # Verify thread
    thread = await db.threads.find_one({"thread_id": msg_in.thread_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
        
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    msg_doc = {
        "message_id": msg_id,
        "thread_id": msg_in.thread_id,
        "sender_id": msg_in.sender_id,
        "receiver_id": msg_in.receiver_id,
        "message_text": msg_in.message_text,
        "timestamp": now,
        "is_read": False
    }
    
    try:
        await db.messages.insert_one(msg_doc)
        await db.threads.update_one({"thread_id": msg_in.thread_id}, {"$set": {"updated_at": now}})
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to send message")
        
    # Publish the event with retry; failures are logged but do not roll back the saved message.
    trace_id = trace_id or str(uuid.uuid4())
    try:
        await send_kafka_event_async(
            "message.sent",
            "message.sent",
            msg_in.sender_id,
            "message",
            msg_id,
            {"thread_id": msg_in.thread_id},
            trace_id,
            idempotency_key or f"message.sent:{msg_id}",
        )
    except Exception as exc:
        logger.error("Failed to publish message.sent event after retries: %s", exc)
        raise HTTPException(status_code=503, detail="Message saved but notification publish failed")
    
    return msg_doc

@app.post("/messages/list", response_model=List[schemas.MessageResponse])
async def list_messages(thread_id: str, db = Depends(get_database)):
    cursor = db.messages.find({"thread_id": thread_id}).sort("timestamp", 1)
    return await cursor.to_list(length=1000)

@app.post("/messages/markRead")
async def mark_read(payload: schemas.MessageMarkRead, db = Depends(get_database)):
    result = await db.messages.update_one(
        {"message_id": payload.message_id},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404)
    return {"status": "success"}
