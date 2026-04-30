import os
from typing import List

import httpx
import numpy as np


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/api")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")


class EmbeddingService:
    def __init__(self) -> None:
        self.base_url = OLLAMA_BASE_URL.rstrip("/")

    async def embed(self, text: str) -> List[float]:
        payload = {
            "model": OLLAMA_EMBED_MODEL,
            "input": text,
        }

        print(f"[EMBED] requesting embeddings from {self.base_url}/embed")
        print(f"[EMBED] model={OLLAMA_EMBED_MODEL} text_len={len(text)}")

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(f"{self.base_url}/embed", json=payload)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            print(f"[EMBED] embed request failed: {exc}")
            raise

        embeddings = data.get("embeddings", [])
        if not embeddings:
            raise ValueError("No embeddings returned from Ollama")

        print("[EMBED] embeddings received successfully")
        return embeddings[0]

    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        va = np.array(a, dtype=float)
        vb = np.array(b, dtype=float)

        denom = np.linalg.norm(va) * np.linalg.norm(vb)
        if denom == 0:
            return 0.0
        return float(np.dot(va, vb) / denom)


embedding_service = EmbeddingService()