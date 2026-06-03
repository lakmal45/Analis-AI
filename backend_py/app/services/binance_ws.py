from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import websockets

logger = logging.getLogger(__name__)

BINANCE_WS_URL = "wss://stream.binance.com:9443/ws"


class BinanceWSManager:
    def __init__(self) -> None:
        self.sio: Any = None
        self.active_symbols: dict[str, int] = {}
        self.ws: websockets.WebSocketClientProtocol | None = None
        self._listen_task: asyncio.Task | None = None
        self._running = False

    def setup(self, sio_instance: Any) -> None:
        self.sio = sio_instance

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._listen_task = asyncio.create_task(self._listen_loop())
        logger.info("Binance WS manager started")

    async def stop(self) -> None:
        self._running = False
        if self._listen_task:
            self._listen_task.cancel()
        if self.ws:
            await self.ws.close()
        logger.info("Binance WS manager stopped")

    async def _listen_loop(self) -> None:
        while self._running:
            try:
                # Use a generic connection, we will send subscription requests
                async with websockets.connect(BINANCE_WS_URL) as ws:
                    self.ws = ws
                    logger.info("Connected to Binance WebSocket")
                    
                    # Resubscribe to existing symbols if reconnected
                    if self.active_symbols:
                        await self._send_subscribe_request(list(self.active_symbols.keys()))

                    while self._running:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        
                        # Handle ticker updates
                        if "e" in data and data["e"] == "24hrTicker":
                            symbol = data["s"].lower()
                            price = float(data["c"])
                            change_pct = float(data["P"])
                            volume_24h = float(data.get("q", 0))  # quote volume
                            high_24h = float(data.get("h", 0))
                            low_24h = float(data.get("l", 0))
                            
                            if self.sio:
                                room = f"ticker-{symbol}"
                                await self.sio.emit(
                                    "price-update",
                                    {
                                        "symbol": symbol.upper(),
                                        "price": price,
                                        "priceChangePercent": change_pct,
                                        "volume24h": volume_24h,
                                        "high24h": high_24h,
                                        "low24h": low_24h,
                                    },
                                    room=room
                                )
                                
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Binance WS connection error: {exc}")
                await asyncio.sleep(5)  # Retry delay

    async def _send_subscribe_request(self, symbols: list[str]) -> None:
        if not self.ws or not symbols:
            return
        streams = [f"{s.lower()}@ticker" for s in symbols]
        req = {
            "method": "SUBSCRIBE",
            "params": streams,
            "id": 1
        }
        await self.ws.send(json.dumps(req))
        logger.info(f"Subscribed to Binance WS streams: {streams}")

    async def _send_unsubscribe_request(self, symbols: list[str]) -> None:
        if not self.ws or not symbols:
            return
        streams = [f"{s.lower()}@ticker" for s in symbols]
        req = {
            "method": "UNSUBSCRIBE",
            "params": streams,
            "id": 2
        }
        await self.ws.send(json.dumps(req))
        logger.info(f"Unsubscribed from Binance WS streams: {streams}")

    async def subscribe(self, symbol: str) -> None:
        symbol = symbol.lower()
        if symbol not in self.active_symbols:
            self.active_symbols[symbol] = 1
            if not self._running:
                await self.start()
            elif self.ws:
                await self._send_subscribe_request([symbol])
        else:
            self.active_symbols[symbol] += 1

    async def unsubscribe(self, symbol: str) -> None:
        symbol = symbol.lower()
        if symbol in self.active_symbols:
            self.active_symbols[symbol] -= 1
            if self.active_symbols[symbol] <= 0:
                del self.active_symbols[symbol]
                await self._send_unsubscribe_request([symbol])


# Global instance
binance_ws = BinanceWSManager()
