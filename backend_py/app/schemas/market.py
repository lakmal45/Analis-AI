from pydantic import BaseModel


class TickerData(BaseModel):
    symbol: str
    price: float
    change24h: float
    volume24h: float
    high24h: float
    low24h: float


class MarketOverviewResponse(BaseModel):
    success: bool = True
    data: list[TickerData]


class KlineRequest(BaseModel):
    symbol: str
    interval: str = "1h"
    limit: int = 100
