import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
import app.models.player  # noqa: F401
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


def test_group_round_owner_can_enter_scores_for_all(client):
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()

    client.get("/api/v1/players/me", headers={"X-User-Id": "u2"})
    client.get("/api/v1/players/me", headers={"X-User-Id": "u3"})

    db = next(app.dependency_overrides[get_db]())
    from app.models.course import CourseTee

    tee = CourseTee(course_id=c["id"], tee_name="Default")
    db.add(tee)
    db.commit()

    r = client.post(
        "/api/v1/rounds",
        json={"course_id": c["id"], "tee_id": tee.id, "player_ids": ["u2", "u3"]},
        headers={"X-User-Id": "u1"},
    )
    assert r.status_code == 201
    round_id = r.json()["id"]
    assert r.json()["owner_id"] == "u1"
    assert set(r.json()["player_ids"]) == {"u1", "u2", "u3"}

    # Owner enters scores for all players on hole 1.
    for pid, strokes in [("u1", 5), ("u2", 4), ("u3", 6)]:
        s = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": 1, "strokes": strokes, "player_id": pid},
            headers={"X-User-Id": "u1"},
        )
        assert s.status_code == 200

    g = client.get(f"/api/v1/rounds/{round_id}", headers={"X-User-Id": "u1"})
    assert g.status_code == 200
    data = g.json()
    assert data["holes"][0]["strokes"] == {"u1": 5, "u2": 4, "u3": 6}


def test_group_round_non_owner_cannot_enter_scores_for_others(client):
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()

    client.get("/api/v1/players/me", headers={"X-User-Id": "u2"})

    db = next(app.dependency_overrides[get_db]())
    from app.models.course import CourseTee

    tee = CourseTee(course_id=c["id"], tee_name="Default")
    db.add(tee)
    db.commit()

    r = client.post(
        "/api/v1/rounds",
        json={"course_id": c["id"], "tee_id": tee.id, "player_ids": ["u2"]},
        headers={"X-User-Id": "u1"},
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    resp = client.post(
        f"/api/v1/rounds/{round_id}/scores",
        json={"hole_number": 1, "strokes": 4, "player_id": "u1"},
        headers={"X-User-Id": "u2"},
    )
    assert resp.status_code == 403
