import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
import app.models.course  # noqa: F401
from app.main import app


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_create_and_list_courses(client):
    payload = {
        "name": "My Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
    }

    resp = client.post("/api/v1/courses", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Course"
    assert len(data["holes"]) == 9

    resp2 = client.get("/api/v1/courses")
    assert resp2.status_code == 200
    courses = resp2.json()
    assert len(courses) == 1
    assert courses[0]["name"] == "My Course"
