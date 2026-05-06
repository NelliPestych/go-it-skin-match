from fastapi import APIRouter

from app.api.v1.endpoints import (
    analysis,
    auth,
    health,
    plan,
    products,
    quiz,
    recommendations,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(quiz.router, prefix="/quiz", tags=["quiz"])
api_router.include_router(recommendations.router, prefix="/recommendations", tags=["recommendations"])
api_router.include_router(plan.router, prefix="/plan", tags=["plan"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
