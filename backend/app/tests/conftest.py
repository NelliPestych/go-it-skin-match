"""In-memory SQLite engine + clean schema per test."""
from __future__ import annotations

import os
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:9/0")  # unreachable

from app.api.deps import cache_dependency  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services.cache_service import CacheService  # noqa: E402


class _NoopCache(CacheService):
    def __init__(self):  # type: ignore[override]
        self._client = None
        self._available = False

    def health(self) -> bool:
        return False


@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine) -> Generator:
    TestingSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    db = TestingSession()
    # Engine unit tests need a non-empty catalogue.
    from app.db.seed import seed_products

    seed_products(db)
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client(db_engine) -> Generator[TestClient, None, None]:
    TestingSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)

    def _get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[cache_dependency] = lambda: _NoopCache()

    from app.db.seed import seed_products

    db = TestingSession()
    try:
        seed_products(db)
    finally:
        db.close()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
