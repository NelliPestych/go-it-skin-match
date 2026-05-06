from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.product import Product
from app.schemas.product import ProductCreate


class ProductRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, category: Optional[str] = None) -> List[Product]:
        query = self.db.query(Product)
        if category:
            query = query.filter(Product.category == category)
        return query.order_by(Product.brand, Product.name).all()

    def get(self, product_id: int) -> Optional[Product]:
        return self.db.get(Product, product_id)

    def create(self, payload: ProductCreate) -> Product:
        product = Product(**payload.model_dump())
        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)
        return product

    def bulk_create(self, items: List[ProductCreate]) -> List[Product]:
        records = [Product(**i.model_dump()) for i in items]
        self.db.add_all(records)
        self.db.commit()
        for record in records:
            self.db.refresh(record)
        return records

    def count(self) -> int:
        return self.db.query(Product).count()
