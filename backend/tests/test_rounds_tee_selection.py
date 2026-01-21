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


def test_start_round_with_tee_sets_distances(client: TestClient):
    # Create a course with base distances.
    course_payload = {
        "name": "Tee Course",
        "holes": [{"number": i, "par": 4, "distance": 100} for i in range(1, 10)],
    }
    c = client.post("/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}).json()

    # Add a tee and per-hole distances directly via DB.
    db = next(app.dependency_overrides[get_db]())
    from app.models.course import CourseTee, TeeHoleDistance

    tee = CourseTee(course_id=c["id"], tee_name="Blue")
    db.add(tee)
    db.flush()
    db.add_all([TeeHoleDistance(tee_id=tee.id, hole_number=i, distance=200 + i) for i in range(1, 10)])
    db.commit()

    r = client.post(
        "/api/v1/rounds",
        json={"course_id": c["id"], "tee_id": tee.id},
        headers={"X-User-Id": "u1"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["tee_id"] == tee.id
    assert data["tee"]["tee_name"] == "Blue"
    assert data["holes"][0]["distance"] == 201


def test_start_round_with_tee_from_other_course_rejected(client: TestClient):
    c1 = client.post(
        "/api/v1/courses",
        json={"name": "C1", "holes": [{"number": i, "par": 4} for i in range(1, 10)]},
        headers={"X-User-Id": "u1"},
    ).json()
    c2 = client.post(
        "/api/v1/courses",
        json={"name": "C2", "holes": [{"number": i, "par": 4} for i in range(1, 10)]},
        headers={"X-User-Id": "u1"},
    ).json()

    db = next(app.dependency_overrides[get_db]())
    from app.models.course import CourseTee

    tee_other = CourseTee(course_id=c2["id"], tee_name="Wrong")
    db.add(tee_other)
    db.commit()

    r = client.post(
        "/api/v1/rounds",
        json={"course_id": c1["id"], "tee_id": tee_other.id},
        headers={"X-User-Id": "u1"},
    )
    assert r.status_code == 400
    assert "tee_id" in r.json()["detail"]
