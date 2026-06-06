from functools import lru_cache
from pathlib import Path
from typing import List, Optional

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

    # Stored as comma-separated string; pydantic-settings tries to JSON-parse List[str].
    backend_cors_origins: str = "http://localhost:5173,http://localhost:3000"

    database_url: str = "postgresql+psycopg2://skinmatch:skinmatch@postgres:5432/skinmatch"

    redis_url: str = "redis://redis:6379/0"

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10

    ai_analyzer: str = "heuristic"
    ai_model_path: str = "./app/ai/models/skin_model.onnx"

    skin_analysis_provider: str = "local"
    # Allowed: local | mock_haut. Cycling back to haut_ai/openai_vision is rejected.
    skin_analysis_fallback_provider: Optional[str] = None

    # Optional so settings load on dev machines without credentials; provider raises at construct time.
    haut_ai_api_key: Optional[str] = None
    haut_ai_base_url: str = "https://api.haut.ai"
    haut_ai_timeout_seconds: float = 30.0

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"
    openai_timeout_seconds: float = 30.0

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
