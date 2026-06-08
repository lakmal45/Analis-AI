from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

from app.services.market_service import get_klines
from app.services.signal_service import _resolve_validation_mode, generate_signal_from_klines

logger = logging.getLogger(__name__)

SUPPORTED_TIMEFRAMES = {"1m", "5m", "15m", "1h", "4h", "1d"}
SUPPORTED_INTRABAR_POLICIES = {"conservative", "optimistic"}
DEFAULT_TRADE_AMOUNT_USD = 10.0
DEFAULT_FUTURES_LEVERAGE = 10


def to_bounded_int(value: Any, fallback: int, min_val: int, max_val: int) -> int:
    try:
        parsed = int(value)
        return max(min_val, min(parsed, max_val))
    except (ValueError, TypeError):
        return fallback


def to_bounded_float(value: Any, fallback: float, min_val: float, max_val: float) -> float:
    try:
        parsed = float(value)
        if not math.isfinite(parsed):
            return fallback
        return max(min_val, min(parsed, max_val))
    except (ValueError, TypeError):
        return fallback


def to_fixed_number(value: float, decimals: int = 4) -> float | None:
    if not math.isfinite(value):
        return None
    return round(value, decimals)


def get_actual_direction(entry_price: float, resolution_price: float) -> str:
    if resolution_price > entry_price:
        return "UP"
    if resolution_price < entry_price:
        return "DOWN"
    return "NEUTRAL"


def get_directional_outcome(expected: str, actual: str) -> str:
    if expected == "NEUTRAL" or actual == "NEUTRAL":
        return "NEUTRAL"
    return "WIN" if expected == actual else "LOSS"


def get_exit_reason_outcome(exit_reason: str, expected: str, actual: str) -> str:
    if exit_reason.startswith("take_profit") or exit_reason == "signal_target_hit":
        return "WIN"
    if exit_reason.startswith("stop_loss") or exit_reason == "signal_stop_loss_hit":
        return "LOSS"
    return get_directional_outcome(expected, actual)


def calculate_futures_performance(signal_type: str, entry_price: float, exit_price: float, leverage: int) -> dict[str, float]:
    price_change = exit_price - entry_price
    market_price_change_pct = (price_change / entry_price) * 100 if entry_price > 0 else 0
    
    directional_return_pct = market_price_change_pct
    if signal_type == "SELL":
        directional_return_pct = -market_price_change_pct
        
    leveraged_return_pct = max(directional_return_pct * leverage, -100.0)
    return {
        "priceChange": price_change,
        "marketPriceChangePct": market_price_change_pct,
        "directionalReturnPct": directional_return_pct,
        "leveragedReturnPct": leveraged_return_pct,
    }


def resolve_gap_exit(signal_type: str, candle: dict[str, Any], target_price: float | None, stop_loss_price: float | None) -> dict[str, Any] | None:
    open_price = float(candle.get("open", 0))
    if not math.isfinite(open_price):
        return None

    if signal_type == "BUY":
        if stop_loss_price is not None and open_price <= stop_loss_price:
            return {"exitReason": "stop_loss_gap", "resolutionPrice": open_price, "resolutionMode": "gap_open"}
        if target_price is not None and open_price >= target_price:
            return {"exitReason": "take_profit_gap", "resolutionPrice": open_price, "resolutionMode": "gap_open"}
    elif signal_type == "SELL":
        if stop_loss_price is not None and open_price >= stop_loss_price:
            return {"exitReason": "stop_loss_gap", "resolutionPrice": open_price, "resolutionMode": "gap_open"}
        if target_price is not None and open_price <= target_price:
            return {"exitReason": "take_profit_gap", "resolutionPrice": open_price, "resolutionMode": "gap_open"}

    return None


def resolve_intrabar_exit(signal_type: str, candle: dict[str, Any], target_price: float | None, stop_loss_price: float | None, intrabar_policy: str) -> dict[str, Any] | None:
    high = float(candle.get("high", 0))
    low = float(candle.get("low", 0))
    if not math.isfinite(high) or not math.isfinite(low):
        return None

    target_hit = False
    stop_hit = False

    if signal_type == "BUY":
        target_hit = target_price is not None and high >= target_price
        stop_hit = stop_loss_price is not None and low <= stop_loss_price
    elif signal_type == "SELL":
        target_hit = target_price is not None and low <= target_price
        stop_hit = stop_loss_price is not None and high >= stop_loss_price

    if not target_hit and not stop_hit:
        return None

    if target_hit and stop_hit:
        take_profit_first = intrabar_policy == "optimistic"
        return {
            "exitReason": "take_profit_intrabar" if take_profit_first else "stop_loss_intrabar",
            "resolutionPrice": target_price if take_profit_first else stop_loss_price,
            "resolutionMode": "intrabar_dual_hit",
            "targetHit": True,
            "stopHit": True,
        }

    if target_hit:
        return {
            "exitReason": "take_profit_intrabar",
            "resolutionPrice": target_price,
            "resolutionMode": "intrabar",
            "targetHit": True,
            "stopHit": False,
        }

    return {
        "exitReason": "stop_loss_intrabar",
        "resolutionPrice": stop_loss_price,
        "resolutionMode": "intrabar",
        "targetHit": False,
        "stopHit": True,
    }


def simulate_trade_resolution(signal: dict[str, Any], future_candles: list[dict[str, Any]], resolution_candles: int, intrabar_policy: str) -> dict[str, Any] | None:
    price_info = signal.get("price", {})
    target_price = price_info.get("target")
    stop_loss_price = price_info.get("stopLoss")
    
    # Cast safely
    target_price = float(target_price) if target_price is not None else None
    stop_loss_price = float(stop_loss_price) if stop_loss_price is not None else None

    for offset in range(min(len(future_candles), resolution_candles)):
        candle = future_candles[offset]
        
        gap_res = resolve_gap_exit(signal["type"], candle, target_price, stop_loss_price)
        if gap_res:
            dt_iso = datetime.fromtimestamp(candle["openTime"] / 1000, tz=timezone.utc).isoformat()
            gap_res.update({"resolvedAt": dt_iso, "resolvedCandle": candle, "holdingCandles": offset + 1})
            return gap_res
            
        intra_res = resolve_intrabar_exit(signal["type"], candle, target_price, stop_loss_price, intrabar_policy)
        if intra_res:
            dt_iso = datetime.fromtimestamp(candle["closeTime"] / 1000, tz=timezone.utc).isoformat()
            intra_res.update({"resolvedAt": dt_iso, "resolvedCandle": candle, "holdingCandles": offset + 1})
            return intra_res
            
    expiry_idx = min(resolution_candles, len(future_candles)) - 1
    if expiry_idx < 0:
        return None
        
    expiry_candle = future_candles[expiry_idx]
    dt_iso = datetime.fromtimestamp(expiry_candle["closeTime"] / 1000, tz=timezone.utc).isoformat()
    return {
        "exitReason": "time_expiry",
        "resolutionPrice": float(expiry_candle["close"]),
        "resolutionMode": "time_expiry",
        "resolvedAt": dt_iso,
        "resolvedCandle": expiry_candle,
        "holdingCandles": expiry_idx + 1,
        "targetHit": False,
        "stopHit": False,
    }


def build_trade_result(symbol: str, timeframe: str, signal: dict[str, Any], entry_candle: dict[str, Any], simulated_resolution: dict[str, Any], intrabar_policy: str, fees_per_trade_pct: float, trade_amount_usd: float, slippage_pct: float) -> dict[str, Any]:
    actual_direction = get_actual_direction(signal["price"]["entry"], simulated_resolution["resolutionPrice"])
    outcome = get_exit_reason_outcome(simulated_resolution["exitReason"], signal["expectedDirection"], actual_direction)
    leverage = signal.get("leverage", DEFAULT_FUTURES_LEVERAGE)
    
    perf = calculate_futures_performance(signal["type"], signal["price"]["entry"], simulated_resolution["resolutionPrice"], leverage)
    
    fee_impact_pct = fees_per_trade_pct * leverage
    slippage_impact_pct = slippage_pct * leverage
    net_return_pct = to_fixed_number(max(perf["leveragedReturnPct"] - fee_impact_pct - slippage_impact_pct, -100), 4)
    
    safe_trade_amount = to_fixed_number(to_bounded_float(trade_amount_usd, DEFAULT_TRADE_AMOUNT_USD, 1, 1000000), 2)
    pos_notional = to_fixed_number(safe_trade_amount * leverage, 2)
    pnl_usd = to_fixed_number(safe_trade_amount * (net_return_pct / 100), 2)
    
    dt_iso = datetime.fromtimestamp(entry_candle["closeTime"] / 1000, tz=timezone.utc).isoformat()
    
    return {
        "symbol": symbol,
        "marketType": "FUTURES",
        "leverage": leverage,
        "timeframe": timeframe,
        "type": signal["type"],
        "confidence": signal["confidence"],
        "expectedDirection": signal["expectedDirection"],
        "actualDirection": actual_direction,
        "outcome": outcome,
        "reasoning": signal["reasoning"],
        "createdAt": dt_iso,
        "resolvedAt": simulated_resolution["resolvedAt"],
        "price": {
            "entry": signal["price"]["entry"],
            "resolution": simulated_resolution["resolutionPrice"],
            "target": signal["price"].get("target"),
            "stopLoss": signal["price"].get("stopLoss"),
        },
        "performance": {
            "priceChange": to_fixed_number(perf["priceChange"], 8),
            "priceChangePct": to_fixed_number(perf["directionalReturnPct"], 4),
            "marketPriceChangePct": to_fixed_number(perf["marketPriceChangePct"], 4),
            "leveragedReturnPct": to_fixed_number(perf["leveragedReturnPct"], 4),
            "feeImpactPct": to_fixed_number(fee_impact_pct, 4),
            "slippageImpactPct": to_fixed_number(slippage_impact_pct, 4),
            "netLeveragedReturnPct": net_return_pct,
        },
        "position": {
            "tradeAmountUsd": safe_trade_amount,
            "positionNotionalUsd": pos_notional,
            "pnlUsd": pnl_usd,
        },
        "indicators": signal.get("indicators", {}),
        "scoring": signal.get("scoring"),
        "features": signal.get("features", {}),
        "simulation": {
            "exitReason": simulated_resolution["exitReason"],
            "resolutionMode": simulated_resolution["resolutionMode"],
            "intrabarPolicy": intrabar_policy,
            "holdingCandles": simulated_resolution["holdingCandles"],
            "targetHit": simulated_resolution.get("targetHit", False),
            "stopLossHit": simulated_resolution.get("stopHit", False),
            "resolvedCandleTime": datetime.fromtimestamp(simulated_resolution["resolvedCandle"]["closeTime"] / 1000, tz=timezone.utc).isoformat() if "resolvedCandle" in simulated_resolution else simulated_resolution["resolvedAt"],
        }
    }


def build_equity_metrics(trades: list[dict[str, Any]]) -> dict[str, Any]:
    if not trades:
        return {
            "totalReturnPct": 0, "maxDrawdownPct": 0, "profitFactor": 0,
            "sharpeRatio": None, "calmarRatio": None, "winLossRatio": None,
            "equityCurve": []
        }

    equity = 1.0
    peak = 1.0
    max_drawdown_pct = 0.0
    gross_wins = 0.0
    gross_losses = 0.0
    returns = []
    equity_curve = []

    for i, t in enumerate(trades):
        perf = t.get("performance", {})
        ret_pct = perf.get("netLeveragedReturnPct")
        if ret_pct is None:
            ret_pct = perf.get("leveragedReturnPct", 0.0)
            
        returns.append(ret_pct)
        equity = equity * (1 + ret_pct / 100.0)
        if equity > peak:
            peak = equity
            
        drawdown_pct = ((peak - equity) / peak * 100) if peak > 0 else 0
        if drawdown_pct > max_drawdown_pct:
            max_drawdown_pct = drawdown_pct
            
        if ret_pct > 0:
            gross_wins += ret_pct
        if ret_pct < 0:
            gross_losses += abs(ret_pct)
            
        equity_curve.append({
            "tradeIndex": i + 1,
            "cumulativeReturnPct": to_fixed_number((equity - 1) * 100, 4),
            "drawdownPct": to_fixed_number(drawdown_pct, 4)
        })

    total_return_pct = (equity - 1) * 100
    profit_factor = (gross_wins / gross_losses) if gross_losses > 0 else (float("inf") if gross_wins > 0 else 0)

    mean_return = sum(returns) / len(returns) if returns else 0
    variance = sum((r - mean_return) ** 2 for r in returns) / len(returns) if returns else 0
    std_dev = math.sqrt(variance)
    sharpe = to_fixed_number(mean_return / std_dev, 4) if std_dev > 0 else None
    calmar = to_fixed_number(total_return_pct / max_drawdown_pct, 4) if max_drawdown_pct > 0 else None

    win_rets = [r for r in returns if r > 0]
    loss_rets = [abs(r) for r in returns if r < 0]
    avg_win = sum(win_rets) / len(win_rets) if win_rets else 0
    avg_loss = sum(loss_rets) / len(loss_rets) if loss_rets else 0
    win_loss_ratio = to_fixed_number(avg_win / avg_loss, 4) if avg_loss > 0 else None

    return {
        "totalReturnPct": to_fixed_number(total_return_pct, 4),
        "maxDrawdownPct": to_fixed_number(max_drawdown_pct, 4),
        "profitFactor": to_fixed_number(profit_factor, 4) if math.isfinite(profit_factor) else None,
        "sharpeRatio": sharpe,
        "calmarRatio": calmar,
        "winLossRatio": win_loss_ratio,
        "avgWinPct": to_fixed_number(avg_win, 4),
        "avgLossPct": to_fixed_number(avg_loss, 4),
        "equityCurve": equity_curve,
    }


def build_aggregate_summary(trades: list[dict[str, Any]]) -> dict[str, Any]:
    total_signals = len(trades)
    wins = len([t for t in trades if t["outcome"] == "WIN"])
    losses = len([t for t in trades if t["outcome"] == "LOSS"])
    neutrals = len([t for t in trades if t["outcome"] == "NEUTRAL"])

    def avg(selector):
        if not trades: return 0.0
        return sum(selector(t) for t in trades) / len(trades)

    avg_ret = avg(lambda t: t.get("performance", {}).get("netLeveragedReturnPct", t.get("performance", {}).get("leveragedReturnPct", 0)))
    avg_move = avg(lambda t: t.get("performance", {}).get("marketPriceChangePct", 0))
    avg_lev = avg(lambda t: t.get("leverage", DEFAULT_FUTURES_LEVERAGE))
    avg_conf = avg(lambda t: t.get("confidence", 0))
    avg_hold = avg(lambda t: t.get("simulation", {}).get("holdingCandles", 0))
    
    total_pnl = sum(t.get("position", {}).get("pnlUsd", 0) for t in trades)
    avg_pnl = avg(lambda t: t.get("position", {}).get("pnlUsd", 0))
    best_pnl = max([t.get("position", {}).get("pnlUsd", 0) for t in trades], default=0)
    worst_pnl = min([t.get("position", {}).get("pnlUsd", 0) for t in trades], default=0)
    
    by_type_map = {}
    by_outcome_map = {}
    by_exit_map = {}
    for t in trades:
        by_type_map.setdefault(t["type"], []).append(t)
        by_outcome_map.setdefault(t["outcome"], []).append(t)
        exit_r = t.get("simulation", {}).get("exitReason", "unknown")
        by_exit_map.setdefault(exit_r, []).append(t)

    def to_rate(cnt):
        return round((cnt / total_signals) * 100, 2) if total_signals > 0 else 0

    by_type = []
    for k, v in by_type_map.items():
        by_type.append({
            "type": k,
            "total": len(v),
            "winRate": to_rate(len([x for x in v if x["outcome"] == "WIN"])),
            "avgReturnPct": round(sum(x.get("performance", {}).get("netLeveragedReturnPct", 0) for x in v) / len(v), 2)
        })

    by_outcome = [{"outcome": k, "total": len(v), "rate": to_rate(len(v))} for k, v in by_outcome_map.items()]
    by_exit = [{
        "exitReason": k, 
        "total": len(v), 
        "rate": to_rate(len(v)),
        "winRate": to_rate(len([x for x in v if x["outcome"] == "WIN"]))
    } for k, v in by_exit_map.items()]

    trade_amount = trades[0].get("position", {}).get("tradeAmountUsd", DEFAULT_TRADE_AMOUNT_USD) if trades else DEFAULT_TRADE_AMOUNT_USD
    
    summary = {
        "totalSignals": total_signals,
        "wins": wins, "losses": losses, "neutrals": neutrals,
        "winRate": to_rate(wins), "lossRate": to_rate(losses), "neutralRate": to_rate(neutrals),
        "avgReturnPct": round(avg_ret, 2), "avgUnderlyingMovePct": round(avg_move, 2),
        "avgLeverage": round(avg_lev, 2), "avgConfidence": round(avg_conf, 2), "avgHoldingCandles": round(avg_hold, 2),
        "tradeAmountUsd": to_fixed_number(trade_amount, 2),
        "totalPnlUsd": to_fixed_number(total_pnl, 2),
        "avgPnlUsd": to_fixed_number(avg_pnl, 2),
        "bestTradePnlUsd": to_fixed_number(best_pnl, 2),
        "worstTradePnlUsd": to_fixed_number(worst_pnl, 2),
        "byType": by_type,
        "byOutcome": by_outcome,
        "byExitReason": by_exit,
    }
    summary.update(build_equity_metrics(trades))
    return summary


async def run_backtest(request: dict[str, Any]) -> dict[str, Any]:
    """
    Executes a backtest on historical data by simulating trading logic over historical K-lines.
    Fully ported from Node.js backtestService.js.
    """
    symbol = request.get("symbol", "BTCUSDT").upper()
    timeframe = request.get("timeframe", "1h")
    limit = to_bounded_int(request.get("limit"), 300, 60, 1000)
    analysis_window = to_bounded_int(request.get("analysisWindow"), 210, 26, 300)
    warmup_candles = max(to_bounded_int(request.get("warmupCandles"), analysis_window, 26, 400), 26)
    
    default_resolution_candles = {
        "1m": 10,
        "5m": 8,
        "15m": 6,
        "1h": 5,
        "4h": 3,
        "1d": 3,
    }
    resolution_candles = to_bounded_int(
        request.get("resolutionCandles"),
        default_resolution_candles.get(timeframe, 5),
        1,
        50
    )
    sample_size = to_bounded_int(request.get("sampleSize"), 20, 1, 100)
    leverage = to_bounded_int(request.get("leverage"), DEFAULT_FUTURES_LEVERAGE, 1, 125)
    trade_amount_usd = to_bounded_float(request.get("tradeAmountUsd"), DEFAULT_TRADE_AMOUNT_USD, 1, 1000000)
    cooldown_candles = to_bounded_int(request.get("cooldownCandles"), resolution_candles, 0, 100)
    intrabar_policy = request.get("intrabarPolicy", "conservative").lower()
    if intrabar_policy not in SUPPORTED_INTRABAR_POLICIES:
        intrabar_policy = "conservative"
        
    backtest_ml_model = request.get("backtestMlModel")
    if backtest_ml_model and backtest_ml_model.lower() == "off":
        backtest_ml_model = None
        
    apply_accuracy_guardrails = request.get("applyAccuracyGuardrails", False)
    preset = request.get("preset")
    validation_mode = request.get("validationMode")
    include_mtf_confirmation = bool(request.get("includeMtfConfirmation", False))
    include_order_flow_confirmation = bool(request.get("includeOrderFlowConfirmation", False))
    active_validation_mode = _resolve_validation_mode(
        validation_mode,
        "rules_plus_ml" if backtest_ml_model else "rules_only",
    )
    fees_per_trade_pct = to_bounded_float(request.get("feesPerTradePct"), 0.04, 0, 1)
    slippage_pct = to_bounded_float(request.get("slippagePct"), 0.05, 0, 1)
    
    start_date = request.get("startDate")
    end_date = request.get("endDate")
    
    kline_request_args = {}
    if start_date and end_date:
        # User defined range
        try:
            st_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if st_dt.tzinfo is None:
                st_dt = st_dt.replace(tzinfo=timezone.utc)
            st_ts = int(st_dt.timestamp() * 1000)
            
            en_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if en_dt.tzinfo is None:
                en_dt = en_dt.replace(tzinfo=timezone.utc)
            # if time is exactly midnight, push to end of day
            if en_dt.hour == 0 and en_dt.minute == 0:
                en_dt = en_dt.replace(hour=23, minute=59, second=59, microsecond=999000)
            en_ts = int(en_dt.timestamp() * 1000)
            
            kline_request_args = {"limit": 5000, "startTime": st_ts, "endTime": en_ts}
        except ValueError as e:
            raise ValueError(f"Invalid date format: {e}")
    else:
        kline_request_args = {"limit": limit}

    klines = await get_klines(symbol, timeframe, **kline_request_args)
    if not klines or len(klines) < (warmup_candles + resolution_candles + 1):
        raise ValueError(f"Insufficient historical data. Need at least {warmup_candles + resolution_candles + 1} candles.")

    trades = []
    skipped_hold_signals = 0
    cooldown_until_index = -1
    last_eligible_index = len(klines) - 1 - resolution_candles

    for current_index in range(warmup_candles - 1, last_eligible_index + 1):
        if current_index < cooldown_until_index:
            continue

        start_index = max(0, current_index + 1 - analysis_window)
        analysis_candles = klines[start_index : current_index + 1]

        signal = generate_signal_from_klines(
            symbol=symbol,
            timeframe=timeframe,
            klines=analysis_candles,
            leverage=leverage,
            ml_model=backtest_ml_model,
            apply_accuracy_guardrails=apply_accuracy_guardrails,
            preset=preset,
            validation_mode=active_validation_mode,
            include_mtf_confirmation=include_mtf_confirmation,
            include_order_flow_confirmation=include_order_flow_confirmation,
        )

        if not signal:
            continue
        if signal["type"] == "HOLD":
            skipped_hold_signals += 1
            continue

        entry_candle = klines[current_index]
        future_candles = klines[current_index + 1 : current_index + 1 + resolution_candles]
        
        simulated_res = simulate_trade_resolution(
            signal, future_candles, resolution_candles, intrabar_policy
        )

        if not simulated_res:
            continue

        trades.append(build_trade_result(
            symbol, timeframe, signal, entry_candle, simulated_res,
            intrabar_policy, fees_per_trade_pct, trade_amount_usd, slippage_pct
        ))

        cooldown_until_index = current_index + 1 + cooldown_candles

    summary = build_aggregate_summary(trades)
    recent_trades = list(reversed(trades[-sample_size:]))

    # Format dates for response config/dataset if they exist
    dataset_start = datetime.fromtimestamp(klines[0]["openTime"] / 1000, tz=timezone.utc).isoformat()
    dataset_end = datetime.fromtimestamp(klines[-1]["closeTime"] / 1000, tz=timezone.utc).isoformat()

    return {
        "symbol": symbol,
        "market_type": "FUTURES",
        "config": {
            "symbol": symbol,
            "timeframe": timeframe,
            "limit": limit,
            "analysisWindow": analysis_window,
            "warmupCandles": warmup_candles,
            "resolutionCandles": resolution_candles,
            "sampleSize": sample_size,
            "leverage": leverage,
            "tradeAmountUsd": to_fixed_number(trade_amount_usd, 2),
            "startDate": start_date,
            "endDate": end_date,
            "cooldownCandles": cooldown_candles,
            "intrabarPolicy": intrabar_policy,
            "feesPerTradePct": fees_per_trade_pct,
            "slippagePct": slippage_pct,
            "mlModel": backtest_ml_model or "off",
            "mlEnabled": bool(backtest_ml_model),
            "preset": preset or "balanced",
            "validationMode": active_validation_mode,
            "includeMtfConfirmation": include_mtf_confirmation,
            "includeOrderFlowConfirmation": include_order_flow_confirmation,
            "simulationModel": "tp_sl_intrabar_v2",
        },
        "dataset": {
            "totalCandles": len(klines),
            "evaluatedSetups": max(0, last_eligible_index - (warmup_candles - 1) + 1),
            "skippedHoldSignals": skipped_hold_signals,
            "firstCandleAt": dataset_start,
            "lastCandleAt": dataset_end,
        },
        "summary": summary,
        "trades": trades,
        "recent_trades": recent_trades,
    }
