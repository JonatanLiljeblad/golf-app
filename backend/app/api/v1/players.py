from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import ensure_player, get_current_user_id, get_db

router = APIRouter()


class PlayerMeOut(BaseModel):
    id: int
    external_id: str

    class Config:
        from_attributes = True


@router.get("/players/me", response_model=PlayerMeOut)
def upsert_me(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    player = ensure_player(db, user_id)
    db.commit()
    db.refresh(player)
    return player
