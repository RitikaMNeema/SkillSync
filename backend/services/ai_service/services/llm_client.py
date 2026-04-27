import os
from typing import Any, Dict, List

import httpx


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/api")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "llama3.1:8b")


class OllamaClient:
    def __init__(self) -> None:
        self.base_url = OLLAMA_BASE_URL.rstrip("/")

    async def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": OLLAMA_CHAT_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }

        # Ollama supports format as json or JSON schema
        if schema:
            payload["format"] = schema
        else:
            payload["format"] = "json"

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{self.base_url}/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()

        content = data["message"]["content"]
        import json
        return json.loads(content)

    async def chat_text(self, system_prompt: str, user_prompt: str) -> str:
        payload = {
            "model": OLLAMA_CHAT_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{self.base_url}/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()

        return data["message"]["content"].strip()


ollama_client = OllamaClient()