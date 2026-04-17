import redis
import os
import json

# Redis connection configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

try:
    cache = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    # Test connection
    cache.ping()
except Exception as e:
    cache = None
    print(f"Warning: Failed to connect to Redis - {e}")

def get_cached_job(job_id: str):
    """"Retrieve job detail from cache"""
    if cache:
        res = cache.get(f"job:{job_id}")
        if res:
            return json.loads(res)
    return None

def set_cached_job(job_id: str, job_dict: dict, ttl: int = 3600):
    """Cache job detail. Invalidate/update when job changes."""
    if cache:
        cache.setex(f"job:{job_id}", ttl, json.dumps(job_dict))

def invalidate_job_cache(job_id: str):
    """Delete job from cache (e.g., when it is updated or closed)"""
    if cache:
        cache.delete(f"job:{job_id}")

def invalidate_search_cache():
    """Delete all cached job search results after job mutations."""
    if cache:
        for key in cache.scan_iter(match="search:*"):
            cache.delete(key)

def get_cached_search(key: str):
    if cache:
        res = cache.get(f"search:{key}")
        if res:
            return json.loads(res)
    return None

def set_cached_search(key: str, results: list, ttl: int = 300):
    if cache:
        cache.setex(f"search:{key}", ttl, json.dumps(results))
