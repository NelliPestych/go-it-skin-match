import logging

from sqlalchemy.orm import Session

from app.db.session import engine, SessionLocal
from app.models.base import Base
from app.db.seed import seed_products

logger = logging.getLogger(__name__)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        seed_products(db)
    finally:
        db.close()
    logger.info("Database initialized")
