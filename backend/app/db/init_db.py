"""DB initialisation + lightweight idempotent additive migrations."""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db.session import engine, SessionLocal
from app.models.base import Base
from app.db.seed import seed_products

logger = logging.getLogger(__name__)


# (table, column, ddl) — idempotent ALTER TABLE on startup. Postgres + SQLite.
_ADDITIVE_MIGRATIONS = (
    ("users", "password_hash", "VARCHAR(255)"),
)


def _column_exists(conn, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspect(conn).get_columns(table))


def _apply_additive_migrations() -> None:
    dialect = engine.dialect.name
    with engine.begin() as conn:
        for table, column, ddl in _ADDITIVE_MIGRATIONS:
            try:
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            f"ALTER TABLE {table} "
                            f"ADD COLUMN IF NOT EXISTS {column} {ddl}"
                        )
                    )
                else:
                    if not _column_exists(conn, table, column):
                        conn.execute(
                            text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                        )
            except Exception as exc:  # pragma: no cover
                logger.warning(
                    "additive migration %s.%s skipped: %s", table, column, exc
                )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _apply_additive_migrations()
    db: Session = SessionLocal()
    try:
        seed_products(db)
    finally:
        db.close()
    logger.info("Database initialized")
