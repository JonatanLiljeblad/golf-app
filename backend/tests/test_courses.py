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


def test_create_and_list_courses(client):
    payload = {
        "name": "My Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
        "tees": [
            {
                "tee_name": "White",
                "course_rating_men": 72.0,
                "slope_rating_men": 113,
                "course_rating_women": 72.0,
                "slope_rating_women": 113,
                "course_rating": 72.0,
                "slope_rating": 113,
                "hole_distances": [
                    {"hole_number": i, "distance": 350} for i in range(1, 10)
                ],
            }
        ],
    }

    resp = client.post("/api/v1/courses", json=payload, headers={"X-User-Id": "u1"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Course"
    assert len(data["holes"]) == 9

    resp2 = client.get("/api/v1/courses", headers={"X-User-Id": "u1"})
    assert resp2.status_code == 200
    courses = resp2.json()
    assert len(courses) == 1
    assert courses[0]["name"] == "My Course"

    # Courses are global/readable by any user.
    resp_other = client.get("/api/v1/courses", headers={"X-User-Id": "u2"})
    assert resp_other.status_code == 200
    assert len(resp_other.json()) == 1

    get_other = client.get(f"/api/v1/courses/{data['id']}", headers={"X-User-Id": "u2"})
    assert get_other.status_code == 200

    # But only the creator can delete (archive).
    d_forbidden = client.delete(f"/api/v1/courses/{data['id']}", headers={"X-User-Id": "u2"})
    assert d_forbidden.status_code == 403

    d = client.delete(f"/api/v1/courses/{data['id']}", headers={"X-User-Id": "u1"})
    assert d.status_code == 200

    resp3 = client.get("/api/v1/courses", headers={"X-User-Id": "u1"})
    assert resp3.status_code == 200
    assert resp3.json() == []


def test_update_course_idempotent(client):
    payload = {
        "name": "Stable Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
        "tees": [
            {
                "tee_name": "White",
                "course_rating_men": 72.0,
                "slope_rating_men": 113,
                "course_rating_women": 72.0,
                "slope_rating_women": 113,
                "course_rating": 72.0,
                "slope_rating": 113,
                "hole_distances": [
                    {"hole_number": i, "distance": 350} for i in range(1, 10)
                ],
            }
        ],
    }

    created = client.post("/api/v1/courses", json=payload, headers={"X-User-Id": "u1"})
    assert created.status_code == 201
    course = created.json()
    tee_id = course["tees"][0]["id"]

    payload2 = {**payload}
    payload2["tees"] = [{**payload["tees"][0], "id": tee_id}]

    updated = client.put(
        f"/api/v1/courses/{course['id']}",
        json=payload2,
        headers={"X-User-Id": "u1"},
    )
    assert updated.status_code == 200
    course2 = updated.json()
    assert course2["id"] == course["id"]
    assert course2["name"] == course["name"]
    assert course2["tees"][0]["id"] == tee_id


def test_cannot_archive_course_with_active_rounds(client):
    payload = {
        "name": "Shared Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
        "tees": [
            {
                "tee_name": "Default",
                "course_rating_men": 72.0,
                "slope_rating_men": 113,
                "course_rating_women": 72.0,
                "slope_rating_women": 113,
                "course_rating": 72.0,
                "slope_rating": 113,
                "hole_distances": [
                    {"hole_number": i, "distance": 350} for i in range(1, 10)
                ],
            }
        ],
    }

    resp = client.post("/api/v1/courses", json=payload, headers={"X-User-Id": "u1"})
    assert resp.status_code == 201
    course = resp.json()

    # Another user starts a round on the same course.
    tee_id = course["tees"][0]["id"]

    r = client.post(
        "/api/v1/rounds",
        json={"course_id": course["id"], "tee_id": tee_id},
        headers={"X-User-Id": "u2"},
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    # Creator cannot archive while there are active rounds.
    d_blocked = client.delete(f"/api/v1/courses/{course['id']}", headers={"X-User-Id": "u1"})
    assert d_blocked.status_code == 409

    # Finish the round (auto-completes once all holes have scores).
    for hole in range(1, 10):
        s = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hole, "strokes": 4},
            headers={"X-User-Id": "u2"},
        )
        assert s.status_code == 200

    d_ok = client.delete(f"/api/v1/courses/{course['id']}", headers={"X-User-Id": "u1"})
    assert d_ok.status_code == 200

    resp3 = client.get("/api/v1/courses", headers={"X-User-Id": "u1"})
    assert resp3.status_code == 200
    assert resp3.json() == []


def test_update_course_without_changes(client):
    """Test that saving a course without changes doesn't cause an error."""
    payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
        "tees": [
            {
                "tee_name": "White",
                "course_rating_men": 72.0,
                "slope_rating_men": 113,
                "course_rating_women": 70.0,
                "slope_rating_women": 110,
                "course_rating": 72.0,
                "slope_rating": 113,
                "hole_distances": [
                    {"hole_number": i, "distance": 350} for i in range(1, 10)
                ],
            }
        ],
    }

    # Create course
    resp = client.post("/api/v1/courses", json=payload, headers={"X-User-Id": "u1"})
    assert resp.status_code == 201
    course = resp.json()
    course_id = course["id"]

    # Update with the exact same payload (simulates user clicking Save without changes)
    resp2 = client.put(f"/api/v1/courses/{course_id}", json=payload, headers={"X-User-Id": "u1"})
    assert resp2.status_code == 200
    updated = resp2.json()
    assert updated["name"] == "Test Course"
    assert len(updated["holes"]) == 9
    assert len(updated["tees"]) == 1
    assert updated["tees"][0]["tee_name"] == "White"


def test_update_course_with_changes(client):
    """Test that updating a course with changes works correctly."""
    payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
        "tees": [
            {
                "tee_name": "White",
                "course_rating_men": 72.0,
                "slope_rating_men": 113,
                "course_rating_women": 70.0,
                "slope_rating_women": 110,
                "course_rating": 72.0,
                "slope_rating": 113,
                "hole_distances": [
                    {"hole_number": i, "distance": 350} for i in range(1, 10)
                ],
            }
        ],
    }

    # Create course
    resp = client.post("/api/v1/courses", json=payload, headers={"X-User-Id": "u1"})
    assert resp.status_code == 201
    course = resp.json()
    course_id = course["id"]

    # Update with changes
    updated_payload = payload.copy()
    updated_payload["name"] = "Updated Course"
    updated_payload["tees"][0]["hole_distances"][0]["distance"] = 360
    
    resp2 = client.put(f"/api/v1/courses/{course_id}", json=updated_payload, headers={"X-User-Id": "u1"})
    assert resp2.status_code == 200
    updated = resp2.json()
    assert updated["name"] == "Updated Course"
    assert updated["tees"][0]["hole_distances"][0]["distance"] == 360
