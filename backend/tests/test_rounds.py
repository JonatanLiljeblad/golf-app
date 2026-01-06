import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
import app.models.course  # noqa: F401
import app.models.round  # noqa: F401
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


def test_round_flow(client):
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()

    r = client.post(
        "/api/v1/rounds", json={"course_id": c["id"]}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    round_id = r.json()["id"]
    assert r.json()["course_name"] == "Test Course"

    lst = client.get("/api/v1/rounds", headers={"X-User-Id": "u1"})
    assert lst.status_code == 200
    assert any(x["id"] == round_id for x in lst.json())

    # First score should not complete the round.
    s = client.post(
        f"/api/v1/rounds/{round_id}/scores",
        json={"hole_number": 1, "strokes": 5},
        headers={"X-User-Id": "u1"},
    )
    assert s.status_code == 200

    g1 = client.get(f"/api/v1/rounds/{round_id}", headers={"X-User-Id": "u1"})
    assert g1.status_code == 200
    assert g1.json()["completed_at"] is None

    # Fill remaining holes; round should auto-complete after the last one.
    for hn in range(2, 10):
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 4},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    g = client.get(f"/api/v1/rounds/{round_id}", headers={"X-User-Id": "u1"})
    assert g.status_code == 200
    data = g.json()
    assert data["course_name"] == "Test Course"
    assert data["completed_at"] is not None
    assert data["total_par"] == 36
    assert data["total_strokes"] == 5 + 8 * 4
    assert data["holes"][0] == {"number": 1, "par": 4, "strokes": 5}
