import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db, get_current_user_id
from app.db.base import Base
from app.models.activity_event import ActivityEvent
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

    def override_get_current_user_id():
        return "u1"

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = override_get_current_user_id
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_pb_events_on_round_completion(client):
    """Test that PB events (pb_overall and pb_course) are emitted on round completion for non-guest participants."""
    # Create a course
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 19)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create a round
    r = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    # Submit scores for all 18 holes to complete the round
    for hn in range(1, 19):
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 4},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    # Verify round is completed
    g = client.get(f"/api/v1/rounds/{round_id}", headers={"X-User-Id": "u1"})
    assert g.status_code == 200
    assert g.json()["completed_at"] is not None

    # Verify PB events were created (pb_overall and pb_course with hole_number=0)
    # Get the database engine from the test client
    db = next(app.dependency_overrides[get_db]())
    try:
        events = db.execute(
            select(ActivityEvent).where(ActivityEvent.round_id == round_id)
        ).scalars().all()

        # Should have both pb_overall and pb_course events
        pb_overall_events = [e for e in events if e.kind == "pb_overall"]
        pb_course_events = [e for e in events if e.kind == "pb_course"]

        assert len(pb_overall_events) == 1, "Should have exactly 1 pb_overall event"
        assert len(pb_course_events) == 1, "Should have exactly 1 pb_course event"

        # Both should have hole_number=0 (round-level event)
        assert pb_overall_events[0].hole_number == 0
        assert pb_course_events[0].hole_number == 0

        # Verify event details
        assert pb_overall_events[0].strokes == 72  # 18 * 4
        assert pb_overall_events[0].par == 72  # 18 * 4
        assert pb_course_events[0].strokes == 72
        assert pb_course_events[0].par == 72
    finally:
        db.close()


def test_pb_events_idempotent(client):
    """Test that PB events are idempotent - replaying score submission doesn't duplicate events."""
    # Create a course
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 19)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create a round
    r = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    # Submit scores for all 18 holes
    for hn in range(1, 19):
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 4},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    # Get the database to count events
    db = next(app.dependency_overrides[get_db]())
    try:
        events_before = db.execute(
            select(ActivityEvent).where(ActivityEvent.round_id == round_id)
        ).scalars().all()
        pb_overall_count_before = len([e for e in events_before if e.kind == "pb_overall"])
        pb_course_count_before = len([e for e in events_before if e.kind == "pb_course"])
    finally:
        db.close()

    # Re-submit the same last score (idempotency test)
    resp = client.post(
        f"/api/v1/rounds/{round_id}/scores",
        json={"hole_number": 18, "strokes": 4},
        headers={"X-User-Id": "u1"},
    )
    assert resp.status_code == 200

    # Verify event counts haven't changed (idempotent)
    db = next(app.dependency_overrides[get_db]())
    try:
        events_after = db.execute(
            select(ActivityEvent).where(ActivityEvent.round_id == round_id)
        ).scalars().all()
        pb_overall_count_after = len([e for e in events_after if e.kind == "pb_overall"])
        pb_course_count_after = len([e for e in events_after if e.kind == "pb_course"])

        assert pb_overall_count_after == pb_overall_count_before
        assert pb_course_count_after == pb_course_count_before
    finally:
        db.close()


def test_pb_events_not_for_guests(client):
    """Test that PB events are NOT emitted for guest participants."""
    # Create a course
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 19)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create a round with a guest player
    r = client.post(
        "/api/v1/rounds",
        json={
            "course_id": course_id,
            "guest_players": [{"name": "Guest Player", "handicap": 10.0}],
        },
        headers={"X-User-Id": "u1"},
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    # Get guest player ID from the round
    round_data = client.get(f"/api/v1/rounds/{round_id}", headers={"X-User-Id": "u1"}).json()
    guest_external_id = [pid for pid in round_data["player_ids"] if pid.startswith("guest:")][0]

    # Submit scores for all 18 holes for both players
    for hn in range(1, 19):
        # Real player
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 4},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

        # Guest player
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 5, "player_id": guest_external_id},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    # Verify round is completed
    g = client.get(f"/api/v1/rounds/{round_id}", headers={"X-User-Id": "u1"})
    assert g.status_code == 200
    assert g.json()["completed_at"] is not None

    # Check that only real player has PB events, not guest
    db = next(app.dependency_overrides[get_db]())
    try:
        events = db.execute(
            select(ActivityEvent).where(ActivityEvent.round_id == round_id)
        ).scalars().all()

        # Should have pb_overall and pb_course events
        pb_overall_events = [e for e in events if e.kind == "pb_overall"]
        pb_course_events = [e for e in events if e.kind == "pb_course"]

        # Both should exist only for real player
        assert len(pb_overall_events) == 1
        assert len(pb_course_events) == 1
    finally:
        db.close()


def test_player_stats_endpoint(client):
    """Test that /api/v1/players/{external_id}/stats returns rounds_count and avg_strokes."""
    # Create a course
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 19)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create and complete a round with score 4 on each hole (score_to_par = 0)
    r = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    for hn in range(1, 19):
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 4},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    # Get the player's external_id
    player_data = client.get("/api/v1/players/me", headers={"X-User-Id": "u1"}).json()
    external_id = player_data["external_id"]

    # Query the stats endpoint
    stats = client.get(
        f"/api/v1/players/{external_id}/stats", headers={"X-User-Id": "u1"}
    ).json()

    assert stats["rounds_count"] == 1
    assert stats["avg_strokes"] == 72.0


def test_player_stats_multiple_rounds(client):
    """Test avg strokes calculation with multiple completed rounds."""
    # Create a course
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 19)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create and complete first round with score 4 on each hole (score_to_par = 0)
    r1 = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    ).json()

    for hn in range(1, 19):
        client.post(
            f"/api/v1/rounds/{r1['id']}/scores",
            json={"hole_number": hn, "strokes": 4},
            headers={"X-User-Id": "u1"},
        )

    # Create and complete second round with score 5 on each hole (score_to_par = 18)
    r2 = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    ).json()

    for hn in range(1, 19):
        client.post(
            f"/api/v1/rounds/{r2['id']}/scores",
            json={"hole_number": hn, "strokes": 5},
            headers={"X-User-Id": "u1"},
        )

    # Get the player's external_id
    player_data = client.get("/api/v1/players/me", headers={"X-User-Id": "u1"}).json()
    external_id = player_data["external_id"]

    # Query the stats endpoint
    stats = client.get(
        f"/api/v1/players/{external_id}/stats", headers={"X-User-Id": "u1"}
    ).json()

    assert stats["rounds_count"] == 2
    # Average of [72, 90] = 81.0
    assert stats["avg_strokes"] == 81.0


def test_players_me_includes_stats(client):
    """Test that /api/v1/players/me includes rounds_count and avg_strokes."""
    # Create a course
    course_payload = {
        "name": "Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 19)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create and complete a round
    r = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    for hn in range(1, 19):
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 3},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    # Query /players/me
    me = client.get("/api/v1/players/me", headers={"X-User-Id": "u1"}).json()

    # Should include stats fields
    assert "rounds_count" in me
    assert "avg_strokes" in me
    assert me["rounds_count"] == 1
    # 3 on each hole for 18 holes = 54 strokes
    assert me["avg_strokes"] == 54.0


def test_nine_hole_course_stats_normalization(client):
    """Test that avg_strokes for 9-hole courses is normalized to 18-hole equivalent (doubled)."""
    # Create a 9-hole course with par 4
    course_payload = {
        "name": "Nine Hole Test Course",
        "holes": [{"number": i, "par": 4} for i in range(1, 10)],
    }
    c = client.post(
        "/api/v1/courses", json=course_payload, headers={"X-User-Id": "u1"}
    ).json()
    course_id = c["id"]

    # Create and complete a round with 5 strokes per hole (total_strokes=45)
    r = client.post(
        "/api/v1/rounds", json={"course_id": course_id}, headers={"X-User-Id": "u1"}
    )
    assert r.status_code == 201
    round_id = r.json()["id"]

    for hn in range(1, 10):
        resp = client.post(
            f"/api/v1/rounds/{round_id}/scores",
            json={"hole_number": hn, "strokes": 5},
            headers={"X-User-Id": "u1"},
        )
        assert resp.status_code == 200

    # Get player data from /players/me
    me = client.get("/api/v1/players/me", headers={"X-User-Id": "u1"}).json()
    external_id = me["external_id"]
    assert me["rounds_count"] == 1
    # 9 holes * 5 strokes = 45, normalized to 18-hole = 45 * 2 = 90.0
    assert me["avg_strokes"] == 90.0

    # Verify via /players/{external_id}/stats endpoint
    stats = client.get(
        f"/api/v1/players/{external_id}/stats", headers={"X-User-Id": "u1"}
    ).json()
    assert stats["rounds_count"] == 1
    assert stats["avg_strokes"] == 90.0
