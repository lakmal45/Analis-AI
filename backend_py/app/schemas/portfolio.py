from datetime import datetime

from pydantic import BaseModel


class HoldingBase(BaseModel):
    symbol: str
    quantity: float
    buy_price: float
    notes: str | None = None
    buy_date: datetime | None = None


class HoldingCreate(HoldingBase):
    pass


class HoldingResponse(HoldingBase):
    id: int
    portfolio_id: int
    buy_date: datetime

    class Config:
        from_attributes = True


class PortfolioResponse(BaseModel):
    id: int
    user_id: int
    holdings: list[HoldingResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
