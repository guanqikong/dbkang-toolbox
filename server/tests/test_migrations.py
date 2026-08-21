import os
import subprocess
import sys
from pathlib import Path

import sqlalchemy as sa

SERVER_ROOT = Path(__file__).resolve().parents[1]


def run_upgrade(database: Path, revision: str) -> None:
    environment = os.environ.copy()
    environment["DBKANG_DATABASE_URL"] = f"sqlite:///{database}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", revision],
        cwd=SERVER_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def assert_class_id_schema(database: Path) -> None:
    inspector = sa.inspect(sa.create_engine(f"sqlite:///{database}"))
    columns = {column["name"] for column in inspector.get_columns("course_memberships")}
    indexes = {index["name"] for index in inspector.get_indexes("course_memberships")}
    assert "chaoxing_class_id" in columns
    assert "ix_course_memberships_chaoxing_class_id" in indexes


def test_upgrade_adds_class_id_to_legacy_schema(tmp_path: Path) -> None:
    database = tmp_path / "legacy.sqlite3"
    engine = sa.create_engine(f"sqlite:///{database}")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE course_memberships (id INTEGER PRIMARY KEY)")
        connection.exec_driver_sql(
            "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"
        )
        connection.exec_driver_sql(
            "INSERT INTO alembic_version (version_num) VALUES ('20260821_0001')"
        )

    run_upgrade(database, "head")
    assert_class_id_schema(database)


def test_upgrade_accepts_class_id_created_by_initial_metadata(tmp_path: Path) -> None:
    database = tmp_path / "current-initial.sqlite3"
    run_upgrade(database, "20260821_0001")
    assert_class_id_schema(database)

    run_upgrade(database, "head")
    assert_class_id_schema(database)
