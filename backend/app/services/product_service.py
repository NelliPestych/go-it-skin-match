from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.product_repo import ProductRepository
from app.schemas.product import ProductCreate


class ProductService:
    def __init__(self, db: Session):
        self.repo = ProductRepository(db)

    def list(self, category: Optional[str] = None) -> List[Product]:
        return self.repo.list(category)

    def create(self, payload: ProductCreate) -> Product:
        return self.repo.create(payload)
