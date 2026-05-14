from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "SkinMatch"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Stored as a comma-separated string in .env. We avoid List[str] here
    # because pydantic-settings tries to JSON-parse list-typed env vars
    # before any validator can run.
    backend_cors_origins: str = "http://localhost:5173,http://localhost:3000"

    database_url: str = "postgresql+psycopg2://skinmatch:skinmatch@postgres:5432/skinmatch"

    redis_url: str = "redis://redis:6379/0"

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10

    ai_analyzer: str = "heuristic"
    ai_model_path: str = "./app/ai/models/skin_model.onnx"

    # Top-level skin analysis provider selector. Drives the
    # `SkinAnalysisProvider` factory in `app/ai/providers/factory.py`.
    # `ai_analyzer` above stays as a sub-lever for the *local*
    # provider (heuristic | onnx); the two are intentionally separate
    # concerns (provider routing vs local-impl choice).
    skin_analysis_provider: str = "local"

    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440

    @property
    def cors_origins_list(self) -> List[str]:
        return [item.strip() for item in self.backend_cors_origins.split(",") if item.strip()]

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
