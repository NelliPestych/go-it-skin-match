"""SkinMatch FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.security import assert_secret_safe_for_env
from app.db.init_db import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fail fast on insecure config before any token can be minted.
    assert_secret_safe_for_env(settings.app_env, settings.secret_key)
    try:
        init_db()
    except Exception as exc:  # pragma: no cover
        logger.exception("DB initialization failed: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    description=(
        "SkinMatch — AI-driven skincare recommendations. "
        "An MVP REST API exposing skin analysis, quiz, recommendation, "
        "and beauty-plan endpoints."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
    }
