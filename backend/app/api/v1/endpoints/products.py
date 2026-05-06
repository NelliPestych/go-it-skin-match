from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.product import ProductCreate, ProductRead
from app.services.product_service import ProductService

router = APIRouter()


@router.get(
    "",
    response_model=List[ProductRead],
    summary="List products (optionally filtered by category)",
)
def list_products(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
) -> List[ProductRead]:
    products = ProductService(db).list(category=category)
    return [ProductRead.model_validate(p) for p in products]


@router.post(
    "",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a product (seed/admin/demo endpoint)",
)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
) -> ProductRead:
    product = ProductService(db).create(payload)
    return ProductRead.model_validate(product)
