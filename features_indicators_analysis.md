# Backend_py Features, Indicators & Rule Engine Analysis

> [!NOTE]
> This document catalogs **every feature and indicator** produced by the backend, classifies each by its computation source, and categorizes its usage relative to the rule engine.

---

## 1. Source Classification

All indicators originate from [feature_builder.py](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py). They fall into **four source types**:

| Source | Meaning |
|---|---|
| **pandas-ta** | Computed via `pandas_ta` library calls (e.g. `ta.rsi(...)`) |
| **Derived** | Hardcoded Python math on top of pandas-ta outputs or raw OHLCV (e.g. `priceVsEmaPct`, `relativeVolume`) |
| **Custom** | Fully hardcoded algorithms — WaveTrend oscillator, Kernel Regression, Supply/Demand zones, FVGs, Lorentzian KNN |
| **Raw** | Direct OHLCV values passed through unchanged |

---

## 2. Rule Engine Usage Classification

Features have three usage categories relative to the signal rule engine in [signal_service.py](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py):

| Category | Meaning |
|---|---|
| **Directly Used** | Read inside `evaluate_signal_rules()` to produce buy/sell scores |
| **Indirectly Used** | Not read by the rule engine itself, but used to **compute** another feature that IS directly used (e.g. `sma20` → `trendDirection` → `marketRegime` → regime weighting) |
| **Not Used** | Never participates in rule generation — only consumed by the ML model |

---

## 3. Pandas-TA Indicators (33 features)

These are computed via `pandas_ta` library calls in [feature_builder.py](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L566-L611).

### 3.1 Directly Used in Rule Engine (20 features)

| # | Feature Path | Rule # | Rule Name | Group | How Used |
|---|---|---|---|---|---|
| 1 | `momentum.rsi14` | R1 | RSI | mean_reversion | Compared against `rsiOversold` / `rsiOverbought` thresholds (weight: 2) |
| 2 | `momentum.stochasticK` | R2 | Stochastic %K | mean_reversion | Compared against `stochLow` / `stochHigh` thresholds (weight: 1) |
| 3 | `momentum.cci20` | R3 | CCI | mean_reversion | Compared against ±`cciExtreme` thresholds (weight: 1) |
| 4 | `momentum.williamsR14` | R5 | Williams %R | mean_reversion | Compared against -80 / -20 thresholds (weight: 1) |
| 5 | `momentum.ultimateOscillator` | R6 | Ultimate Oscillator | mean_reversion | Compared against 30 / 70 thresholds (weight: 1) |
| 6 | `momentum.macdLine` | R9 | MACD Crossover | trend | Used with `macdSignal` to check availability; actual direction from derived `macdCrossoverDirection` |
| 7 | `momentum.macdSignal` | R9 | MACD Crossover | trend | Used with `macdLine` to check availability |
| 8 | `momentum.macdHistogram` | R10 | MACD Histogram | trend | Checked > 0 (bullish) or < 0 (bearish) (weight: 1) |
| 9 | `momentum.roc10` | R12 | ROC | mean_reversion | Compared against ±`rocExtreme` thresholds (weight: 1) |
| 10 | `momentum.awesomeOscillator` | R14 | Awesome Oscillator | trend | Checked > 0 (bullish) or < 0 (bearish) (weight: 0.5) |
| 11 | `trend.ema20` | R8 | Price vs EMA20 | trend | `closePrice > ema20` = bullish (weight: 0.5) |
| 12 | `trend.adx14` | R11 | ADX + DMI | trend | ADX > 25 doubles the DMI rule weight from 1→2 |
| 13 | `trend.dmiPlus14` | R11 | ADX + DMI | trend | DI+ vs DI- comparison for trend direction |
| 14 | `trend.dmiMinus14` | R11 | ADX + DMI | trend | DI+ vs DI- comparison for trend direction |
| 15 | `volatility.bollingerPercentB` | R4 | Bollinger %B | mean_reversion | < 0.2 = buy, > 0.8 = sell (weight: 1) |
| 16 | `volatility.zscore20` | R7 | Z-score | mean_reversion | < -2 = buy, > 2 = sell (weight: 0.5) |
| 17 | `momentum.ppoLine` | R28 | PPO | mean_reversion | Compared against bearish line < -1 / bullish line > 1 thresholds (weight: 1.0) |
| 18 | `momentum.ppoHistogram` | R28 | PPO | mean_reversion | Confirms momentum trend direction |
| 19 | `momentum.trix15` | R29 | TRIX | trend | Checked > 0 (bullish) or < 0 (bearish) (weight: 0.5) |
| 20 | `volume.efi13` | R31 | Elder Force Index | volume_structure | Checked > 0 (bullish) or < 0 (bearish) (weight: 0.5) |

### 3.2 Indirectly Used in Rule Engine (10 features)

These pandas-ta outputs are **not read by any rule**, but are used to **compute derived features** that ARE used by rules.

| # | Feature Path | What It Feeds Into | Ultimately Used By |
|---|---|---|---|
| 1 | `trend.sma20` | `trendDirection` → `marketRegime` | `context.marketRegime` → regime weighting (`mr_w`, `tf_w`) across **all rules**, TP/SL multipliers |
| 2 | `trend.sma200` | `trendDirection` → `marketRegime` | Same as above |
| 3 | `volatility.atr14` | `atrPct` → `marketRegime`; also used directly for TP/SL price targets | `context.marketRegime` + price target calculation |
| 4 | `volume.obv` | `obvSlope5` (derived slope over 5 bars) | Rule R16: OBV Slope |
| 5 | `volume.mfi14` | Directly used — listed above | *(also directly used)* |
| 6 | `volume.cmf20` | Directly used — listed above | *(also directly used)* |
| 7 | `volume.adLine` | `adSlope5` (derived slope over 5 bars) | Not used in rules — ML only |
| 8 | `momentum.stochasticD` | Not directly used, but `stochasticK` (its pair) is used | Supporting context only |
| 9 | `trend.ema50` | Part of trend alignment checks in `_resolve_trend_direction` | Feeds `trendDirection` → `marketRegime` |
| 10 | `trend.sma50` | Part of trend alignment checks | Feeds `trendDirection` → `marketRegime` |

> [!IMPORTANT]
> `sma20`, `sma200`, `ema50`, `sma50`, and `atr14` are critical indirect dependencies. They determine `marketRegime`, which controls the **regime weighting multipliers** (`mr_w`, `tf_w`) that scale every single rule's buy/sell contributions.

### 3.3 Never Used in Rule Engine — ML Only (3 features)

| # | Feature Path | Description |
|---|---|---|
| 1 | `trend.hma20` | Hull Moving Average (20-period) |
| 2 | `trend.dema20` | Double Exponential Moving Average (20-period) |
| 3 | `trend.linregValue` | Linear Regression value (20-period) |

---

## 4. Derived / Hardcoded Indicators (computed from pandas-ta + OHLCV)

These are Python-calculated features using math operations on pandas-ta outputs or raw price data.

### 4.1 Directly Used in Rule Engine (10 features)

| # | Feature Path | Source Computation | Rule # | How Used |
|---|---|---|---|---|
| 1 | `momentum.macdCrossoverDirection` | Derived from `macdLine` vs `macdSignal` (current vs previous bar) | R9 | `"BULLISH"` or `"BEARISH"` crossover direction (weight: 2) |
| 2 | `volume.obvSlope5` | `obv[-1] - obv[-6]` (5-bar OBV delta) | R16 | > 0 = buying pressure, < 0 = selling pressure (weight: 0.5) |
| 3 | `volume.relativeVolume` | `latestVolume / volumeSma20` | R17 | > 1.5 = high volume confirms dominant bias (weight: 0.5) |
| 4 | `volatility.squeezeOn` | `BB_lower > KC_lower AND BB_upper < KC_upper` | R19 | If squeeze active, adds 0.5 to dominant side |
| 5 | `context.marketRegime` | Derived from `trendDirection` + `atrPct` + `bollingerBandWidthPct` | All Rules | Drives regime weighting (`mr_w`, `tf_w`) + TP/SL multipliers |
| 6 | `context.closePrice` | Raw `close[-1]` | R8, R20 | Price vs EMA20; distance to S/D zones |
| 7 | `trend.psarDirection` | Derived from PSAR long/short presence | R13 | `"BULLISH"` or `"BEARISH"` (weight: 1) |
| 8 | `momentum.macdCrossoverStrength` | `abs(macdLine - macdSignal)` | — | Available in rule data but not directly scored |
| 9 | `volatility.donchianPositionPct` | Position within Donchian channel | R26 | < 10 = buy, > 90 = sell (weight: 1.0) |
| 10 | `volatility.keltnerPositionPct` | Position within Keltner channel | R27 | < 10 = buy, > 90 = sell (weight: 0.5) |

### 4.2 Indirectly Used in Rule Engine (7 features)

| # | Feature Path | What It Feeds |
|---|---|---|
| 1 | `trend.trendDirection` | Feeds `marketRegime` → regime weighting for all rules |
| 2 | `trend.trendStrength` | Feeds `marketRegime` computation (price deviation scale) |
| 3 | `trend.emaSmaSpreadPct` | Part of `trendStrength` calculation |
| 4 | `trend.priceVsEmaPct` | Part of `trendStrength` calculation |
| 5 | `trend.priceVsSmaPct` | Part of `trendStrength` calculation |
| 6 | `volatility.atrPct` | Feeds `marketRegime` (volatility threshold ≥ 3%) |
| 7 | `volatility.bollingerBandWidthPct` | Feeds `marketRegime` (volatility threshold ≥ 3%) |

### 4.3 Never Used in Rule Engine — ML Only (11 features)

| # | Feature Path | Description |
|---|---|---|
| 1 | `trend.priceVsSma200Pct` | Price distance from SMA200 as percentage |
| 2 | `trend.priceVsHmaPct` | Price distance from HMA20 as percentage |
| 3 | `trend.priceVsDemaPct` | Price distance from DEMA20 as percentage |
| 4 | `trend.psarDistancePct` | Distance from PSAR value as percentage |
| 5 | `volatility.natr14` | Normalized ATR (ATR / close × 100) |
| 6 | `volatility.volatilityPct` | Max of (atrPct, candleRangePct, bollingerBandWidthPct) |
| 7 | `volatility.candleRangePct` | `(high - low) / close × 100` |
| 8 | `volatility.donchianWidthPct` | Donchian channel width as % of price |
| 9 | `volume.volumeSma20` | 20-bar SMA of volume |
| 10 | `volume.adSlope5` | A/D line 5-bar slope |
| 11 | `momentum.macdCrossoverStrength` | Absolute MACD-signal gap (magnitude) |

---

## 5. Custom / Fully Hardcoded Algorithms (28 features)

These are entirely custom implementations — no pandas-ta involvement.

### 5.1 WaveTrend Oscillator (3 features)
Computed in [_wave_trend()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L419-L428) — ported from LazyBear's PineScript.

| # | Feature Path | Rule Engine Usage | Details |
|---|---|---|---|
| 1 | `momentum.waveTrend1` | **Directly** — R22 | WT1 < -60 + bullish cross = buy; WT1 > 60 + bearish cross = sell (weight: 1.5) |
| 2 | `momentum.waveTrend2` | **Directly** — R22 | Cross reference line for WT1 |
| 3 | `momentum.waveTrendCross` | **Not used** — ML only | Pre-computed cross signal (+1/-1/0) |

### 5.2 Kernel Regression — Nadaraya-Watson (5 features)
Computed in [_rational_quadratic_kernel()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L361-L388) and [_gaussian_kernel()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L391-L410).

| # | Feature Path | Rule Engine Usage | Details |
|---|---|---|---|
| 1 | `trend.kernelRqEstimate` | **Not used** — ML only | Kernel rational quadratic estimate value |
| 2 | `trend.kernelGaussianEstimate` | **Not used** — ML only | Kernel Gaussian estimate value |
| 3 | `trend.kernelRateOfChange` | **Not used** — ML only | Rate of change of the kernel estimate |
| 4 | `trend.kernelCrossoverSignal` | **Directly** — R24 | `1` = buy crossover, `-1` = sell crossover (weight: 1.5) |
| 5 | `trend.priceVsKernelPct` | **Directly** — R24 | If > 2% adds 0.5 to sell, < -2% adds 0.5 to buy |

### 5.3 Supply/Demand Zones (8 features)
Computed in [_calculate_supply_demand()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L173-L218) using swing pivot detection.

| # | Feature Path | Rule Engine Usage | Details |
|---|---|---|---|
| 1 | `structure.activeZoneBias` | **Directly** — R20 | `"DEMAND"` = buy, `"SUPPLY"` = sell |
| 2 | `structure.nearestDemandDistancePct` | **Directly** — R20 | < 2.5% = near zone (full weight: 2.0) |
| 3 | `structure.nearestSupplyDistancePct` | **Directly** — R20 | < 2.5% = near zone (full weight: 2.0) |
| 4 | `structure.nearestSupplyTop` | **Not used** — ML only | Zone boundary |
| 5 | `structure.nearestSupplyBottom` | **Not used** — ML only | Zone boundary |
| 6 | `structure.nearestSupplyPoi` | **Not used** — ML only | Point of interest |
| 7 | `structure.nearestDemandTop` | **Not used** — ML only | Zone boundary |
| 8 | `structure.nearestDemandBottom` | **Not used** — ML only | Zone boundary |
|   | `structure.nearestDemandPoi` | **Not used** — ML only | Point of interest |

### 5.4 Fair Value Gap (FVG) Structure (8 features)
Computed in [_calculate_fvg_structure()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L320-L352) with 3-candle gap detection.

| # | Feature Path | Rule Engine Usage | Details |
|---|---|---|---|
| 1 | `structure.nearestFvgBias` | **Directly** — R21 | `"BULLISH"` or `"BEARISH"` |
| 2 | `structure.bullishFvgDistancePct` | **Directly** — R21 | < 2.5% = near gap (full weight: 1.5) |
| 3 | `structure.bullishFvgSizePct` | **Directly** — R21 | Used in reason string |
| 4 | `structure.bearishFvgDistancePct` | **Directly** — R21 | < 2.5% = near gap (full weight: 1.5) |
| 5 | `structure.bearishFvgSizePct` | **Directly** — R21 | Used in reason string |
| 6 | `structure.bullishFvgTop` | **Not used** — ML only | Gap boundary |
| 7 | `structure.bullishFvgBottom` | **Not used** — ML only | Gap boundary |
| 8 | `structure.bearishFvgTop` | **Not used** — ML only | Gap boundary |
|   | `structure.bearishFvgBottom` | **Not used** — ML only | Gap boundary |

### 5.5 Lorentzian KNN Pattern Similarity (4 features)
Computed in [_compute_lorentzian_features()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/ml/feature_builder.py#L447-L538) using Lorentzian distance metric.

| # | Feature Path | Rule Engine Usage | Details |
|---|---|---|---|
| 1 | `lorentzian.bullishNeighborPct` | **Directly** — R23 | ≥ 70% = buy, ≤ 30% = sell (weight: 1.5) |
| 2 | `lorentzian.distanceAvgK8` | **Directly** — R23 | < 5.0 = high-confidence match (doubles weight) |
| 3 | `lorentzian.neighborLabelSum` | **Not used** — ML only | Raw label sum of k-nearest neighbors |
| 4 | `lorentzian.distanceTrend` | **Directly** — R30 | Converging patterns (`1`) with strong confidence boost score by 0.5 |

> [!NOTE]
> The Lorentzian KNN internally uses `rsi14`, `cci20`, `adx14`, `stochasticK`, and `roc10` as its 5-dimensional feature vector. These pandas-ta indicators are therefore also **indirect** dependencies of rule R23.

### 5.6 Candle Features (6 features)
All computed with raw OHLCV math.

| # | Feature Path | Rule Engine Usage | Details |
|---|---|---|---|
| 1 | `candle.bodyPct` | **Directly** — R25 | Body % of candle (used to confirm candle dominance > 40%) |
| 2 | `candle.upperWickPct` | **Directly** — R25 | Upper wick % (used for bearish wicks > 30%) |
| 3 | `candle.lowerWickPct` | **Directly** — R25 | Lower wick % (used for bullish wicks > 30%) |
| 4 | `candle.bullishStrength` | **Directly** — R25 | Bullish pattern strength (needs to be > 0.7) |
| 5 | `candle.bearishStrength` | **Directly** — R25 | Bearish pattern strength (needs to be > 0.7) |
| 6 | `candle.isBullish` | **Not used** — ML only | Raw boolean flag for candle direction |

### 5.7 Context / Raw Features (4 remaining)

| # | Feature Path | Rule Engine Usage |
|---|---|---|
| 1 | `context.openPrice` | **Not used** — ML only |
| 2 | `context.highPrice` | **Not used** — ML only |
| 3 | `context.lowPrice` | **Not used** — ML only |
| 4 | `context.signalType` | **Not used** — ML only (echo of signal type for training labels) |
|   | `context.timeframe` | **Not used** — ML only |
|   | `context.leverage` | **Not used** — ML only |

---

## 6. Summary Count Table

| Source | Total | Directly in Rules | Indirectly in Rules | ML Only (Never in Rules) |
|---|---|---|---|---|
| **Pandas-TA** | 33 | 20 | 10 | 3 |
| **Derived** (hardcoded math on pandas-ta/OHLCV) | 28 | 10 | 7 | 11 |
| **Custom** (fully hardcoded algorithms) | 28 | 20 | 0* | 8 |
| **Raw** (OHLCV passthrough) | 5 | 1 (`closePrice`) | 0 | 4 |
| **Grand Total** | **~94** | **51** | **17** | **26** |

> \* Lorentzian KNN internally uses 5 pandas-ta indicators as its feature vector, but these are already counted under pandas-ta indirect.

---

## 7. Rule Engine Configuration — Full Explanation

### 7.1 What are `mr_w` and `tf_w`? Why do some rules use them and some don't?

`mr_w` and `tf_w` are **regime-based scaling multipliers** that control how much weight the engine gives to different *types* of rules based on the current market condition.

- **`mr_w`** = **Mean-Reversion Weight** — multiplied into every rule in the `mean_reversion` group
- **`tf_w`** = **Trend-Following Weight** — multiplied into every rule in the `trend` group

**Why some rules use them and some don't:**

Each of the 31 rules belongs to one of 4 groups. The group determines whether `mr_w` or `tf_w` is applied:

| Group | Multiplier Used | Rules | Logic |
|---|---|---|---|
| `mean_reversion` | `× mr_w` | R1, R2, R3, R4, R5, R6, R7, R12, R22, R26, R27, R28 | These rules detect oversold/overbought conditions. In a strong trend, buying the dip is dangerous, so `mr_w` shrinks their contribution. |
| `trend` | `× tf_w` | R8, R9, R10, R11, R13, R14, R24, R29 | These rules follow trends. In a ranging market, trend signals are unreliable, so `tf_w` shrinks their contribution. |
| `volume_structure` | **No multiplier** (always 1.0) | R15, R16, R17, R18, R19, R20, R21, R25, R31 | Volume and structure signals (MFI, OBV, CMF, Supply/Demand, FVGs, Candle Patterns, EFI) are useful in ALL market conditions, so they are never scaled down. |
| `lorentzian` | **No multiplier** (always 1.0) | R23, R30 | The Lorentzian KNN and distance trend rules use pattern similarity, which works in any regime, so they are never scaled. |

**Concrete Example:**

Imagine BTCUSDT is in a strong **TRENDING** market with ADX = 45:
- `mr_w` = **0.0** (completely disabled)
- `tf_w` = **1.0** (full weight)

Now RSI = 25 (oversold). Normally this would give +2.0 buyScore. But:
```
R1 (RSI): buyScore += 2.0 × mr_w = 2.0 × 0.0 = 0.0   ← SUPPRESSED!
R9 (MACD bullish): buyScore += 2.0 × tf_w = 2.0 × 1.0 = 2.0   ← Full weight
R15 (MFI oversold): buyScore += 1.5 × 1.0 = 1.5   ← No multiplier, always full
```

This makes sense! In a strong uptrend with ADX=45, RSI oversold is probably a brief pullback — buying based on RSI alone is risky. But MACD bullish crossover confirms the trend, so it keeps full weight.

If the market was **RANGING** with ADX = 10:
- `mr_w` = **1.0** (full weight)
- `tf_w` = **0.0** (completely disabled)

```
R1 (RSI oversold): buyScore += 2.0 × 1.0 = 2.0   ← Full weight (buy the dip works in ranges)
R9 (MACD bullish): buyScore += 2.0 × 0.0 = 0.0   ← SUPPRESSED (trends are fake in ranges)
R15 (MFI oversold): buyScore += 1.5 × 1.0 = 1.5   ← Unaffected
```

---

### 7.2 The 31 Signal Rules

Defined in [evaluate_signal_rules()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L174-L840). Each rule produces buy/sell score contributions.

| Rule # | Name | Group | Max Weight | Indicators Used |
|---|---|---|---|---|
| R1 | RSI | `mean_reversion` | 2.0 × mr_w | `rsi14` |
| R2 | Stochastic %K | `mean_reversion` | 1.0 × mr_w | `stochasticK` |
| R3 | CCI | `mean_reversion` | 1.0 × mr_w | `cci20` |
| R4 | Bollinger %B | `mean_reversion` | 1.0 × mr_w | `bollingerPercentB` |
| R5 | Williams %R | `mean_reversion` | 1.0 × mr_w | `williamsR14` |
| R6 | Ultimate Oscillator | `mean_reversion` | 1.0 × mr_w | `ultimateOscillator` |
| R7 | Z-score | `mean_reversion` | 0.5 × mr_w | `zscore20` |
| R8 | Price vs EMA20 | `trend` | 0.5 × tf_w | `closePrice`, `ema20` |
| R9 | MACD Crossover | `trend` | 2.0 × tf_w | `macdLine`, `macdSignal`, `macdCrossoverDirection` |
| R10 | MACD Histogram | `trend` | 1.0 × tf_w | `macdHistogram` |
| R11 | ADX + DMI | `trend` | 1-2 × tf_w | `adx14`, `dmiPlus14`, `dmiMinus14` |
| R12 | ROC | `mean_reversion` | 1.0 × mr_w | `roc10` |
| R13 | PSAR | `trend` | 1.0 × tf_w | `psarDirection` |
| R14 | Awesome Oscillator | `trend` | 0.5 × tf_w | `awesomeOscillator` |
| R15 | MFI | `volume_structure` | 1.5 | `mfi14` |
| R16 | OBV Slope | `volume_structure` | 0.5 | `obvSlope5` |
| R17 | Relative Volume | `volume_structure` | 0.5 | `relativeVolume` |
| R18 | CMF | `volume_structure` | 1.0 | `cmf20` |
| R19 | Squeeze | `volume_structure` | 0.5 | `squeezeOn` |
| R20 | Supply/Demand Zones | `volume_structure` | 2.0 | `activeZoneBias`, `nearestDemandDistancePct`, `nearestSupplyDistancePct` |
| R21 | FVG | `volume_structure` | 1.5 | `nearestFvgBias`, `bullish/bearishFvgDistancePct`, `bullish/bearishFvgSizePct` |
| R22 | WaveTrend | `mean_reversion` | 1.5 × mr_w | `waveTrend1`, `waveTrend2` |
| R23 | Lorentzian KNN | `lorentzian` | 1.5 | `bullishNeighborPct`, `distanceAvgK8` |
| R24 | Kernel Regression | `trend` | 1.5 × tf_w | `kernelCrossoverSignal`, `priceVsKernelPct` |
| R25 | Candle Pattern | `volume_structure` | 1.0 | `bullishStrength`, `bearishStrength`, `bodyPct`, `lowerWickPct`, `upperWickPct` |
| R26 | Donchian Position | `mean_reversion` | 1.0 × mr_w | `donchianPositionPct` |
| R27 | Keltner Position | `mean_reversion` | 0.5 × mr_w | `keltnerPositionPct` |
| R28 | PPO | `mean_reversion` | 1.0 × mr_w | `ppoLine`, `ppoHistogram` |
| R29 | TRIX | `trend` | 0.5 × tf_w | `trix15` |
| R30 | Distance Trend | `lorentzian` | 0.5 | `distanceTrend`, `bullishNeighborPct` |
| R31 | Elder Force Index | `volume_structure` | 0.5 | `efi13` |

---

### 7.2a Maximum Possible Score — What's the Ceiling?

The max score depends on **regime** (which sets `mr_w`/`tf_w`) and **ADX** (which affects R11's weight). Here's the exact breakdown for every scenario, assuming ALL 31 rules have data and ALL trigger on the SAME side.

#### Base weights per rule (before regime multipliers)

| Rule | Group | Base Max Weight |
|---|---|---|
| R1 RSI | mean_reversion | 2.0 |
| R2 Stochastic | mean_reversion | 1.0 |
| R3 CCI | mean_reversion | 1.0 |
| R4 Bollinger %B | mean_reversion | 1.0 |
| R5 Williams %R | mean_reversion | 1.0 |
| R6 Ultimate Osc | mean_reversion | 1.0 |
| R7 Z-score | mean_reversion | 0.5 |
| R12 ROC | mean_reversion | 1.0 |
| R22 WaveTrend | mean_reversion | 1.5 |
| R26 Donchian Position | mean_reversion | 1.0 |
| R27 Keltner Position | mean_reversion | 0.5 |
| R28 PPO | mean_reversion | 1.0 |
| **Total mean_reversion** | | **12.5** |
| R8 Price vs EMA20 | trend | 0.5 |
| R9 MACD Crossover | trend | 2.0 |
| R10 MACD Histogram | trend | 1.0 |
| R11 ADX+DMI | trend | 1.0 or 2.0 |
| R13 PSAR | trend | 1.0 |
| R14 Awesome Osc | trend | 0.5 |
| R24 Kernel Regression | trend | 1.5 |
| R29 TRIX | trend | 0.5 |
| **Total trend** (ADX≤25) | | **8.0** |
| **Total trend** (ADX>25) | | **9.0** |
| R15 MFI | volume_structure | 1.5 |
| R16 OBV Slope | volume_structure | 0.5 |
| R17 Relative Volume | volume_structure | 0.5 |
| R18 CMF | volume_structure | 1.0 |
| R19 Squeeze | volume_structure | 0.5 |
| R20 Supply/Demand | volume_structure | 2.0 |
| R21 FVG | volume_structure | 1.5 |
| R25 Candle Pattern | volume_structure | 1.0 |
| R31 Elder Force Index | volume_structure | 0.5 |
| **Total volume_structure** | | **9.0** |
| R23 Lorentzian KNN | lorentzian | 1.5 |
| R30 Distance Trend | lorentzian | 0.5 |
| **Total lorentzian** | | **2.0** |

#### Max Score by Regime (with Balanced preset)

| Regime | ADX | mr_w | tf_w | mean_rev (×mr_w) | trend (×tf_w) | vol_struct | lorentzian | **Total Max** |
|---|---|---|---|---|---|---|---|---|
| **UNKNOWN** | 30 | 1.0 | 1.0 | 12.5 | 9.0 | 9.0 | 2.0 | **32.5** |
| **TRENDING** | 45 | 0.0 | 1.0 | 0.0 | 9.0 | 9.0 | 2.0 | **20.0** |
| **TRENDING** | 30 | 0.4 | 1.0 | 5.0 | 9.0 | 9.0 | 2.0 | **25.0** |
| **RANGING** | 12 | 1.0 | 0.0 | 12.5 | 0.0 | 9.0 | 2.0 | **23.5** |
| **RANGING** | 20 | 1.0 | 0.4 | 12.5 | 3.2 | 9.0 | 2.0 | **26.7** |

> [!NOTE]
> **For ETHUSDT on 1h with "balanced" preset:**
> - Best case (UNKNOWN regime, ADX>25): **max = 32.5** per side
> - Typical trending market: **max ≈ 20-25** per side
> - Typical ranging market: **max ≈ 23.5-26.7** per side
>
> In practice, you will NEVER see a score of 32.5. That would require every single indicator to unanimously agree — all oscillators oversold, all trend indicators bullish, all volume confirming, AND pattern recognition bullish at the same time. Realistic strong signals score **10-18 points**.

#### Confidence ceiling

The rule confidence formula is:
```
ruleConfidence = min(95, round(55 + (winningScore / availableMaxScore) × 40))
```

So even with a perfect score (winning = available max), confidence caps at **95**. In practice:
- Score 50% of max → confidence ≈ 75
- Score 40% of max → confidence ≈ 71
- Score 30% of max → confidence ≈ 67

---

### 7.2b Full Real-World ETHUSDT Walkthrough — From Candle Data to Final Signal

Here's a realistic scenario walking through **every single step** of the signal engine for ETHUSDT on 1h timeframe.

#### Scenario Setup

```
Pair:       ETHUSDT
Timeframe:  1h
Leverage:   10x
Price:      $3,820 (close of latest candle)
ATR14:      $62
```

**Feature Snapshot (computed by feature_builder.py):**

```python
snapshot = {
    "momentum": {
        "rsi14": 24.3,           # Very oversold
        "stochasticK": 12.5,     # Very oversold
        "cci20": -142,           # Below -100 threshold
        "williamsR14": -88,      # Below -80 (oversold)
        "ultimateOscillator": 28, # Below 30 (oversold)
        "macdLine": -2.8,
        "macdSignal": -1.5,
        "macdHistogram": -1.3,   # Negative (bearish)
        "macdCrossoverDirection": None,  # No crossover this bar
        "roc10": -6.2,           # Below -5 extreme
        "awesomeOscillator": -15.3, # Negative (bearish)
        "waveTrend1": -65,       # Deep oversold
        "waveTrend2": -70,       # WT1 > WT2 = bullish cross
        "ppoLine": -1.5,         # Below -1 (extreme low)
        "ppoHistogram": -0.5,    # Negative
        "trix15": -0.002,        # Negative (bearish)
    },
    "trend": {
        "ema20": 3870,           # Price BELOW ema20 (bearish)
        "adx14": 22,             # Moderate (below 25)
        "dmiPlus14": 18,
        "dmiMinus14": 30,        # DMI- > DMI+ (bearish)
        "psarDirection": "BEARISH",
        "kernelCrossoverSignal": 1, # Bullish crossover
        "priceVsKernelPct": 1.2, # Near kernel
    },
    "volatility": {
        "bollingerPercentB": 0.08, # Below 0.2 (oversold)
        "zscore20": -2.4,         # Below -2 (extreme low)
        "squeezeOn": False,
        "atr14": 62,
        "donchianPositionPct": 5, # Below 10 (oversold)
        "keltnerPositionPct": 8,  # Below 10 (oversold)
    },
    "volume": {
        "mfi14": 16,              # Below 20 (oversold)
        "obvSlope5": 125000,      # Positive (buying pressure)
        "relativeVolume": 1.8,    # Above 1.5 (high volume)
        "cmf20": 0.15,            # Positive (accumulation)
        "efi13": 120.0,           # Positive (bullish force)
    },
    "structure": {
        "activeZoneBias": "DEMAND",
        "nearestDemandDistancePct": 0.8,  # Very close to demand zone!
        "nearestFvgBias": "BULLISH",
        "bullishFvgDistancePct": 1.2,     # Near bullish FVG
        "bullishFvgSizePct": 0.45,
    },
    "lorentzian": {
        "bullishNeighborPct": 75,    # 75% of similar patterns were bullish
        "distanceAvgK8": 3.8,        # < 5.0 = high confidence
        "distanceTrend": 1,          # Converging patterns
    },
    "candle": {
        "bullishStrength": 0.85,     # Strong bullish pattern
        "bearishStrength": 0.15,
        "bodyPct": 45,
        "lowerWickPct": 35,          # Significant lower wick
        "upperWickPct": 10,
    },
    "context": {
        "marketRegime": "RANGING",
        "closePrice": 3820,
    }
}
```

---

#### Step 1: Regime Weights

```
Market Regime: RANGING
ADX: 22 (≥ 15, so not completely suppressed)
→ mr_w = 1.0, tf_w = 0.4
```

Timeframe config for 1h: `rsiOversold=30, rsiOverbought=70, rocExtreme=5, cciExtreme=100, stochLow=20, stochHigh=80`

---

#### Step 2: Evaluate All 31 Rules

**MEAN REVERSION group (× mr_w = 1.0):**

| Rule | Indicator Value | Threshold | Triggered? | Side | Score |
|---|---|---|---|---|---|
| R1 RSI | 24.3 | < 30 (oversold) | ✅ Yes | BUY | +2.0 × 1.0 = **2.0** |
| R2 Stochastic | 12.5 | < 20 (low) | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R3 CCI | -142 | < -100 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R4 Bollinger %B | 0.08 | < 0.2 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R5 Williams %R | -88 | < -80 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R6 Ultimate Osc | 28 | < 30 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R7 Z-score | -2.4 | < -2 | ✅ Yes | BUY | +0.5 × 1.0 = **0.5** |
| R12 ROC | -6.2 | < -5 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R22 WaveTrend | WT1=-65, WT2=-70 | WT1<-60 + bullish cross | ✅ Yes | BUY | +1.5 × 1.0 = **1.5** |
| R26 Donchian Position | 5 | < 10 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |
| R27 Keltner Position | 8 | < 10 | ✅ Yes | BUY | +0.5 × 1.0 = **0.5** |
| R28 PPO | line=-1.5, hist=-0.5 | line < -1, hist < 0 | ✅ Yes | BUY | +1.0 × 1.0 = **1.0** |

**Subtotal mean_reversion buyScore: 12.5** (maximum possible!)

**TREND group (× tf_w = 0.4):**

| Rule | Indicator Value | Threshold | Triggered? | Side | Score |
|---|---|---|---|---|---|
| R8 Price vs EMA | $3,820 < $3,870 | Price below EMA | ✅ Yes | SELL | +0.5 × 0.4 = **0.2** |
| R9 MACD Cross | direction = None | No crossover | ❌ No | — | 0 |
| R10 MACD Hist | -1.3 | < 0 | ✅ Yes | SELL | +1.0 × 0.4 = **0.4** |
| R11 ADX+DMI | DMI- (30) > DMI+ (18) | DMI- wins, ADX≤25 → weight=1 | ✅ Yes | SELL | +1.0 × 0.4 = **0.4** |
| R13 PSAR | BEARISH | BEARISH | ✅ Yes | SELL | +1.0 × 0.4 = **0.4** |
| R14 Awesome Osc | -15.3 | < 0 | ✅ Yes | SELL | +0.5 × 0.4 = **0.2** |
| R24 Kernel Regression | cross = 1 | cross = 1 (bullish) | ✅ Yes | BUY | +1.5 × 0.4 = **0.6** |
| R29 TRIX | -0.002 | < 0 | ✅ Yes | SELL | +0.5 × 0.4 = **0.2** |

**Subtotal trend buyScore: 0.6**
**Subtotal trend sellScore: 1.8** (heavily dampened by tf_w = 0.4!)

> [!IMPORTANT]
> Notice: Opposing trend rules fired as SELL (bearish), but they only contribute 1.8 total because `tf_w = 0.4` in a RANGING market. Without regime weighting, they'd contribute 4.5 — potentially blocking the buy signal!

**VOLUME_STRUCTURE group (no regime multiplier):**

| Rule | Indicator Value | Threshold | Triggered? | Side | Score |
|---|---|---|---|---|---|
| R15 MFI | 16 | < 20 | ✅ Yes | BUY | **1.5** |
| R16 OBV Slope | +125000 | > 0 | ✅ Yes | BUY | **0.5** |
| R17 Relative Vol | 1.8× | > 1.5 (buy leads) | ✅ Yes | BUY | **0.5** |
| R18 CMF | +0.15 | > 0.1 | ✅ Yes | BUY | **1.0** |
| R19 Squeeze | False | squeeze OFF | ❌ No | — | 0 |
| R20 Supply/Demand | DEMAND, 0.8% away | < 2.5% near zone | ✅ Yes | BUY | **2.0** |
| R21 FVG | BULLISH, 1.2% away | < 2.5% near FVG | ✅ Yes | BUY | **1.5** |
| R25 Candle Pattern | strength=0.85, body=45% | strength > 0.7, body > 40%, lower wick > 30% | ✅ Yes | BUY | **1.0** |
| R31 Force Index | 120.0 | > 0 | ✅ Yes | BUY | **0.5** |

**Subtotal volume_structure buyScore: 8.5**

**LORENTZIAN group (no regime multiplier):**

| Rule | Indicator Value | Threshold | Triggered? | Side | Score |
|---|---|---|---|---|---|
| R23 Lorentzian | 75% bullish, dist=3.8 | ≥70% + dist<5.0 | ✅ Yes (high conf) | BUY | **1.5** |
| R30 Distance Trend | dist_trend=1 | dist_trend = 1 (converging) | ✅ Yes | BUY | **0.5** |

**Subtotal lorentzian buyScore: 2.0**

---

#### Step 3: Apply Preset (Balanced)

With `balanced` preset, all group multipliers = 1.0, so no change.

```
Final buyScore  = 12.5 + 0.6 + 8.5 + 2.0   = 23.6
Final sellScore = 0 + 1.8 + 0 + 0           = 1.8
availableMaxScore = 12.5 + 3.2 + 9.0 + 2.0  = 26.7
```

*(available max for trend group = 8.0 × 0.4 = 3.2 because tf_w dampens the max too)*

---

#### Step 4: Pass Through 4 Gates

**Gate 1 — Dynamic Threshold:**
```
dynamicThreshold = max(2.5, 26.7 × 0.35) = max(2.5, 9.345) = 9.345
buyScore 23.6 ≥ 9.345? ✅ PASSES
```

**Gate 2 — Score Gap:**
```
scoreGap = |23.6 - 1.8| = 21.8
21.8 ≥ 3.0? ✅ PASSES (massive gap!)
```

**Gate 3 — Confluence:**
```
Buy categories:
  momentum: R1,R2,R3,R4,R5,R6,R12,R26,R27,R28 = 10 rules → momentum ✅
  trend: R24 = 1 rule → trend ✅
  volumeStruct: R15,R16,R17,R18,R20,R21,R23,R25,R31 = 9 rules → volumeStruct ✅

buyCategories = 3 (momentum + trend + volumeStruct)
3 ≥ 2? ✅ PASSES
```

**Gate 4 — Signal Quality:**
```
gapRatio = min(21.8 / (26.7 × 0.5), 1.0) = min(1.63, 1.0) = 1.0
confluenceRatio = 3 / 3.0 = 1.0
regimeAligned = 1.0 (ranging market + mean-reversion BUY = aligned!)
opponentRatio = 1.0 - (6 sell reasons / 29 total) = 0.793

signalQuality = (1.0 × 30) + (1.0 × 25) + (1.0 × 20) + (0.793 × 25)
             = 30 + 25 + 20 + 19.825 = 94.825 → 95

95 ≥ 40? ✅ PASSES
```

---

#### Step 5: Rule Confidence

```
ruleConfidence = min(95, round(55 + (23.6 / 26.7) × 40))
              = min(95, round(55 + 0.884 × 40))
              = min(95, round(55 + 35.36))
              = min(95, 90)
              = 90
```

---

#### Step 6: Price Targets (Regime-Adaptive)

```
Regime: RANGING → TP multiplier = 1.5, SL multiplier = 1.05
ATR14 = $62

TP = $3,820 + ($62 × 1.5) = $3,820 + $93   = $3,913
SL = $3,820 - ($62 × 1.05) = $3,820 - $65.1 = $3,754.90
```

---

#### Step 7: ML Validation (if rules_plus_ml or full_live_like)

Assuming ML model predicts `winProbability = 0.72` (72%):

```
All ML guardrails pass (rule confidence 90 ≥ 68, probability 72% ≥ 60%, etc.)

finalConfidence = (ruleConfidence × 0.35) + (mlProbability × 100 × 0.65)
               = (90 × 0.35) + (72 × 0.65)
               = 31.5 + 46.8
               = 78.3 → 78
```

---

#### Final Signal Output

```
Signal Type:      BUY
Confidence:       78% (blended rule + ML)
Entry Price:      $3,820.00
Take Profit:      $3,913.00 (+2.43%)
Stop Loss:        $3,754.90 (-1.70%)
Risk:Reward:      1:1.4
Leverage:         10x
Market Regime:    RANGING
Signal Quality:   95/100

Buy Score:        23.6
Sell Score:        1.8
Score Gap:        21.8
Available Max:    26.7

Buy Reasons (23):
  - RSI oversold (24.3)
  - Stochastic oversold (%K=12.5)
  - CCI oversold (-142)
  - Near Bollinger lower band (%B=0.08)
  - Williams %R oversold (-88)
  - Ultimate Oscillator oversold (28)
  - Z-score extreme low (-2.40)
  - ROC deeply negative (-6.2%)
  - WaveTrend oversold + bullish cross (WT1=-65)
  - MFI oversold (16)
  - OBV rising (buying pressure)
  - High volume confirms bullish bias (1.80x avg)
  - CMF positive accumulation (0.15)
  - Price sitting near demand zone (0.80% away)
  - Bullish FVG active nearby (0.45% gap size)
  - Lorentzian: 75% of similar patterns were bullish (high-confidence match)
  - Kernel regression bullish crossover (price vs kernel: 1.20%)
  - Strong bullish candle pattern (strength=0.85, body=45%, lower wick=35%)
  - Near Donchian channel low (5% position)
  - Near Keltner channel low (8% position)
  - PPO negative — momentum washed out (line=-1.50, hist=-0.50)
  - Lorentzian patterns converging + bullish — high-quality match
  - Elder Force Index positive — bullish force (120.0)

Sell Reasons (6):     ← opposing signals (caution)
  - Price below EMA20 (bearish trend)
  - MACD histogram negative
  - DMI- > DMI+ (bearish directional movement)
  - PSAR above price (bearish trend)
  - Awesome Oscillator negative (bearish momentum)
  - TRIX negative — smoothed trend down (-0.0020)
```

> [!TIP]
> This is an exceptionally strong signal (quality 95, buyScore 23.6 with massive gap). Most real signals will score 8-15 with quality 50-75. The key insight: in a RANGING market, all the mean-reversion indicators unanimously agreed (oversold everywhere), while the opposing trend signals were dampened to near-zero by the regime system. This is exactly how the engine is designed to work.

---

### 7.2c The 8 Newly Implemented Rules (R24-R31)

**Short answer: Yes!** Based on an analysis of the 40 previously unused features, 8 high-value features have now been successfully implemented as rules (R24-R31). Not all 40 were worth adding (some are raw inputs or redundant with existing rules), but these 8 genuinely improve accuracy and cover blind spots in the previous rule engine.

#### The 8 New Rules (Now Active)

I've analyzed all 40 unused features and categorized them by potential value:

##### ✅ HIGH VALUE — Implemented New Rules (R24-R31)

These add **genuinely new information** the rule engine didn't previously have:

---

**Rule R24: Kernel Regression Trend** (`trend.kernelCrossoverSignal`, `trend.priceVsKernelPct`)
- **Group**: `trend`
- **Weight**: 1.5 × tf_w
- **Logic**: Kernel regression uses Nadaraya-Watson smoothing — a completely different math approach from EMA/SMA. It detects trend direction using statistical non-parametric regression rather than simple moving averages.
- **Rule**: If `kernelCrossoverSignal == 1` (bullish cross) → +1.5 buy. If `-1` → +1.5 sell. If `priceVsKernelPct > 2%` → add 0.5 sell (overbought relative to kernel). If `priceVsKernelPct < -2%` → add 0.5 buy.
- **Why it helps**: Kernel regression catches trend changes that EMA/MACD miss because it adapts bandwidth to data shape rather than using fixed periods. Currently the rule engine has NO non-parametric trend detection.
- **How different from existing**: EMA/SMA are linear filters. Kernel regression is non-linear — it can detect curved trends and inflection points.

---

**Rule R25: Candle Pattern Strength** (`candle.bullishStrength`, `candle.bearishStrength`, `candle.bodyPct`, `candle.lowerWickPct`)
- **Group**: `volume_structure`
- **Weight**: 1.0
- **Logic**: Candle patterns (hammer, engulfing, doji) provide **immediate price action** context that no oscillator captures.
- **Rule**: If `bullishStrength > 0.7 AND bodyPct > 40 AND lowerWickPct > 30` → +1.0 buy (strong reversal candle). If `bearishStrength > 0.7 AND bodyPct > 40 AND upperWickPct > 30` → +1.0 sell.
- **Why it helps**: The current engine has ZERO price action rules. Every rule uses calculated indicators — none look at the actual candle shape. A hammer at a demand zone with RSI oversold is a much stronger signal than RSI oversold alone.
- **How different from existing**: Unique — no existing rule uses candle shape.

---

**Rule R26: Donchian Channel Position** (`volatility.donchianPositionPct`)
- **Group**: `mean_reversion`
- **Weight**: 1.0 × mr_w
- **Logic**: Donchian channels show where price sits relative to the N-period high/low range — a completely different volatility measure from Bollinger Bands.
- **Rule**: If `donchianPositionPct < 10` → +1.0 buy (near 20-period low). If `donchianPositionPct > 90` → +1.0 sell (near 20-period high).
- **Why it helps**: Bollinger %B (R4) measures deviation from the mean. Donchian position measures proximity to extremes. They're complementary — a coin can be at the Bollinger lower band but NOT at the Donchian low (if the band contracted).

---

**Rule R27: Keltner Channel Position** (`volatility.keltnerPositionPct`)
- **Group**: `mean_reversion`
- **Weight**: 0.5 × mr_w
- **Logic**: Keltner channels use ATR-based bands instead of standard deviation. Combined with the existing Bollinger squeeze (R19), this creates a richer volatility picture.
- **Rule**: If `keltnerPositionPct < 10` → +0.5 buy. If `keltnerPositionPct > 90` → +0.5 sell.
- **Why it helps**: Already partially used — Keltner channels are needed for the squeeze calculation (R19), but the channel position itself is ignored. Adding this is nearly free.

---

**Rule R28: PPO (Percentage Price Oscillator)** (`momentum.ppoLine`, `momentum.ppoHistogram`)
- **Group**: `mean_reversion`
- **Weight**: 1.0 × mr_w
- **Logic**: PPO is the MACD expressed as a percentage — it normalizes across different price levels, making it more comparable across coins.
- **Rule**: If `ppoHistogram > 0 AND ppoLine > 0` and both are extreme → sell (momentum exhaustion). If `ppoHistogram < 0 AND ppoLine < 0` extreme → buy.
- **Why it helps**: MACD (R9/R10) uses absolute values — a MACD of 5 means something different for BTC ($68K) vs ETH ($3.8K). PPO normalizes this, making cross-asset thresholds consistent.
- **Caveat**: Partially redundant with MACD. Should have lower weight (0.5-1.0) to avoid double-counting.

---

**Rule R29: TRIX Momentum** (`momentum.trix15`)
- **Group**: `trend`
- **Weight**: 0.5 × tf_w
- **Logic**: TRIX is a triple-smoothed EMA rate of change — it's the smoothest momentum indicator available, filtering out almost all noise.
- **Rule**: If `trix15 > 0` → +0.5 buy (momentum trending up). If `trix15 < 0` → +0.5 sell.
- **Why it helps**: TRIX is the "slow and steady" momentum indicator. While RSI and MACD react quickly (and can give false signals), TRIX only turns when the trend is genuinely changing. Good for filtering noise on lower timeframes.

---

**Rule R30: Distance Trend (Lorentzian)** (`lorentzian.distanceTrend`)
- **Group**: `lorentzian`
- **Weight**: 0.5
- **Logic**: `distanceTrend` tells you whether current market patterns are becoming MORE similar to historical patterns (+1 = converging) or LESS similar (-1 = diverging).
- **Rule**: If `distanceTrend == 1` AND R23 fired → boost R23 by 0.5. If `distanceTrend == -1` → reduce trust in R23 by 0.5.
- **Why it helps**: R23 already uses `distanceAvgK8` for confidence, but `distanceTrend` adds temporal context — are we entering a regime where pattern matching is getting better or worse?

---

**Rule R31: Elder Force Index** (`volume.efi13`)
- **Group**: `volume_structure`
- **Weight**: 0.5
- **Logic**: EFI combines price change with volume — it measures the "force" behind price moves. Positive EFI = bulls have force. Negative = bears.
- **Rule**: If `efi13 > 0` and extreme → +0.5 buy. If `efi13 < 0` and extreme → +0.5 sell.
- **Why it helps**: Different from MFI (R15) and CMF (R18). MFI is based on typical price × volume. CMF is accumulation/distribution flow. EFI is directly `(close - prevClose) × volume` — it measures how much force (volume × price change) is behind the move.

---

##### ⚠️ LOW VALUE — Not Recommended for Rules

These features shouldn't become rules because they're redundant or don't suit threshold-based logic:

| Feature | Why Not Worth Adding |
|---|---|
| `trend.hma20`, `trend.dema20`, `trend.linregValue` | Redundant with EMA20 (R8). Adding more MAs creates near-identical signals and inflates scores without adding information. |
| `trend.priceVsSma200Pct`, `priceVsHmaPct`, `priceVsDemaPct` | These are percentage distances — useful for ML but hard to set meaningful fixed thresholds for rules. |
| `trend.psarDistancePct` | PSAR direction (R13) already captures the signal. Distance adds granularity but not a new signal. |
| `volatility.natr14`, `volatilityPct`, `candleRangePct` | These measure volatility magnitude, not direction. They're better as context/modifiers than standalone rules. |
| `volatility.donchianWidthPct` | Width tells you HOW volatile, not direction. Already indirectly covered by squeeze (R19). |
| `volume.volumeSma20` | Raw number — relative volume (R17) already normalizes this. |
| `volume.adSlope5` | A/D line slope — similar information to OBV slope (R16). Adding both double-counts. |
| `volume.adSlope5` | Similar information to OBV slope (R16). |
| `candle.isBullish`, `candle.bodyPct`, `candle.upperWickPct`, `candle.lowerWickPct` | Best used IN COMBINATION (R25 above), not as individual rules. |
| `context.openPrice`, `highPrice`, `lowPrice` | Raw prices — no rule logic without context. |
| `context.signalType`, `timeframe`, `leverage` | Metadata, not indicators. |
| `lorentzian.neighborLabelSum` | Raw label sum — `bullishNeighborPct` (R23) already normalizes this. |
| `momentum.waveTrendCross` | Pre-computed cross — R22 already checks `wt1 > wt2` directly. |
| `momentum.macdCrossoverStrength` | Magnitude of MACD gap — potentially useful as a confidence modifier, but not a standalone rule. |

---

#### Summary: Impact Assessment

| Metric | Current | With 8 New Rules | Change |
|---|---|---|---|
| Total rules | 23 | 31 | +8 |
| Max score (UNKNOWN, balanced) | 26.0 | 32.5 | +6.5 |
| Indicator categories covered | 3 (momentum, trend, vol/struct) | 3 + enhanced | Same categories, deeper coverage |
| Unique signal types | Oscillators, MAs, volume, structure, patterns | + candle patterns, non-linear regression, force index | +3 genuinely new signal types |

> [!IMPORTANT]
> **The 3 highest-impact additions are:**
> 1. **R25 (Candle Patterns)** — adds price action awareness to the engine.
> 2. **R24 (Kernel Regression)** — adds non-linear trend detection, fundamentally different from EMA/SMA.
> 3. **R26 (Donchian Position)** — adds a second extreme-detection method complementary to Bollinger %B.
>
> These 3 rules alone give the engine candle pattern awareness, non-linear trend detection, and multi-method extreme detection.

---

### 7.3 Timeframe Threshold Configs

Defined at [line 25-32](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L25-L32). Different timeframes use different sensitivity thresholds:

| Timeframe | RSI Oversold | RSI Overbought | ROC Extreme | CCI Extreme | Stoch Low | Stoch High |
|---|---|---|---|---|---|---|
| 1m | 25 | 75 | 3 | 150 | 15 | 85 |
| 5m | 28 | 72 | 4 | 120 | 18 | 82 |
| 15m | 30 | 70 | 5 | 100 | 20 | 80 |
| 1h | 30 | 70 | 5 | 100 | 20 | 80 |
| 4h | 33 | 67 | 7 | 80 | 25 | 75 |
| 1d | 35 | 65 | 10 | 70 | 25 | 75 |

**Logic**: Shorter timeframes use more extreme thresholds (wider bands) to avoid noise-triggered false signals. Longer timeframes use tighter thresholds because moves are more significant.

---

### 7.4 Regime Weighting System — Full Explanation with Examples

Computed in [_compute_regime_weights()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L136-L151).

#### What is it?

The regime weighting system is the **first layer of intelligence** in the rule engine. Before any individual rule is evaluated, the system looks at the overall market condition (the "regime") and decides: *"Should I trust mean-reversion signals or trend-following signals more right now?"*

The `marketRegime` is computed from price vs moving averages + volatility in the feature builder. It produces one of: `TRENDING`, `TRENDING_VOLATILE`, `RANGING`, `RANGING_VOLATILE`, or other.

#### The Two Multipliers

- **`mr_w`** (mean_reversion weight) — applied to rules R1-R7, R12, R22, R26, R27, R28 (all `mean_reversion` group rules)
- **`tf_w`** (trend-following weight) — applied to rules R8-R11, R13, R14, R24, R29 (all `trend` group rules)

| Regime | ADX Condition | `mr_w` | `tf_w` | Effect |
|---|---|---|---|---|
| TRENDING | ADX > 40 | **0.0** | 1.0 | Completely suppress mean-reversion signals |
| TRENDING | ADX ≤ 40 | **0.4** | 1.0 | Heavily dampen mean-reversion |
| RANGING | ADX < 15 | 1.0 | **0.0** | Completely suppress trend signals |
| RANGING | ADX ≥ 15 | 1.0 | **0.4** | Heavily dampen trend signals |
| Any other | — | 1.0 | 1.0 | No adjustment |

#### Why does this exist?

This is one of the most important design decisions in the engine. The problem it solves:

- **In a strong uptrend**: RSI can stay "oversold" (< 30) for a long time during pullbacks. If you blindly buy every RSI oversold signal during a crash, you lose money. The regime system **suppresses** these mean-reversion buy signals when the trend is clearly bearish.
- **In a ranging market**: MACD crossovers happen constantly but lead nowhere. The regime system **suppresses** these trend signals when the market is chopping sideways.

#### Example 1: Strong Trending Market (BTCUSDT on 1h, ADX = 45)

```
Market Regime: TRENDING
ADX: 45 (> 40 threshold)
→ mr_w = 0.0, tf_w = 1.0
```

Indicator values:
- RSI = 28 (oversold → normally gives +2.0 buy)
- MACD = bullish crossover (normally gives +2.0 buy)
- MFI = 18 (oversold → normally gives +1.5 buy)

Score calculation:
```
R1 (RSI oversold):     base = 2.0 × mr_w(0.0) = 0.0   ← completely killed
R9 (MACD bullish):     base = 2.0 × tf_w(1.0) = 2.0   ← full weight
R15 (MFI oversold):    base = 1.5 × 1.0      = 1.5   ← unaffected (volume_structure)

Total buyScore = 0.0 + 2.0 + 1.5 = 3.5
```

Without regime weighting, buyScore would be 0.0 + 2.0 + 2.0 + 1.5 = 5.5. The system removed the RSI signal because in a strong trend, oversold RSI is a trap.

#### Example 2: Choppy Ranging Market (ETHUSDT on 1h, ADX = 12)

```
Market Regime: RANGING
ADX: 12 (< 15 threshold)
→ mr_w = 1.0, tf_w = 0.0
```

Indicator values:
- RSI = 25 (oversold → gives +2.0 buy)
- MACD = bullish crossover (normally gives +2.0 buy)
- Stochastic %K = 15 (oversold → gives +1.0 buy)

Score calculation:
```
R1 (RSI oversold):     base = 2.0 × mr_w(1.0) = 2.0   ← full weight (buy the dip works!)
R2 (Stoch oversold):   base = 1.0 × mr_w(1.0) = 1.0   ← full weight
R9 (MACD bullish):     base = 2.0 × tf_w(0.0) = 0.0   ← completely killed

Total buyScore = 2.0 + 1.0 + 0.0 = 3.0
```

The MACD crossover was killed because in a flat market, MACD crosses are noise. But RSI oversold + Stochastic oversold are reliable reversal signals in ranges.

#### Example 3: Moderate Trend (BTCUSDT on 4h, ADX = 30)

```
Market Regime: TRENDING
ADX: 30 (> 25 but ≤ 40)
→ mr_w = 0.4, tf_w = 1.0
```

```
R1 (RSI oversold):     base = 2.0 × mr_w(0.4) = 0.8   ← reduced but not killed
R9 (MACD bullish):     base = 2.0 × tf_w(1.0) = 2.0   ← full weight
```

In a moderate trend, mean-reversion signals are damped to 40% but not eliminated — there's still some chance a dip is tradeable.

---

### 7.5 Rule Presets — Full Explanation with Examples

Defined at [line 34-60](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L34-L60).

#### What are presets?

Presets are a **second layer of customization** applied *after* all 31 rules have been scored. While regime weighting (mr_w/tf_w) is automatic, presets are **user-chosen** strategy preferences.

Each preset defines a multiplier for each of the 4 rule groups. After all rules produce their `baseBuyContribution` and `baseSellContribution`, the preset multiplier is applied to get `finalBuyContribution` and `finalSellContribution`.

#### The 5 Presets

| Preset | `mean_reversion` | `trend` | `volume_structure` | `lorentzian` | Best For |
|---|---|---|---|---|---|
| **Balanced** | 1.0 | 1.0 | 1.0 | 1.0 | Default — equal weight to all |
| **Trend Following** | 0.7 | **1.25** | 1.0 | 1.0 | Riding strong trends |
| **Mean Reversion** | **1.25** | 0.75 | 1.0 | 1.0 | Range-bound markets |
| **Breakout** | 0.8 | 1.15 | **1.25** | 1.15 | Breakout from consolidation |
| **Scalping** | 1.1 | 1.1 | 0.9 | 0.8 | Quick in-and-out trades |

#### How presets interact with regime weighting

The two systems stack: **regime weighting happens first** (inside each rule), then **presets multiply the result**.

```
finalContribution = baseContribution × presetMultiplier
where baseContribution already includes mr_w or tf_w
```

#### Worked Example: Same Market, Different Presets

Scenario: BTCUSDT on 1h, UNKNOWN regime (mr_w=1.0, tf_w=1.0)

Rules that fired:
- R1 (RSI oversold, mean_reversion): baseBuyContribution = 2.0
- R9 (MACD bullish, trend): baseBuyContribution = 2.0
- R15 (MFI oversold, volume_structure): baseBuyContribution = 1.5
- R23 (Lorentzian bullish, lorentzian): baseBuyContribution = 1.5

**With "Balanced" preset:**
```
R1:  final = 2.0 × 1.0 (mean_reversion multiplier) = 2.0
R9:  final = 2.0 × 1.0 (trend multiplier)           = 2.0
R15: final = 1.5 × 1.0 (volume_structure multiplier) = 1.5
R23: final = 1.5 × 1.0 (lorentzian multiplier)       = 1.5
                                        Total buyScore = 7.0
```

**With "Trend Following" preset:**
```
R1:  final = 2.0 × 0.7 (mean_reversion ↓)  = 1.4
R9:  final = 2.0 × 1.25 (trend ↑)          = 2.5
R15: final = 1.5 × 1.0 (volume_structure =) = 1.5
R23: final = 1.5 × 1.0 (lorentzian =)       = 1.5
                                Total buyScore = 6.9
```

Notice: Trend Following **boosted** the MACD signal from 2.0→2.5 but **reduced** the RSI signal from 2.0→1.4. The total is similar, but the system now trusts trend signals more.

**With "Breakout" preset:**
```
R1:  final = 2.0 × 0.8  = 1.6
R9:  final = 2.0 × 1.15 = 2.3
R15: final = 1.5 × 1.25 = 1.875  ← volume/structure boosted!
R23: final = 1.5 × 1.15 = 1.725  ← lorentzian boosted!
                   Total buyScore = 7.5
```

Breakout boosts volume_structure the most (breakouts need volume confirmation) and also boosts lorentzian (pattern similarity detects breakout setups).

---

### 7.6 Signal Decision Gates — Full Explanation with Examples

After all 31 rules are scored and preset multipliers applied, the system has a `buyScore` and `sellScore`. But a raw score alone isn't enough to generate a signal — the signal must pass through **4 sequential gates**. If ANY gate fails, the signal becomes HOLD.

#### Gate 1: Dynamic Threshold

**Question it answers**: *"Is the winning score high enough relative to how many indicators had data?"*

```
dynamicThreshold = max(2.5, availableMaxScore × 0.35)
```

- `availableMaxScore` = the sum of all max weights of rules that had valid indicator data
- `SIGNAL_THRESHOLD_RATIO` = **0.35**
- The winning score (whichever is higher: buy or sell) must be ≥ this threshold

**Example — Passes:**
```
availableMaxScore = 18.0 (most indicators had data)
dynamicThreshold = max(2.5, 18.0 × 0.35) = max(2.5, 6.3) = 6.3
buyScore = 8.5, sellScore = 2.0
Winning score = 8.5 ≥ 6.3 ✅ PASSES
```

**Example — Fails:**
```
availableMaxScore = 18.0
dynamicThreshold = max(2.5, 18.0 × 0.35) = 6.3
buyScore = 5.0, sellScore = 1.0
Winning score = 5.0 < 6.3 ❌ FAILS → HOLD
```
Only 5.0 out of 18.0 possible — not enough conviction.

**Example — Low data (few indicators available):**
```
availableMaxScore = 5.0 (most indicators had no data — e.g., new token)
dynamicThreshold = max(2.5, 5.0 × 0.35) = max(2.5, 1.75) = 2.5  ← floor kicks in
buyScore = 3.0, sellScore = 0.0
Winning score = 3.0 ≥ 2.5 ✅ PASSES (lower bar because less data available)
```

The `max(2.5, ...)` floor ensures there's always a minimum bar even with little data.

#### Gate 2: Directional Score Gap

**Question it answers**: *"Is there a clear winner, or are buy and sell almost tied?"*

```
scoreGap = abs(buyScore - sellScore) ≥ 3.0
```

**Example — Passes:**
```
buyScore = 8.5, sellScore = 2.0
scoreGap = |8.5 - 2.0| = 6.5 ≥ 3.0 ✅ PASSES
```
Clear bullish bias — 6.5 points of separation.

**Example — Fails (conflicting signals):**
```
buyScore = 7.0, sellScore = 5.5
scoreGap = |7.0 - 5.5| = 1.5 < 3.0 ❌ FAILS → HOLD
```
Even though buyScore > sellScore, the gap is only 1.5 — the market is giving mixed signals. Some indicators say buy, others say sell. Too ambiguous.

**Why this matters**: Imagine RSI says oversold (buy), but MACD says bearish crossover (sell), and price is below EMA (sell). The scores might be 5.0 buy vs 4.0 sell. The engine says HOLD — it doesn't know which side is right.

#### Gate 3: Confluence Categories

**Question it answers**: *"Are multiple TYPES of indicators agreeing, or is it just one type?"*

```
Winning side must have ≥ 2 out of 3 indicator categories contributing
```

The 3 categories:
1. **Momentum** — RSI, Stochastic, CCI, Williams %R, MACD, ROC, WaveTrend, etc.
2. **Trend** — EMA, MACD crossover, ADX+DMI, PSAR, Awesome Oscillator
3. **Volume/Structure** — MFI, OBV, CMF, Supply/Demand zones, FVGs, Squeeze

**Example — Passes (2 categories agree):**
```
BUY contributors:
- R1 (RSI oversold) → momentum category: count = 1
- R15 (MFI oversold) → volume/structure category: count = 1

buyCategories = 2 (momentum + volumeStruct) ≥ 2 ✅ PASSES
```
Two different types of analysis agree — momentum says oversold AND money flow confirms buying pressure.

**Example — Fails (only 1 category):**
```
BUY contributors:
- R1 (RSI oversold) → momentum: count = 1
- R2 (Stochastic oversold) → momentum: count = 2
- R3 (CCI oversold) → momentum: count = 3

buyCategories = 1 (only momentum) < 2 ❌ FAILS → HOLD
```
Even though 3 rules fired, they're all momentum oscillators! No trend confirmation, no volume confirmation. This could be a false oversold reading.

**Example — Passes (3 categories agree = very strong):**
```
BUY contributors:
- R1 (RSI oversold) → momentum: count = 1
- R9 (MACD bullish) → trend: count = 1
- R15 (MFI oversold) → volume/structure: count = 1

buyCategories = 3 (all three!) ≥ 2 ✅ PASSES (strong confluence)
```

#### Gate 4: Signal Quality Score

**Question it answers**: *"Overall, how good is this signal considering everything?"*

This is a composite 0-100 score combining 4 factors:

```
signalQuality = (gapRatio × 30) + (confluenceRatio × 25) + (regimeAligned × 20) + (opponentRatio × 25)
```

Must be ≥ **40** to pass (configurable via `min_signal_quality`).

**Example — High Quality Signal (score = 82):**
```
buyScore = 10.0, sellScore = 2.0, availableMaxScore = 20.0

gapRatio = min(scoreGap / (20.0 × 0.5), 1.0) = min(8.0/10.0, 1.0) = 0.8
confluenceRatio = 3 categories / 3.0 = 1.0 (all 3 agree)
regimeAligned = 1.0 (trending market + trend signal)
opponentRatio = 1.0 - (1 opponent / 6 total reasons) = 0.83

signalQuality = (0.8 × 30) + (1.0 × 25) + (1.0 × 20) + (0.83 × 25)
             = 24 + 25 + 20 + 20.8 = 89.8 → 90

90 ≥ 40 ✅ PASSES — high quality BUY signal
```

**Example — Low Quality Signal (score = 33):**
```
buyScore = 5.0, sellScore = 1.5, availableMaxScore = 18.0

gapRatio = min(3.5/9.0, 1.0) = 0.39
confluenceRatio = 2 / 3.0 = 0.67
regimeAligned = 0.5 (ranging market but issuing a trend signal — misaligned)
opponentRatio = 1.0 - (2 opponents / 5 total) = 0.6

signalQuality = (0.39 × 30) + (0.67 × 25) + (0.5 × 20) + (0.6 × 25)
             = 11.7 + 16.75 + 10 + 15 = 53.5 → 54

54 ≥ 40 ✅ PASSES (barely)
```

**Example — Fails Quality Gate (score = 28):**
```
buyScore = 4.0, sellScore = 0.8, availableMaxScore = 18.0

gapRatio = min(3.2/9.0, 1.0) = 0.36
confluenceRatio = 1 / 3.0 = 0.33 (only 1 category)
regimeAligned = 0.5 (misaligned)
opponentRatio = 1.0 - (3 opponents / 4 total) = 0.25

signalQuality = (0.36 × 30) + (0.33 × 25) + (0.5 × 20) + (0.25 × 25)
             = 10.8 + 8.25 + 10 + 6.25 = 35.3 → 35

35 < 40 ❌ FAILS → HOLD (downgraded: "Quality gate: score 35/100 below minimum 40")
```

#### Full Gate Flow — Putting It All Together

Here's a complete example showing all 4 gates:

```
BTCUSDT 1h — Market: RANGING, ADX: 25
mr_w = 1.0, tf_w = 0.4

After all 31 rules scored + "balanced" preset:
  buyScore = 8.5
  sellScore = 2.0
  availableMaxScore = 16.0

Gate 1 — Dynamic Threshold:
  threshold = max(2.5, 16.0 × 0.35) = max(2.5, 5.6) = 5.6
  8.5 ≥ 5.6? ✅ YES

Gate 2 — Score Gap:
  gap = |8.5 - 2.0| = 6.5
  6.5 ≥ 3.0? ✅ YES

Gate 3 — Confluence:
  Buy has: momentum(2) + trend(1) + volumeStruct(1) = 3 categories
  3 ≥ 2? ✅ YES

Gate 4 — Signal Quality:
  signalQuality = 72
  72 ≥ 40? ✅ YES

→ Result: BUY signal with confidence ~75%
```

---

### 7.7 Validation Modes — Full Explanation

Defined at [line 62-64](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L62-L64). Controls which post-rule checks are applied.

#### The 3 Modes

| Mode | Rules | ML | MTF | Order Flow | Default For |
|---|---|---|---|---|---|
| `rules_only` | ✅ | ❌ | ❌ | ❌ | Backtesting when ML is OFF |
| `rules_plus_ml` | ✅ | ✅ | ❌ | ❌ | Backtesting when ML is ON |
| `full_live_like` | ✅ | ✅ | ✅ | ✅ | Live signal generation |

#### "So in live signals, all 4 are considered?"

**Yes.** When you generate a live signal (default mode = `full_live_like`), all 4 layers are active:

1. **Rules** (31 rules) → produce buyScore/sellScore → pass through 4 gates
2. **ML Model** → XGBoost + Lorentzian KNN predicts win probability → accuracy guardrails check if the model agrees
3. **MTF (Multi-Timeframe)** → fetches the higher timeframe (e.g., if signal is 1h, checks 4h) → if higher TF trends against the signal, it's **blocked** (forced to HOLD)
4. **Order Flow** → checks Binance funding rate + long/short ratio → if order flow opposes the signal, confidence is **reduced by 8 points** (but not blocked)

So for a live BUY signal to survive, it must:
- Pass all 4 rule gates ✅
- ML model agrees (probability ≥ 60%) ✅
- Higher timeframe is NOT bearish ✅
- Order flow ideally not bearish (or confidence takes a -8 hit) ✅

#### "In backtesting, can we use ML or not? Why are MTF and order flow not used?"

**ML in backtesting — YES, you choose:**
- If you select a ML model for backtesting → mode = `rules_plus_ml` → the ML model runs inference on historical features and validates the signal
- If you don't select a ML model → mode = `rules_only` → only the 31 rules are evaluated, no ML

**MTF and Order Flow in backtesting — NOT USED. Here's why:**

> [!IMPORTANT]
> MTF and order flow require **live API calls** to Binance that cannot be replayed historically.

1. **MTF (Multi-Timeframe)** needs to fetch the higher timeframe's current candles from Binance (e.g., fetching 4h candles when your signal is 1h). During backtesting, you only have the klines for ONE timeframe — the one you're backtesting on. You'd need to also download and align the higher timeframe's historical data at every signal point, which:
   - Isn't implemented yet (the `generate_signal_from_klines` function only receives one set of klines)
   - Would be complex to align timestamps correctly
   - The backtest records MTF as a **"skipped" gate** with reason `"historical_mtf_not_available"` so you know it wasn't checked

2. **Order Flow** needs live Binance Futures API data:
   - **Funding Rate**: changes every 8 hours and is only available as current/recent data from the API. Binance doesn't provide a convenient historical funding rate stream aligned to your candle timestamps.
   - **Long/Short Ratio**: same issue — it's a real-time snapshot of current trader positioning.
   - You CAN'T know what the funding rate or L/S ratio was at the exact moment a historical signal would have fired.
   - The backtest records order flow as a **"skipped" gate** with reason `"historical_order_flow_not_available"`

**What this means practically:** Backtest results are slightly more **optimistic** than live performance, because live signals have 2 extra filters (MTF and order flow) that can block or reduce confidence. Some signals that pass in backtesting would be blocked in live by an opposing higher timeframe.

> [!TIP]
> The backtest UI has toggles for `includeMtfConfirmation` and `includeOrderFlowConfirmation` — but these only add the gate structure as "skipped" to the output for parity. They don't actually apply MTF/order-flow filtering because the historical data isn't available.

---

### 7.8 ML Accuracy Guardrails

Defined in [_build_accuracy_guardrail_decision()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L843-L881). When ML is active, directional signals must pass additional checks:

| Check | Threshold | Config Key | Effect if Failed |
|---|---|---|---|
| Rule confidence | ≥ **68%** | `min_directional_rule_confidence` | Signal → HOLD |
| Score gap | ≥ **3.0** | `min_directional_score_gap` | Signal → HOLD |
| ML win probability | ≥ **60%** | `min_ml_probability` | Signal → HOLD |
| Model ROC AUC | ≥ **0.58** | `min_model_roc_auc` | Signal → HOLD |
| Training dataset rows | ≥ **400** | `min_model_dataset_rows` | Signal → HOLD |
| Model promotion eligibility | Must be `true` | *(from model metadata)* | Signal → HOLD |

When `require_healthy_ml_for_directional_signals` = `true` (default), **all** ML checks must pass or the signal is forced to HOLD.

---

### 7.9 Confidence Blending

When ML is active and the signal passes all gates:

```python
finalConfidence = (ruleConfidence × 0.35) + (mlProbability × 100 × 0.65)
```

| Weight | Value | Source |
|---|---|---|
| `RULE_CONFIDENCE_WEIGHT` | **0.35** | Rule engine's 0-95 confidence score |
| `ML_PROBABILITY_WEIGHT` | **0.65** | ML model's win probability (0-1 → 0-100) |

**Purpose**: ML probability dominates the final confidence when the model is healthy, but the rule confidence still contributes a baseline.

---

### 7.10 Regime-Adaptive Price Targets — Full Explanation with Examples

Defined in [_get_regime_adaptive_multipliers()](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/signal_service.py#L154-L167).

#### What is it?

Once a BUY or SELL signal is confirmed, the system needs to set:
- **TP (Take Profit)** — the price target where you exit with profit
- **SL (Stop Loss)** — the price where you exit to limit loss

These are calculated using ATR (Average True Range) — a measure of how much the price typically moves. The regime determines HOW MANY ATRs to use for TP and SL.

#### The Formula

```
For BUY signals:
  TP = entryPrice + (ATR14 × TP_multiplier)
  SL = entryPrice - (ATR14 × SL_multiplier)

For SELL signals:
  TP = entryPrice - (ATR14 × TP_multiplier)
  SL = entryPrice + (ATR14 × SL_multiplier)
```

Base defaults: `TP_base = 3.0`, `SL_base = 1.5`

#### Multipliers by Regime

| Regime | TP Multiplier | SL Multiplier | Risk:Reward | Rationale |
|---|---|---|---|---|
| TRENDING | 3.0 × 1.3 = **3.9** | 1.5 × 1.0 = **1.5** | 1:2.6 | Let winners run, normal stops |
| TRENDING_VOLATILE | 3.0 × 1.5 = **4.5** | 1.5 × 1.3 = **1.95** | 1:2.3 | Wider everything for big swings |
| RANGING | 3.0 × 0.5 = **1.5** | 1.5 × 0.7 = **1.05** | 1:1.4 | Quick profits, tight stops |
| RANGING_VOLATILE | 3.0 × 0.7 = **2.1** | 1.5 × 1.0 = **1.5** | 1:1.4 | Slightly wider for volatility |
| CONSOLIDATING | 3.0 × 0.4 = **1.2** | 1.5 × 0.6 = **0.9** | 1:1.3 | Very conservative — tiny expected moves |
| BREAKOUT | 3.0 × 1.5 = **4.5** | 1.5 × 1.2 = **1.8** | 1:2.5 | Aggressive targets for momentum |
| UNKNOWN | 3.0 × 1.0 = **3.0** | 1.5 × 1.0 = **1.5** | 1:2.0 | No adjustment |

#### Example 1: BUY Signal in TRENDING Market

```
BTCUSDT — BUY signal at $68,000
ATR14 = $450 (price typically moves $450 per candle)
Regime = TRENDING

TP multiplier = 3.9 (base 3.0 × 1.3)
SL multiplier = 1.5 (base 1.5 × 1.0)

TP = $68,000 + ($450 × 3.9) = $68,000 + $1,755 = $69,755
SL = $68,000 - ($450 × 1.5) = $68,000 - $675  = $67,325

Potential profit:  $1,755 (2.58%)
Potential loss:    $675  (0.99%)
Risk:Reward ratio: 1:2.6 — you risk $675 to potentially make $1,755
```

In a trending market, the system gives the price room to run — the TP is almost 4 ATRs away because trending markets can sustain directional moves.

#### Example 2: BUY Signal in RANGING Market

```
ETHUSDT — BUY signal at $3,800
ATR14 = $65
Regime = RANGING

TP multiplier = 1.5 (base 3.0 × 0.5)
SL multiplier = 1.05 (base 1.5 × 0.7)

TP = $3,800 + ($65 × 1.5)  = $3,800 + $97.50 = $3,897.50
SL = $3,800 - ($65 × 1.05) = $3,800 - $68.25 = $3,731.75

Potential profit: $97.50  (2.57%)
Potential loss:   $68.25  (1.80%)
Risk:Reward: 1:1.4
```

In a ranging market, TP is tight (only 1.5 ATRs) because price bounces between support and resistance — it won't run far. SL is also tighter.

#### Example 3: SELL Signal in BREAKOUT Market

```
BTCUSDT — SELL signal at $70,000 (breakdown scenario)
ATR14 = $500
Regime = BREAKOUT

TP multiplier = 4.5 (base 3.0 × 1.5)
SL multiplier = 1.8 (base 1.5 × 1.2)

TP = $70,000 - ($500 × 4.5) = $70,000 - $2,250 = $67,750
SL = $70,000 + ($500 × 1.8) = $70,000 + $900  = $70,900

Potential profit: $2,250 (3.21%)
Potential loss:   $900   (1.29%)
Risk:Reward: 1:2.5
```

Breakout regime gives the widest TP (4.5 ATRs) because breakouts can produce large directional moves. SL is also wider (1.8 ATRs) to avoid getting stopped out by breakout volatility.

#### Why does this matter?

Without regime-adaptive targets:
- In a **ranging** market, a TP of 3.0 ATRs would almost never get hit (price reverses before that)
- In a **trending** market, a TP of 1.5 ATRs would exit way too early (leaving money on the table)

The system adapts expectations to match what the market is actually likely to do.

---

### 7.11 Live Signal Extra Gates (full_live_like mode only)

#### MTF (Multi-Timeframe) Confirmation
Defined in [mtf_service.py](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/mtf_service.py). Fetches the next higher timeframe and checks 4 conditions:
1. Price vs EMA20 direction
2. Price vs SMA50 direction
3. RSI > 55 (bullish) or < 45 (bearish)
4. EMA20 slope (rising/falling over 5 bars)

**Effect**: If the higher TF is **opposing** the signal direction → signal forced to HOLD. If order flow is opposing → confidence reduced by 8 points.

#### Order Flow Confirmation
Defined in [order_flow_service.py](file:///c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/app/services/order_flow_service.py). Checks 2 Binance Futures data points:
1. **Funding Rate**: > 0.05% = bearish contrarian, < -0.05% = bullish contrarian
2. **Long/Short Ratio**: > 2.0 = bearish contrarian, < 0.5 = bullish contrarian

**Effect**: Opposing order flow reduces confidence by 8 points (does not block signal).
