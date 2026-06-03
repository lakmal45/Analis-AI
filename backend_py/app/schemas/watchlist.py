from datetime import datetime

from pydantic import BaseModel


class WatchlistAssetBase(BaseModel):
    symbol: str


class WatchlistAssetCreate(WatchlistAssetBase):
    pass


class WatchlistAssetResponse(WatchlistAssetBase):
    id: int
    watchlist_id: int
    added_at: datetime

    class Config:
        from_attributes = True


class WatchlistResponse(BaseModel):
    id: int
    user_id: int
    assets: list[WatchlistAssetResponse]
    created_at: datetime

    class Config:
        from_attributes = True
