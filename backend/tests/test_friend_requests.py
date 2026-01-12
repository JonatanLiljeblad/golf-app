import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
import app.models.player  # noqa: F401
import app.models.friend  # noqa: F401
import app.models.friend_request  # noqa: F401
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


def test_friend_request_flow(client):
    client.get("/api/v1/players/me", headers={"X-User-Id": "u1"})
    client.get("/api/v1/players/me", headers={"X-User-Id": "u2"})

    # u1 sends request to u2
    r = client.post(
        "/api/v1/friends/requests", json={"ref": "u2"}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    assert r.json()["ok"] is True
    assert r.json()["accepted"] is False

    incoming = client.get("/api/v1/friends/requests", headers={"X-User-Id": "u2"})
    assert incoming.status_code == 200
    reqs = incoming.json()
    assert len(reqs) == 1

    req_id = reqs[0]["id"]

    # u2 accepts
    a = client.post(
        f"/api/v1/friends/requests/{req_id}/accept", headers={"X-User-Id": "u2"}
    )
    assert a.status_code == 200

    f1 = client.get("/api/v1/friends", headers={"X-User-Id": "u1"}).json()
    f2 = client.get("/api/v1/friends", headers={"X-User-Id": "u2"}).json()
    assert len(f1) == 1
    assert len(f2) == 1
