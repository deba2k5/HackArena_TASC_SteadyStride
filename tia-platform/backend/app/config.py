"""Application configuration — reads from environment / .env file."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://tia_user:tia_pass@localhost:5432/tia_db"
    SYNC_DATABASE_URL: str = "postgresql://tia_user:tia_pass@localhost:5432/tia_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Storage
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # AI
    LAYOUTLMV3_MODEL: str = "microsoft/layoutlmv3-base"
    TESSERACT_CMD: str = "/usr/bin/tesseract"
    CONFIDENCE_THRESHOLD: float = 0.75
    FRAUD_RISK_THRESHOLD: float = 0.65

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    APP_NAME: str = "Touchless Invoice Agent"
    APP_VERSION: str = "1.0.0"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
