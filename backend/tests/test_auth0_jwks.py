import time

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from jose.utils import base64url_encode
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import deps
from app.api.deps import get_db
from app.core.settings import settings
from app.db.base import Base
import app.models.player  # noqa: F401
from app.main import app


def _make_rsa_keypair_jwk(*, kid: str):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    pub = private_key.public_key().public_numbers()
    n = base64url_encode(pub.n.to_bytes((pub.n.bit_length() + 7) // 8, "big")).decode("utf-8")
    e = base64url_encode(pub.e.to_bytes((pub.e.bit_length() + 7) // 8, "big")).decode("utf-8")

    jwk = {"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256", "n": n, "e": e}
    return private_pem, jwk


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


def test_players_me_with_mocked_jwks(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH0_DOMAIN", "example.test")
    monkeypatch.setattr(settings, "AUTH0_AUDIENCE", "https://golf-api")

    private_pem, jwk = _make_rsa_keypair_jwk(kid="test-kid")
    monkeypatch.setattr(deps, "_JWKS_CACHE", None)
    monkeypatch.setattr(deps, "_JWKS_CACHE_UNTIL", 0)
    monkeypatch.setattr(deps, "_get_jwks", lambda: {"keys": [jwk]})

    claims = {
        "sub": "auth0|user123",
        "aud": settings.AUTH0_AUDIENCE,
        "iss": f"https://{settings.AUTH0_DOMAIN}/",
        "exp": int(time.time()) + 60,
    }
    token = jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": "test-kid"})

    missing = client.get("/api/v1/players/me")
    assert missing.status_code == 401

    resp = client.get("/api/v1/players/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["external_id"] == "auth0|user123"
