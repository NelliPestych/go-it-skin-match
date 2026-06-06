"""Database initialisation + lightweight idempotent migrations.

We don't run Alembic for the MVP.  `Base.metadata.create_all(...)` is
sufficient for fresh deployments — every table is created from the
model definitions.  But it does NOT add new columns to *existing*
tables, so any column added after the first deploy needs a one-off
ALTER TABLE.  Rather than ship an Alembic setup just for this, we
keep a tiny table of additive column-migration steps here.  Each
step is idempotent (catches "already exists" and moves on), runs
on every startup, and works for both Postgres and SQLite.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db.session import engine, SessionLocal
from app.models.base import Base
from app.db.seed import seed_products

logger = logging.getLogger(__name__)


# (table_name, column_name, column_ddl)
# Add a row here when you need to introduce a new nullable column on
# an existing table.  Order doesn't matter — each row is independent.
_ADDITIVE_MIGRATIONS = (
    ("users", "password_hash", "VARCHAR(255)"),
)


def _column_exists(conn, table: str, column: str) -> bool:
    inspector = inspect(conn)
    return any(c["name"] == column for c in inspector.get_columns(table))


def _apply_additive_migrations() -> None:
    """Add columns the model defines but the live table is missing.

    Dialect-aware: Postgres supports `ADD COLUMN IF NOT EXISTS`,
    SQLite does not — we introspect first there.  Either way the
    operation is a no-op when the column is already present.
    """
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
            except Exception as exc:  # pragma: no cover - defensive
                # Never let a startup migration abort the service —
                # surface a warning and let auth requests fail later
                # with a clear error if the column genuinely missing.
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
