"""Idempotent seed data for the product catalogue.

Runs on application startup. If the catalogue already has products,
seeding is skipped, so re-deploys are safe.
"""
from __future__ import annotations

import logging
from typing import List

from sqlalchemy.orm import Session

from app.repositories.product_repo import ProductRepository
from app.schemas.product import ProductCreate

logger = logging.getLogger(__name__)


SEED_PRODUCTS: List[ProductCreate] = [
    ProductCreate(
        brand="CeraVe",
        name="Hydrating Facial Cleanser",
        category="cleanser",
        skin_types=["dry", "normal", "combination"],
        concerns=["hydration", "sensitivity"],
        ingredients=["ceramides", "hyaluronic acid", "glycerin"],
        price=14.99,
        affiliate_url="https://example.com/cerave-hydrating",
        description="Gentle non-foaming cleanser with ceramides and hyaluronic acid.",
    ),
    ProductCreate(
        brand="DermaCalm",
        name="Clear-Skin Foaming Gel Cleanser",
        category="cleanser",
        skin_types=["oily", "combination"],
        concerns=["oiliness", "pores"],
        ingredients=["zinc pidolate", "salicylic acid"],
        price=15.99,
        affiliate_url="https://example.com/dermacalm-clear-skin",
        description="Foaming cleanser for oily, blemish-prone skin.",
    ),
    ProductCreate(
        brand="The Ordinary",
        name="Niacinamide 10% + Zinc 1%",
        category="serum",
        skin_types=["oily", "combination", "normal"],
        concerns=["pores", "oiliness", "redness"],
        ingredients=["niacinamide", "zinc PCA"],
        price=6.50,
        affiliate_url="https://example.com/ordinary-niacinamide",
        description="Targets visible shine and enlarged pores.",
    ),
    ProductCreate(
        brand="The Ordinary",
        name="Hyaluronic Acid 2% + B5",
        category="serum",
        skin_types=["dry", "normal", "combination", "oily"],
        concerns=["hydration"],
        ingredients=["hyaluronic acid", "panthenol"],
        price=8.90,
        affiliate_url="https://example.com/ordinary-ha",
        description="Multi-depth hydration serum with hyaluronic acid.",
    ),
    ProductCreate(
        brand="Paula's Choice",
        name="C15 Super Booster",
        category="serum",
        skin_types=["all"],
        concerns=["pigmentation"],
        ingredients=["vitamin c", "vitamin e", "ferulic acid"],
        price=49.0,
        affiliate_url="https://example.com/pc-c15",
        description="Brightening vitamin C serum for uneven tone.",
    ),
    ProductCreate(
        brand="CeraVe",
        name="Moisturizing Cream",
        category="moisturizer",
        skin_types=["dry", "normal"],
        concerns=["hydration", "sensitivity"],
        ingredients=["ceramides", "hyaluronic acid"],
        price=18.99,
        affiliate_url="https://example.com/cerave-cream",
        description="Rich barrier-supporting moisturizer.",
    ),
    ProductCreate(
        brand="Neutrogena",
        name="Hydro Boost Water Gel",
        category="moisturizer",
        skin_types=["oily", "combination", "normal"],
        concerns=["hydration"],
        ingredients=["hyaluronic acid", "glycerin"],
        price=19.99,
        affiliate_url="https://example.com/neutrogena-hydroboost",
        description="Lightweight gel moisturizer for oilier skin.",
    ),
    ProductCreate(
        brand="DermaCalm",
        name="Comfort Daily Moisturizer",
        category="moisturizer",
        skin_types=["dry", "normal", "combination"],
        concerns=["redness", "sensitivity"],
        ingredients=["niacinamide", "prebiotic thermal water"],
        price=22.5,
        affiliate_url="https://example.com/dermacalm-comfort",
        description="Soothing daily moisturizer for sensitive skin.",
    ),
    ProductCreate(
        brand="EltaMD",
        name="UV Clear Broad-Spectrum SPF 46",
        category="sunscreen",
        skin_types=["oily", "combination", "normal", "dry"],
        concerns=["redness", "sensitivity", "pigmentation"],
        ingredients=["zinc oxide", "octinoxate", "niacinamide"],
        price=39.0,
        affiliate_url="https://example.com/eltamd-uvclear",
        description="Lightweight mineral-hybrid SPF for sensitive skin.",
    ),
    ProductCreate(
        brand="Beauty of Joseon",
        name="Relief Sun: Rice + Probiotics SPF50+",
        category="sunscreen",
        skin_types=["all"],
        concerns=["pigmentation", "hydration"],
        ingredients=["rice extract", "probiotics"],
        price=18.0,
        affiliate_url="https://example.com/boj-relief-sun",
        description="Hydrating chemical sunscreen, comfortable daily wear.",
    ),
    ProductCreate(
        brand="Pixi",
        name="Glow Tonic",
        category="toner",
        skin_types=["combination", "oily", "normal"],
        concerns=["pores", "pigmentation"],
        ingredients=["glycolic acid", "aloe vera"],
        price=15.0,
        affiliate_url="https://example.com/pixi-glow",
        description="5% glycolic acid toner for daily exfoliation.",
    ),
    ProductCreate(
        brand="Avene",
        name="Thermal Spring Water",
        category="toner",
        skin_types=["dry", "normal", "combination"],
        concerns=["redness", "sensitivity", "hydration"],
        ingredients=["thermal spring water"],
        price=11.0,
        affiliate_url="https://example.com/avene-water",
        description="Soothing mist for irritated and reactive skin.",
    ),
    ProductCreate(
        brand="The Inkey List",
        name="Retinol Serum",
        category="treatment",
        skin_types=["normal", "combination", "oily"],
        concerns=["pigmentation", "pores"],
        ingredients=["retinol", "squalane"],
        price=10.0,
        affiliate_url="https://example.com/inkey-retinol",
        description="Slow-release retinol for evening use.",
    ),
]


def seed_products(db: Session) -> None:
    repo = ProductRepository(db)
    if repo.count() > 0:
        logger.info("Products already seeded — skipping.")
        return
    repo.bulk_create(SEED_PRODUCTS)
    logger.info("Seeded %d products.", len(SEED_PRODUCTS))
