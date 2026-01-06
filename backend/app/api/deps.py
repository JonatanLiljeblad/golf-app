from __future__ import annotations

from collections.abc import Generator
import json
import time
import urllib.request

from fastapi import Header, HTTPException
from jose import jwt
from jose.exceptions import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.settings import settings
from app.db.session import SessionLocal
from app.models.player import Player


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_player(db: Session, external_id: str) -> Player:
    external_id = (external_id or "").strip()
    player = db.execute(select(Player).where(Player.external_id == external_id)).scalars().one_or_none()
    if player:
        return player

    player = Player(external_id=external_id)
    db.add(player)
    db.flush()
    return player


_JWKS_CACHE: dict | None = None
_JWKS_CACHE_UNTIL: float = 0


def _get_jwks() -> dict:
    global _JWKS_CACHE, _JWKS_CACHE_UNTIL

    if _JWKS_CACHE and time.time() < _JWKS_CACHE_UNTIL:
        return _JWKS_CACHE

    if not settings.AUTH0_DOMAIN:
        raise RuntimeError("AUTH0_DOMAIN not configured")

    url = f"https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json"
    with urllib.request.urlopen(url, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    _JWKS_CACHE = data
    _JWKS_CACHE_UNTIL = time.time() + 3600
    return data


def get_current_user_id(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> str:
    # Dev fallback until Auth0 is configured.
    auth0_configured = bool(settings.AUTH0_DOMAIN and settings.AUTH0_AUDIENCE)
    if not auth0_configured:
        return x_user_id or "dev-user"

    # Auth0 is configured: require a real Bearer token.
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = parts[1]

    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        jwks = _get_jwks()
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(status_code=401, detail="Unable to find signing key")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.AUTH0_AUDIENCE,
            issuer=f"https://{settings.AUTH0_DOMAIN}/",
        )
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub")
    return str(sub)
