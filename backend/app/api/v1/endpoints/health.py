from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import cache_dependency
from app.db.session import get_db
from app.services.cache_service import CacheService

router = APIRouter()


@router.get("/health", summary="Service health check")
def health(
    db: Session = Depends(get_db),
    cache: CacheService = Depends(cache_dependency),
) -> dict:
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "up" if db_ok else "down",
        "redis": "up" if cache.health() else "down",
    }
