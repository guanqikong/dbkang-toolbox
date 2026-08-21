import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

test_data_dir = Path(tempfile.mkdtemp(prefix="dbkang-tests-"))
database_file = test_data_dir / "test.sqlite3"
os.environ["DBKANG_DATABASE_URL"] = f"sqlite:///{database_file}"
os.environ["DBKANG_AUTO_CREATE_TABLES"] = "true"
os.environ["DBKANG_SECRET_KEY"] = "test-secret"
os.environ["DBKANG_ADMIN_USERNAME"] = "admin"
os.environ["DBKANG_ADMIN_PASSWORD"] = "test-password"
os.environ["DBKANG_BOOTSTRAP_COURSE_IDS"] = "demo-course"
os.environ["DBKANG_UPLOADS_DIR"] = str(test_data_dir / "uploads")

from app.main import app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def student_payload() -> dict[str, object]:
    return {
        "studentId": "2099000101",
        "realName": "测试学生",
        "grade": 2099,
        "classNumber": 1,
        "classId": "800000001",
        "courseId": "demo-course",
        "courseName": "大学计算机基础",
        "courseEnded": False,
    }
