from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

SERVER_ROOT = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = SERVER_ROOT.parent


def static_directory(container_path: Path, development_path: Path) -> Path:
    """在镜像内读取 /app/static，本地统一入口则直接读取 Vite 构建产物。"""
    return container_path if container_path.exists() else development_path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_prefix="DBKANG_",
        extra="ignore",
    )

    app_name: str = "DBKang Toolbox"
    app_version: str = "0.1.4"
    database_url: str = f"sqlite:///{SERVER_ROOT / 'data' / 'dbkang.sqlite3'}"
    secret_key: str = "change-me-before-production"
    admin_username: str = "admin"
    admin_password: str = "change-me"
    bootstrap_course_ids: Annotated[list[str], NoDecode] = ["demo-course"]
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]
    assets_dir: Path = SERVER_ROOT / "assets"
    music_dir: Path = SERVER_ROOT / "assets" / "music"
    cover_cache_dir: Path = SERVER_ROOT / "data" / "cache" / "covers"
    uploads_dir: Path = SERVER_ROOT / "data" / "uploads"
    toolbox_static_dir: Path = static_directory(
        SERVER_ROOT / "static" / "toolbox", REPOSITORY_ROOT / "apps" / "toolbox" / "dist"
    )
    admin_static_dir: Path = static_directory(
        SERVER_ROOT / "static" / "admin", REPOSITORY_ROOT / "apps" / "admin" / "dist"
    )
    updates_dir: Path = static_directory(
        SERVER_ROOT / "static" / "updates", REPOSITORY_ROOT / "release" / "browser"
    )
    auto_create_tables: bool = False
    focus_heartbeat_seconds: int = 10
    focus_ttl_seconds: int = 30
    admin_token_minutes: int = 480
    timezone: str = "Asia/Shanghai"

    @field_validator("bootstrap_course_ids", "cors_origins", mode="before")
    @classmethod
    def split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
