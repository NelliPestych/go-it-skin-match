from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get(self, user_id: int) -> Optional[User]:
        return self.db.get(User, user_id)

    def create(self, email: str) -> User:
        user = User(email=email)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_with_password(self, email: str, password_hash: str) -> User:
        """Create an account with a pre-hashed password (never sees plaintext)."""
        user = User(email=email, password_hash=password_hash)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_or_create(self, email: str) -> User:
        existing = self.get_by_email(email)
        if existing:
            return existing
        return self.create(email)
