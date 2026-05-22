# Analis-AI — Signal & Backtesting System Documentation

> **Feature Version:** `v4_lorentzian` · **110 ML Features** · **23 Scoring Rules** · **XGBoost + Lorentzian KNN Ensemble**

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Signal Generation Pipeline](#2-signal-generation-pipeline)
3. [Technical Indicators](#3-technical-indicators)
4. [ML Feature Engineering](#4-ml-feature-engineering)
5. [Rule Engine (23 Rules)](#5-rule-engine-23-rules)
6. [ML Model — Ensemble Prediction](#6-ml-model--ensemble-prediction)
7. [Lorentzian Classification Integration](#7-lorentzian-classification-integration)
8. [Confidence Calculation](#8-confidence-calculation)
9. [Backtesting System](#9-backtesting-system)
10. [Configuration Reference](#10-configuration-reference)
11. [Data Flow Diagrams](#11-data-flow-diagrams)

---

## 1. System Architecture Overview

Analis-AI is a three-tier cryptocurrency futures signal generation and backtesting platform:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Frontend (SPA)                        │
│   Signal Dashboard · Backtesting UI · ML Model Management          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼────────────────────────────────────────┐
│                    Node.js / Express Backend                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Signal       │  │ Backtest     │  │ ML Feature   │              │
│  │ Service      │  │ Service      │  │ Service (JS) │              │
│  │ (22 Rules)   │  │ (Walk-fwd)   │  │ (Fallback)   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                  │                      │
│         └─────────┬───────┘                  │                      │
│                   │                          │ HTTP (port 8001)     │
│  ┌────────────────▼──────────────────────────▼──────┐               │
│  │           ML Inference Service (client)          │               │
│  └──────────────────────────┬───────────────────────┘               │
│                             │                                       │
│                    MongoDB (signals, backtests, datasets)            │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼────────────────────────────────────────┐
│                  Python FastAPI ML Service                           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Feature      │  │ Training     │  │ Model Store  │              │
│  │ Builder      │  │ Pipeline     │  │ (Registry)   │              │
│  │ (pandas_ta)  │  │ (XGBoost +   │  │ (.joblib)    │              │
│  │ 110 features │  │  KNN)        │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                     │
│  Endpoints: /features, /predict, /train, /health, /models           │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Service Files

| Service | File | Purpose |
|---|---|---|
| **Signal Engine** | `backend/services/signalService.js` | 22-rule scoring engine + ML integration |
| **Backtest Engine** | `backend/services/backtestService.js` | Walk-forward signal simulation |
| **Indicator Service** | `backend/services/indicatorService.js` | Node.js indicator calculations (RSI, MACD, EMA, etc.) |
| **ML Feature Service** | `backend/services/mlFeatureService.js` | JS fallback feature builder + Python feature proxy |
| **ML Inference** | `backend/services/mlInferenceService.js` | HTTP client for Python ML service |
| **ML Dataset** | `backend/services/mlDatasetService.js` | Feature flattening + training data export |
| **Feature Builder** | `backend/ml_service/feature_builder.py` | 110-feature Python computation (pandas_ta) |
| **Feature Schema** | `backend/ml_service/feature_schema.py` | Authoritative feature column list |
| **Training Pipeline** | `backend/ml_service/training.py` | XGBoost + Lorentzian KNN training |
| **Lorentzian Model** | `backend/ml_service/lorentzian_model.py` | KNN classifier with Lorentzian distance |
| **ML API** | `backend/ml_service/app.py` | FastAPI prediction/training endpoints |
| **Model Store** | `backend/ml_service/model_store.py` | Model artifact storage & registry |

---

## 2. Signal Generation Pipeline

Every signal goes through a multi-stage pipeline:

```
Raw Kline Data (OHLCV candles from Binance)
     │
     ▼
┌─────────────────────────┐
│  1. Feature Engineering │  → 110 features computed via pandas_ta (Python)
│     (feature_builder.py)│     Falls back to JS manual computation if Python unavailable
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  2. Rule Engine         │  → 22 scoring rules evaluate indicators
│     (signalService.js)  │     Outputs: BUY / SELL / HOLD + buyScore + sellScore
│                         │     Regime-aware: rules down-weighted by market regime
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  3. ML Prediction       │  → XGBoost + Lorentzian KNN ensemble
│     (app.py /predict)   │     Outputs: probability (0.0 - 1.0) of WIN outcome
│                         │     Platt-calibrated for reliable probability estimates
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  4. Confidence Blend    │  → finalConfidence = rule × 0.35 + ML × 0.65
│     (signalService.js)  │     Guardrails: min 60% probability, min 68% rule confidence
│                         │     Directional agreement required (rule & ML must agree)
└────────────┬────────────┘
             │
             ▼
       SIGNAL OUTPUT
   { type, confidence, price targets, reasoning, features }
```

### Signal Types

| Type | Meaning | Threshold |
|---|---|---|
| **BUY** | Go LONG (futures) | buyScore ≥ threshold AND buyScore > sellScore |
| **SELL** | Go SHORT (futures) | sellScore ≥ threshold AND sellScore > buyScore |
| **HOLD** | No action | Neither score reaches threshold |

### Dynamic Threshold

```
threshold = max(2.5, availableMaxScore × 0.35)
```

The threshold adapts to how many indicators are available (e.g., if ADX data is missing, the max score decreases, and the threshold adjusts accordingly).

---

## 3. Technical Indicators

All indicators are computed by the Python `feature_builder.py` using the `pandas_ta` library. When the Python ML service is unavailable, a subset is computed by the Node.js `indicatorService.js` as a fallback.

### 3.1 Core Indicators (16)

| Indicator | Period | Library | Description |
|---|---|---|---|
| **RSI** | 14 | `ta.rsi()` | Relative Strength Index — momentum oscillator (0-100) |
| **MACD** | 12/26/9 | `ta.macd()` | Moving Average Convergence Divergence — trend momentum |
| **Stochastic** | 14/3/3 | `ta.stoch()` | Stochastic Oscillator — overbought/oversold (0-100) |
| **Bollinger Bands** | 20/2σ | `ta.bbands()` | Volatility bands around SMA |
| **ATR** | 14 | `ta.atr()` | Average True Range — volatility measure |
| **ADX** | 14 | `ta.adx()` | Average Directional Index — trend strength (0-100) |
| **CCI** | 20 | `ta.cci()` | Commodity Channel Index — momentum |
| **ROC** | 10 | `ta.roc()` | Rate of Change — percentage momentum |
| **MFI** | 14 | `ta.mfi()` | Money Flow Index — volume-weighted RSI (0-100) |
| **OBV** | — | `ta.obv()` | On-Balance Volume — cumulative volume pressure |
| **EMA 20** | 20 | `ta.ema()` | Exponential Moving Average |
| **EMA 50** | 50 | `ta.ema()` | Exponential Moving Average |
| **SMA 20** | 20 | `ta.sma()` | Simple Moving Average |
| **SMA 50** | 50 | `ta.sma()` | Simple Moving Average |
| **SMA 200** | 200 | `ta.sma()` | Simple Moving Average (long-term trend) |

### 3.2 Expanded Indicators (v3_expanded)

| Indicator | Period | Description |
|---|---|---|
| **Williams %R** | 14 | Momentum oscillator, inverted scale (-100 to 0) |
| **Awesome Oscillator** | 5/34 | Midpoint momentum (SMA difference) |
| **Ultimate Oscillator** | 7/14/28 | Multi-timeframe momentum composite |
| **TRIX** | 15 | Triple-smoothed EMA rate of change |
| **PPO** | 12/26/9 | Percentage Price Oscillator |
| **HMA** | 20 | Hull Moving Average — reduced lag |
| **DEMA** | 20 | Double Exponential Moving Average |
| **Parabolic SAR** | 0.02/0.2 | Stop-and-Reverse trend indicator |
| **Donchian Channel** | 20/20 | High/Low channel breakout system |
| **Keltner Channel** | 20/2 | ATR-based volatility channel |
| **CMF** | 20 | Chaikin Money Flow — institutional flow |
| **Accumulation/Distribution** | — | Cumulative volume × close location value |
| **Elder Force Index** | 13 | Price change × volume |
| **Z-Score** | 20 | Statistical deviation from mean |
| **Linear Regression** | 20 | Least-squares trend projection |

### 3.3 Lorentzian Classification Indicators (NEW — v4_lorentzian)

| Indicator | Description |
|---|---|
| **WaveTrend** (WT1 + WT2) | Cyclical oscillator from LazyBear — detects turning points better than RSI |
| **Rational Quadratic Kernel Regression** | Nadaraya-Watson non-parametric price estimator with RQ kernel |
| **Gaussian Kernel Regression** | Nadaraya-Watson estimator with Gaussian kernel (faster response) |
| **Lorentzian KNN** | Approximate Nearest Neighbors using Lorentzian distance metric |

---

## 4. ML Feature Engineering

### 4.1 Feature Categories (110 total)

| Category | Count | Description |
|---|---|---|
| **Momentum** | 19 | Oscillators and momentum indicators (RSI, MACD, Stochastic, CCI, ROC, Williams%R, AO, UO, TRIX, PPO, WaveTrend) |
| **Trend** | 27 | Moving averages, spreads, trend direction, ADX/DMI, PSAR, Kernel Regression |
| **Volatility** | 12 | ATR, Bollinger width, Donchian/Keltner position, squeeze detection, Z-score |
| **Volume** | 10 | Volume, relative volume, MFI, OBV, CMF, A/D line, Elder Force |
| **Structure** | 18 | Supply/Demand zones, Fair Value Gaps — ICT-style market structure |
| **Candle** | 6 | Body %, wicks %, bullish/bearish strength |
| **Context** | 8 | Signal type, timeframe, leverage, market regime, OHLC prices |
| **Lorentzian** | 4 | KNN distance features — pattern similarity via Lorentzian geometry |
| **Derived** | 6 | Crossover detection, trend direction classification, market regime |

### 4.2 Feature Version History

| Version | Name | Features | Compute Source |
|---|---|---|---|
| `v1` | Manual JS | ~60 | Node.js `indicatorService.js` (fallback) |
| `v3_expanded` | Pandas TA | 98 | Python `feature_builder.py` |
| `v4_lorentzian` | **Current** | **110** | Python `feature_builder.py` + Lorentzian Classification |

### 4.3 Feature Computation Flow

```
Raw OHLCV Candles (minimum 26 required)
     │
     ├──► [Python ML Service Available?]
     │         │
     │    YES  ▼                          NO  ▼
     │    pandas_ta computes ALL           JS indicatorService computes
     │    110 features                     ~60 features (v1)
     │    Version: v4_lorentzian           Version: v1
     │    Source: pandas_ta                Source: manual_indicator_service
     │         │                               │
     │         ▼                               ▼
     │    Full feature snapshot            Partial snapshot (nulls for
     │    (all categories populated)       advanced indicators — imputed
     │                                     to 0 by sklearn Imputer)
     │         │                               │
     └─────────┴───────────────────────────────┘
                        │
                        ▼
              Feature Snapshot Object
              {
                featureVersion: "v4_lorentzian",
                momentum: { ... 19 features ... },
                trend:    { ... 27 features ... },
                volatility: { ... 12 features ... },
                volume:   { ... 10 features ... },
                structure: { ... 18 features ... },
                candle:   { ... 6 features ... },
                context:  { ... 8 features ... },
                lorentzian: { ... 4 features ... },
              }
```

### 4.4 Categorical Feature Encoding

Some features are categorical and need numeric encoding for the ML model:

| Feature | Encoding |
|---|---|
| `momentum.macdCrossoverDirection` | UNKNOWN=-1, NONE=0, BULLISH=1, BEARISH=2 |
| `trend.trendDirection` | UNKNOWN=-1, SIDEWAYS=0, BULLISH=1, STRONG_BULLISH=2, BEARISH=-2, STRONG_BEARISH=-3 |
| `trend.psarDirection` | UNKNOWN=-1, BULLISH=1, BEARISH=-1 |
| `structure.activeZoneBias` | NONE=0, DEMAND=1, SUPPLY=-1 |
| `structure.nearestFvgBias` | NONE=0, BULLISH=1, BEARISH=-1 |
| `context.signalType` | UNKNOWN=-1, HOLD=0, BUY=1, SELL=-1 |
| `context.timeframe` | 1m=1, 5m=5, 15m=15, 1h=60, 4h=240, 1d=1440 |
| `context.marketRegime` | RANGING=0, RANGING_VOLATILE=1, TRENDING=2, TRENDING_VOLATILE=3 |

### 4.5 Trend Direction Classification

```
STRONG_BULLISH:  price > EMA20 > SMA20 > SMA200
BULLISH:         price > EMA20  AND  EMA20 >= SMA20
BEARISH:         price < EMA20  AND  EMA20 <= SMA20
STRONG_BEARISH:  price < EMA20 < SMA20 < SMA200
SIDEWAYS:        None of the above
```

### 4.6 Market Regime Classification

```
TRENDING_VOLATILE:   (Bullish or Bearish)  AND  volatility >= 3%
TRENDING:            (Bullish or Bearish)  AND  volatility < 3%
RANGING_VOLATILE:    Sideways  AND  volatility >= 3%
RANGING:             Sideways  AND  volatility < 3%
```

Where `volatility = max(atrPct, bollingerBandWidthPct)`.

---

## 5. Rule Engine (23 Rules)

The rule engine is a multi-indicator scoring system in `signalService.js`. Each rule adds to either `buyScore` or `sellScore` based on the current indicator values. Rules are divided into three regime-aware categories.

### 5.1 Regime-Aware Weighting

Rules are weighted differently based on the market regime:

| Category | Trending Market | Ranging Market |
|---|---|---|
| **Mean-Reversion** (mrW) | ×0.4 (down-weighted) | ×1.0 (full weight) |
| **Trend-Following** (tfW) | ×1.0 (full weight) | ×0.4 (down-weighted) |
| **Universal** | ×1.0 (always full) | ×1.0 (always full) |

### 5.2 All 22 Rules

#### Mean-Reversion Rules (down-weighted in trending markets)

| # | Rule | Weight | BUY Condition | SELL Condition |
|---|---|---|---|---|
| 1 | **RSI** | 2/1 × mrW | RSI < 30 (strong) / < 40 (moderate) | RSI > 70 (strong) / > 60 (moderate) |
| 2 | **Stochastic %K** | 1 × mrW | %K < 20 | %K > 80 |
| 3 | **CCI** | 1 × mrW | CCI < -100 | CCI > 100 |
| 4 | **Bollinger %B** | 1 × mrW | %B < 0.2 (near lower band) | %B > 0.8 (near upper band) |
| 5 | **Williams %R** | 1 × mrW | %R < -80 | %R > -20 |
| 6 | **Ultimate Oscillator** | 1 × mrW | UO < 30 | UO > 70 |
| 7 | **Z-Score** | 0.5 × mrW | Z < -2 (extreme low) | Z > 2 (extreme high) |
| 8 | **Price vs EMA20** | 0.5 × mrW | Price < EMA20 | Price > EMA20 |
| 22 | **WaveTrend** ★ | 1.5 × mrW | WT1 < -60 & WT1 > WT2 (oversold + cross) | WT1 > 60 & WT1 < WT2 (overbought + cross) |

#### Trend-Following Rules (down-weighted in ranging markets)

| # | Rule | Weight | BUY Condition | SELL Condition |
|---|---|---|---|---|
| 9 | **MACD Crossover** | 2 × tfW | MACD line crosses above signal | MACD line crosses below signal |
| 10 | **MACD Histogram** | 1 × tfW | Histogram > 0 | Histogram < 0 |
| 11 | **ADX + DMI** | 1-2 × tfW | DMI+ > DMI- (ADX>25 = weight 2) | DMI- > DMI+ (ADX>25 = weight 2) |
| 12 | **ROC** | 1 × tfW | ROC < -5% (deep negative) | ROC > 5% (strong positive) |
| 13 | **Parabolic SAR** | 1 × tfW | SAR below price (bullish) | SAR above price (bearish) |
| 14 | **Awesome Oscillator** | 0.5 × tfW | AO > 0 | AO < 0 |

#### Universal Rules (always full weight)

| # | Rule | Weight | BUY Condition | SELL Condition |
|---|---|---|---|---|
| 15 | **MFI** | 1.5/0.5 | MFI < 20 (strong) / < 40 (moderate) | MFI > 80 (strong) / > 60 (moderate) |
| 16 | **OBV Slope** | 0.5 | OBV rising (5-bar) | OBV falling (5-bar) |
| 17 | **Relative Volume** | 0.5 | High volume + bullish candle | High volume + bearish candle |
| 18 | **CMF** | 1 | CMF > 0.1 (accumulation) | CMF < -0.1 (distribution) |
| 19 | **Squeeze** | 0.5 | BB inside KC + bullish candle | BB inside KC + bearish candle |
| 20 | **Supply/Demand** | 2 | Near demand zone (< 2.5% away) | Near supply zone (< 2.5% away) |
| 21 | **Fair Value Gap** | 1.5 | Bullish FVG nearby | Bearish FVG nearby |
| 23 | **Lorentzian Consensus** ★ | 1.5/0.75 | ≥70% of similar patterns were bullish | ≤30% bullish (≥70% bearish) |

> ★ **Rule #22 (WaveTrend)** was added as part of the Lorentzian Classification integration. It detects cyclical reversals that RSI misses due to its different smoothing methodology.

> ★ **Rule #23 (Lorentzian Consensus)** is the only rule based on **historical pattern matching** rather than oscillator math. It uses Approximate Nearest Neighbors with Lorentzian distance to find the 8 most similar historical market states, then votes on direction. Full weight (1.5) is awarded when the match distance is low (high confidence); half weight (0.75) when distance is higher. This rule provides a fundamentally different signal source — it answers "what happened last time the market looked like this?" — complementing all other rules which answer "what are the indicators saying right now?".
>
> **Dual-layer design:** Lorentzian features are used in **both** the rule engine (Rule #23, transparent) and the ML model (as input features to XGBoost + as the KNN ensemble member). This mirrors how RSI, MACD, and other indicators work — the rule engine provides interpretable scoring while the ML model captures non-linear interactions between Lorentzian and other features.

### 5.3 Maximum Possible Score

The maximum possible score depends on available indicators and market regime:

```
Ranging Market (full mrW, reduced tfW):
  MR rules:  2 + 1 + 1 + 1 + 1 + 1 + 0.5 + 0.5 + 1.5 = 9.5 × 1.0 = 9.5
  TF rules:  2 + 1 + 2 + 1 + 1 + 0.5 = 7.5 × 0.4 = 3.0
  Universal: 1.5 + 0.5 + 0.5 + 1 + 0.5 + 2 + 1.5 + 1.5 = 9.0
  TOTAL:     ~21.5

Trending Market (reduced mrW, full tfW):
  MR rules:  9.5 × 0.4 = 3.8
  TF rules:  7.5 × 1.0 = 7.5
  Universal: 9.0
  TOTAL:     ~20.3
```

---

## 6. ML Model — Ensemble Prediction

### 6.1 Architecture

The ML model uses a **weighted ensemble** of two classifiers:

```
110 Flattened Features
        │
        ▼
   SimpleImputer (fill_value=0)
        │
        ├─────────────────────────────────────┐
        │                                     │
        ▼                                     ▼
   XGBClassifier                    KNeighborsClassifier
   (n_estimators=250,               (n_neighbors=8,
    max_depth=5,                     metric=lorentzian_distance,
    lr=0.05,                         weights='distance',
    subsample=0.9,                   algorithm='brute')
    scale_pos_weight=auto)
        │                                     │
        ▼                                     ▼
   P(win) = 0.72                    P(win) = 0.68
        │                                     │
        └──────────┬──────────────────────────┘
                   │
                   ▼
        Weighted Average:
        raw_prob = 0.72 × 0.65 + 0.68 × 0.35
                 = 0.468 + 0.238 = 0.706
                   │
                   ▼
        Platt Calibration
        (LogisticRegression)
                   │
                   ▼
        Calibrated Probability: 0.71
```

### 6.2 Lorentzian Distance Metric

The KNN model uses a **Lorentzian distance** instead of Euclidean:

```
Euclidean:   d(x,y) = √(Σ (xᵢ - yᵢ)²)
Lorentzian:  d(x,y) = Σ log(1 + |xᵢ - yᵢ|)
```

**Why Lorentzian?**
- The `log()` function compresses large differences, reducing the impact of outliers
- Black Swan events, FOMC announcements, and flash crashes create extreme indicator values
- Euclidean distance gives these outliers outsized influence; Lorentzian does not
- For small differences (normal market conditions), both metrics behave similarly

### 6.3 Training Pipeline

```
Training Dataset (CSV/JSON with labeled signals)
        │
        ▼
   Chronological Sort (by resolvedAt or createdAt)
        │
        ▼
   Feature Extraction (available FEATURE_COLUMNS only)
        │
        ▼
   Validation (≥60 rows, both classes, ≥10 per class)
        │
        ▼
   Chronological Split:
   ├── Train:       60% (first N rows)
   ├── Calibration: 20% (middle rows)
   └── Test:        20% (last rows — most recent data)
        │
        ▼
   SimpleImputer (fill missing → 0)
        │
        ▼
   Train XGBoost on train split
   Train Lorentzian KNN on train split
        │
        ▼
   Fit Platt Calibrator on calibration split
        │
        ▼
   Evaluate on test split (holdout metrics)
   Walk-forward cross-validation (2-5 folds)
        │
        ▼
   Promotion Eligibility Check:
   ├── Dataset ≥ 250 rows
   ├── ROC AUC ≥ 0.58
   ├── Walk-forward ROC AUC ≥ 0.56
   └── Brier Score ≤ 0.25
        │
        ▼
   Save Bundle: { model, imputer, calibrator, lorentzian_knn, ensemble_weights }
   Save Metadata: { metrics, featureColumns, promotion, etc. }
```

### 6.4 Model Bundle Contents

| Key | Type | Description |
|---|---|---|
| `model` | XGBClassifier | Primary gradient boosting model |
| `imputer` | SimpleImputer | Fills missing features with 0 |
| `calibrator` | LogisticRegression | Platt scaling for probability calibration |
| `lorentzian_knn` | KNeighborsClassifier | Secondary ensemble member (may be null) |
| `ensemble_weights` | dict | `{"xgboost": 0.65, "lorentzian_knn": 0.35}` |

### 6.5 Model Version Format

```
xgb_knn_v4_20260521T143000Z
│   │   │  └── ISO timestamp
│   │   └───── feature version (v4 = lorentzian)
│   └───────── includes KNN ensemble
└───────────── primary model type
```

---

## 7. Lorentzian Classification Integration

### 7.1 Overview

The Lorentzian Classification is a TradingView indicator by **@jdehorty** that uses machine learning concepts adapted from Minkowski geometry. We integrated its key mathematical components into Analis-AI:

### 7.2 Kernel Regression Features (5 new features)

**Nadaraya-Watson kernel regression** provides a non-parametric, adaptive trend estimation that doesn't require parameter optimization like traditional moving averages.

| Feature | Description |
|---|---|
| `trend.kernelRqEstimate` | Rational Quadratic kernel estimate of price |
| `trend.kernelGaussianEstimate` | Gaussian kernel estimate of price |
| `trend.kernelRateOfChange` | Kernel direction: 1=rising, -1=falling, 0=flat |
| `trend.kernelCrossoverSignal` | Gaussian crossing RQ: 1=bullish, -1=bearish, 0=none |
| `trend.priceVsKernelPct` | Price deviation from kernel estimate (%) |

**Rational Quadratic Kernel Formula:**
```
w(j) = (1 + j² / (2 × α × h²))^(-α)
estimate = Σ w(j) × price[i-j] / Σ w(j)

where:
  h = lookback (default: 8, env: KERNEL_LOOKBACK)
  α = relative weight (default: 8.0, env: KERNEL_RELATIVE_WEIGHT)
  j = bars ago (0 to start_bar)
```

**Why kernel regression?**
- EMAs/SMAs use fixed exponential/equal weighting — they can't adapt to different market speeds
- Kernel regression weights bars using a smooth probability-like function
- The RQ kernel has a "fatter tail" than Gaussian, meaning it considers more historical context
- Crossover of fast (Gaussian) over slow (RQ) kernel provides trend change signals

### 7.3 WaveTrend Oscillator (3 new features)

The WaveTrend oscillator (by LazyBear) is used as a core feature in the Lorentzian Classification indicator. It detects cyclical turning points differently from RSI.

| Feature | Description |
|---|---|
| `momentum.waveTrend1` | Primary WaveTrend line (smoothed CI) |
| `momentum.waveTrend2` | Signal line (SMA4 of WT1) |
| `momentum.waveTrendCross` | Cross direction: 1=bullish, -1=bearish, 0=none |

**Computation:**
```
HLC3 = (High + Low + Close) / 3
ESA  = EMA(HLC3, channelLen=10)
D    = EMA(|HLC3 - ESA|, channelLen=10)
CI   = (HLC3 - ESA) / (0.015 × D)
WT1  = EMA(CI, avgLen=11)
WT2  = SMA(WT1, 4)
```

**Rule Engine Integration (Rule #22):**
- Oversold + bullish cross: WT1 < -60 AND WT1 > WT2 → **BUY** (weight: 1.5)
- Overbought + bearish cross: WT1 > 60 AND WT1 < WT2 → **SELL** (weight: 1.5)
- Moderate zones: WT1 < -40 or > 40 → half weight (0.75)

### 7.4 Lorentzian Distance Features (4 new features)

These features use the Approximate Nearest Neighbors (ANN) algorithm from the Lorentzian Classification to find historically similar market patterns.

| Feature | Description |
|---|---|
| `lorentzian.distanceAvgK8` | Average Lorentzian distance to 8 nearest neighbors |
| `lorentzian.neighborLabelSum` | Sum of neighbor labels (+1 for bullish, -1 for bearish) |
| `lorentzian.bullishNeighborPct` | Percentage of neighbors that were bullish (0-100%) |
| `lorentzian.distanceTrend` | Pattern similarity trend: 1=improving, -1=deteriorating |

**How it works:**
1. Build a 5-feature vector for each bar: `[RSI, CCI, ADX, StochK, ROC]`
2. Label each bar: price 4 bars later > current = bullish (+1), else bearish (-1)
3. For the current bar, search backwards up to 500 bars
4. Use Lorentzian distance with 4-bar chronological spacing to find 8 nearest neighbors
5. Aggregate neighbor labels into features for the XGBoost model

### 7.5 Configurable Parameters

All kernel regression parameters can be tuned via environment variables:

| Variable | Default | Description |
|---|---|---|
| `KERNEL_LOOKBACK` | 8 | Kernel regression lookback window |
| `KERNEL_RELATIVE_WEIGHT` | 8.0 | RQ kernel relative weight parameter |
| `KERNEL_START_BAR` | 25 | Minimum bars before kernel starts |
| `KERNEL_LAG` | 2 | Lag offset between RQ and Gaussian kernels |

---

## 8. Confidence Calculation

### 8.1 Rule Confidence

Generated by the rule engine based on the scoring ratio:

```javascript
ruleConfidence = min(95, round(55 + (winningScore / availableMaxScore) × 40))
```

Range: 55-95%. A 50% confidence is assigned to HOLD signals.

### 8.2 ML Probability

The raw ensemble probability is calibrated via Platt scaling:

```
rawProbability = xgb_prob × 0.65 + knn_prob × 0.35
probability = calibrator.predict_proba([[rawProbability]])[0][1]
```

### 8.3 Final Blended Confidence

```javascript
finalConfidence = ruleConfidence × 0.35 + mlProbability × 100 × 0.65
```

### 8.4 ML Guardrails

The ML prediction is only applied if all guardrails pass:

| Guardrail | Threshold | Purpose |
|---|---|---|
| Minimum ML probability | 60% | Reject low-confidence predictions |
| Minimum rule confidence | 68% (directional) | Reject weak rule signals |
| Minimum score gap | 1.5 | Require clear directional consensus |
| Model ROC AUC | ≥ 0.58 | Reject undertrained models |
| Model dataset rows | ≥ 400 | Reject models trained on too little data |
| Directional agreement | ML & rules must agree | Prevent contradictory signals |

---

## 9. Backtesting System

### 9.1 Walk-Forward Simulation

The backtester in `backtestService.js` simulates trading signals over historical data:

```
Historical Kline Data (60-5000 candles)
        │
        ▼
   ┌─────────────────────────────────────┐
   │  Walk-Forward Loop:                 │
   │                                     │
   │  for each candle after warmup:      │
   │    1. Slice analysis window         │
   │    2. Generate signal (± ML)        │
   │    3. If BUY/SELL:                  │
   │       a. Simulate trade resolution  │
   │       b. Record result              │
   │       c. Apply cooldown             │
   │    4. If HOLD: skip                 │
   └─────────────────────────────────────┘
        │
        ▼
   Results: trades[], summary, equityCurve
```

### 9.2 Trade Resolution Simulation

Each trade is resolved by looking at future candles:

```
Signal at candle N → Look at candles N+1 through N+resolutionCandles

For each future candle:
  1. GAP EXIT: Does the open price gap past TP or SL?
     → If yes, exit at gap open price
  
  2. INTRABAR EXIT: Does high/low touch TP or SL?
     → If yes, exit at TP/SL price
     → If BOTH hit in same candle:
        "conservative" = SL first
        "optimistic" = TP first
  
  3. If no exit after all resolution candles:
     → TIME EXPIRY: exit at last candle's close
```

### 9.3 Exit Reasons

| Exit Reason | Description | Outcome |
|---|---|---|
| `take_profit_intrabar` | TP hit within candle high/low | WIN |
| `take_profit_gap` | Open price gapped past TP | WIN |
| `stop_loss_intrabar` | SL hit within candle high/low | LOSS |
| `stop_loss_gap` | Open price gapped past SL | LOSS |
| `time_expiry` | No TP/SL hit within resolution window | Determined by direction |

### 9.4 Cost Model

The backtester deducts both **fees** and **slippage** from the leveraged return:

```
grossReturnPct = price movement × leverage × direction

feeImpactPct = feesPerTradePct × leverage
  Example: 0.04% fee × 10x leverage = 0.4%

slippageImpactPct = slippagePct × leverage
  Example: 0.05% slippage × 10x leverage = 0.5%

netLeveragedReturnPct = max(grossReturnPct - feeImpactPct - slippageImpactPct, -100)
```

### 9.5 P&L Calculation (USD)

```
positionNotionalUsd = tradeAmountUsd × leverage
pnlUsd = tradeAmountUsd × (netLeveragedReturnPct / 100)

Example:
  Trade amount: $10, Leverage: 10x, Net return: 5%
  Position: $100 notional
  P&L: $10 × 5% = $0.50
```

### 9.6 Equity Metrics

The backtester computes comprehensive risk-adjusted metrics:

| Metric | Formula | Description |
|---|---|---|
| **Total Return %** | `(finalEquity / initialEquity - 1) × 100` | Compounding total return |
| **Max Drawdown %** | `max((peak - equity) / peak) × 100` | Worst peak-to-trough decline |
| **Sharpe Ratio** | `mean(returns) / std(returns)` | Risk-adjusted return (per-trade) |
| **Calmar Ratio** | `totalReturn / maxDrawdown` | Return per unit of max drawdown |
| **Profit Factor** | `grossWins / grossLosses` | Dollars won per dollar lost |
| **Win/Loss Ratio** | `avgWin / avgLoss` | Average win size vs average loss size |
| **Win Rate** | `wins / totalTrades × 100` | Percentage of winning trades |

### 9.7 Backtesting Parameters

| Parameter | Default | Range | Description |
|---|---|---|---|
| `symbol` | — | required | Trading pair (e.g., BTCUSDT) |
| `timeframe` | `1h` | 1m, 5m, 15m, 1h, 4h, 1d | Candlestick timeframe |
| `limit` | 300 | 60-1000 | Total candles to fetch |
| `analysisWindow` | 210 | 26-300 | Candles fed to signal engine per step |
| `warmupCandles` | = analysisWindow | 26-400 | Min candles before first signal |
| `resolutionCandles` | timeframe-dependent | 1-50 | Candles to look ahead for TP/SL |
| `cooldownCandles` | = resolutionCandles | 0-100 | Candles to skip after a trade |
| `leverage` | 10 | 1-125 | Futures leverage multiplier |
| `tradeAmountUsd` | 10 | 1-1,000,000 | Margin per trade (USD) |
| `feesPerTradePct` | 0.04 | 0-1 | Round-trip exchange fee (%) |
| `slippagePct` | 0.05 | 0-1 | Estimated price impact (%) |
| `atrTargetMultiplier` | 3.0 | 0.1-20 | ATR × multiplier = TP distance |
| `atrStopMultiplier` | 1.5 | 0.1-20 | ATR × multiplier = SL distance |
| `intrabarPolicy` | `conservative` | conservative, optimistic | Dual-hit resolution strategy |
| `backtestMlModel` | null | model version or "off" | ML model to use (null = rules only) |
| `startDate` / `endDate` | null | ISO date | Date range filter |
| `sampleSize` | 20 | 1-100 | Recent trades to return |

### 9.8 Default Resolution Candles by Timeframe

| Timeframe | Default Resolution Candles |
|---|---|
| 1m | 10 |
| 5m | 8 |
| 15m | 6 |
| 1h | 5 |
| 4h | 3 |
| 1d | 3 |

---

## 10. Configuration Reference

### 10.1 Environment Variables

| Variable | Default | Service | Description |
|---|---|---|---|
| `ML_SERVICE_URL` | `http://127.0.0.1:8001` | Node.js | Python ML service URL |
| `KERNEL_LOOKBACK` | `8` | Python | Kernel regression lookback |
| `KERNEL_RELATIVE_WEIGHT` | `8.0` | Python | RQ kernel weight |
| `KERNEL_START_BAR` | `25` | Python | Kernel minimum start bar |
| `KERNEL_LAG` | `2` | Python | Kernel lag offset |
| `ML_PROMOTION_MIN_DATASET_ROWS` | `250` | Python | Min rows for auto-promotion |
| `ML_PROMOTION_MIN_ROC_AUC` | `0.58` | Python | Min holdout ROC AUC |
| `ML_PROMOTION_MIN_WALKFORWARD_ROC_AUC` | `0.56` | Python | Min walk-forward AUC |
| `ML_PROMOTION_MAX_BRIER_SCORE` | `0.25` | Python | Max Brier score |

### 10.2 Signal Engine Constants

| Constant | Value | Description |
|---|---|---|
| `RULE_CONFIDENCE_WEIGHT` | 0.35 | Weight of rule confidence in final blend |
| `ML_PROBABILITY_WEIGHT` | 0.65 | Weight of ML probability in final blend |
| `MIN_DIRECTIONAL_RULE_CONFIDENCE` | 68% | Min rule confidence for ML overlay |
| `MIN_DIRECTIONAL_SCORE_GAP` | 1.5 | Min gap between buy/sell scores |
| `MIN_ML_PROBABILITY` | 60% | Min ML probability to apply |
| `MIN_MODEL_ROC_AUC` | 0.58 | Min model quality for ML overlay |
| `MIN_MODEL_DATASET_ROWS` | 400 | Min training data for ML overlay |
| `SIGNAL_THRESHOLD_RATIO` | 0.35 | 35% of max score as signal threshold |
| `DEFAULT_FUTURES_LEVERAGE` | 10 | Default leverage for signals |
| `DEFAULT_FEES_PER_TRADE_PCT` | 0.04 | Default round-trip fee (%) |

---

## 11. Data Flow Diagrams

### 11.1 Live Signal Generation

```
User requests signal for BTCUSDT/1h
        │
        ▼
Backend fetches kline data from Binance
        │
        ▼
buildMlFeatureSnapshotWithFallback()
        │
        ├── Try: POST /features to Python ML service
        │       → feature_builder.py computes 110 features
        │       → Returns v4_lorentzian snapshot
        │
        └── Fallback: JS buildMlFeatureSnapshot()
                → Computes ~60 features via indicatorService.js
                → Returns v1 snapshot (missing features = null → imputed to 0)
        │
        ▼
getRuleSignalContext(symbol, klineData, options, featureSnapshot)
        │
        ├── Extract indicator values from snapshot
        ├── Compute regime weights (mrW, tfW)
        ├── Run 22 scoring rules
        ├── Calculate dynamic threshold
        └── Output: { signalType, ruleConfidence, buyScore, sellScore, ... }
        │
        ▼
enrichSignalWithMlPrediction(signal, metadata)
        │
        ├── POST /predict to Python ML service
        │       → Flatten features → Impute → XGBoost + KNN → Calibrate
        │       → Returns { probability, ensemble: { xgb, knn, weights } }
        │
        ├── Apply guardrails (min probability, min confidence, etc.)
        ├── Compute finalConfidence = rule × 0.35 + ML × 0.65
        └── Output: enriched signal with ML metadata
        │
        ▼
Signal saved to MongoDB → pushed to frontend
```

### 11.2 Backtesting Flow

```
User configures backtest:
  { symbol, timeframe, limit, leverage, feesPerTradePct, slippagePct, ... }
        │
        ▼
Fetch historical klines (60-5000 candles)
        │
        ▼
Walk-forward loop:
  for (i = warmupCandles; i <= lastEligible; i++)
        │
        ├── Skip if in cooldown window
        │
        ├── Slice analysis window: klines[i-analysisWindow ... i]
        │
        ├── Generate signal (rules only, or rules + ML)
        │
        ├── If HOLD → skip, count as skippedHoldSignal
        │
        ├── If BUY or SELL:
        │     │
        │     ├── simulateTradeResolution(signal, futureCandles)
        │     │     → Check gap exits, intrabar TP/SL, time expiry
        │     │
        │     ├── buildTradeResult(...)
        │     │     → Calculate P&L with fees + slippage deduction
        │     │
        │     └── Apply cooldown: skip next N candles
        │
        └── Collect trade results
        │
        ▼
buildAggregateSummary(trades)
        │
        ├── Win rate, loss rate, neutral rate
        ├── Average return %, P&L USD
        ├── By type (BUY/SELL) breakdown
        ├── By exit reason breakdown
        └── buildEquityMetrics(trades)
              │
              ├── Compounding equity curve
              ├── Max drawdown %
              ├── Sharpe ratio, Calmar ratio
              ├── Profit factor, win/loss ratio
              └── Equity curve array for charting
        │
        ▼
Return: { config, dataset, summary, trades, recentTrades }
        │
        ▼
Optionally saved to MongoDB as BacktestRun
```

---

## Appendix: Complete Feature Reference

### Momentum Features (19)

| Feature Key | Source | Description |
|---|---|---|
| `momentum.rsi14` | pandas_ta | RSI(14) — 0 to 100 |
| `momentum.macdLine` | pandas_ta | MACD line (EMA12 - EMA26) |
| `momentum.macdSignal` | pandas_ta | MACD signal (EMA9 of MACD) |
| `momentum.macdHistogram` | pandas_ta | MACD histogram (MACD - Signal) |
| `momentum.macdCrossoverDirection` | derived | BULLISH / BEARISH / NONE / UNKNOWN |
| `momentum.macdCrossoverStrength` | derived | |MACD - Signal| at crossover |
| `momentum.stochasticK` | pandas_ta | Stochastic %K (14/3/3) — 0 to 100 |
| `momentum.stochasticD` | pandas_ta | Stochastic %D (smoothed %K) |
| `momentum.cci20` | pandas_ta | CCI(20) — unbounded |
| `momentum.roc10` | pandas_ta | ROC(10) — percentage |
| `momentum.williamsR14` | pandas_ta | Williams %R(14) — -100 to 0 |
| `momentum.awesomeOscillator` | pandas_ta | AO(5/34) — midpoint momentum |
| `momentum.ultimateOscillator` | pandas_ta | UO(7/14/28) — 0 to 100 |
| `momentum.trix15` | pandas_ta | TRIX(15) — triple EMA rate |
| `momentum.ppoLine` | pandas_ta | PPO line (12/26/9) |
| `momentum.ppoHistogram` | pandas_ta | PPO histogram |
| `momentum.waveTrend1` | custom | WaveTrend primary line ★ |
| `momentum.waveTrend2` | custom | WaveTrend signal line ★ |
| `momentum.waveTrendCross` | derived | WaveTrend crossover direction ★ |

### Trend Features (27)

| Feature Key | Source | Description |
|---|---|---|
| `trend.ema20` | pandas_ta | EMA(20) price level |
| `trend.ema50` | pandas_ta | EMA(50) price level |
| `trend.sma20` | pandas_ta | SMA(20) price level |
| `trend.sma50` | pandas_ta | SMA(50) price level |
| `trend.sma200` | pandas_ta | SMA(200) price level |
| `trend.emaSmaSpreadPct` | derived | (EMA20 - SMA20) / SMA20 × 100 |
| `trend.priceVsEmaPct` | derived | (Price - EMA20) / EMA20 × 100 |
| `trend.priceVsSmaPct` | derived | (Price - SMA20) / SMA20 × 100 |
| `trend.priceVsSma200Pct` | derived | (Price - SMA200) / SMA200 × 100 |
| `trend.trendDirection` | derived | STRONG_BULLISH / BULLISH / SIDEWAYS / BEARISH / STRONG_BEARISH |
| `trend.trendStrength` | derived | Max of MA deviation percentages |
| `trend.adx14` | pandas_ta | ADX(14) — trend strength 0-100 |
| `trend.dmiPlus14` | pandas_ta | DMI+(14) — bullish directional |
| `trend.dmiMinus14` | pandas_ta | DMI-(14) — bearish directional |
| `trend.hma20` | pandas_ta | Hull MA(20) — fast trend |
| `trend.dema20` | pandas_ta | Double EMA(20) — reduced lag |
| `trend.priceVsHmaPct` | derived | Price vs HMA deviation % |
| `trend.priceVsDemaPct` | derived | Price vs DEMA deviation % |
| `trend.psarDirection` | pandas_ta | Parabolic SAR — BULLISH / BEARISH |
| `trend.psarDistancePct` | derived | Price vs SAR distance % |
| `trend.linregValue` | pandas_ta | Linear regression(20) projected value |
| `trend.kernelRqEstimate` | custom | RQ kernel price estimate ★ |
| `trend.kernelGaussianEstimate` | custom | Gaussian kernel price estimate ★ |
| `trend.kernelRateOfChange` | derived | Kernel direction: 1/-1/0 ★ |
| `trend.kernelCrossoverSignal` | derived | Kernel crossover: 1/-1/0 ★ |
| `trend.priceVsKernelPct` | derived | Price vs kernel deviation % ★ |

### Volatility Features (12)

| Feature Key | Source | Description |
|---|---|---|
| `volatility.atr14` | pandas_ta | ATR(14) — absolute volatility |
| `volatility.atrPct` | derived | ATR / Price × 100 |
| `volatility.candleRangePct` | derived | (High - Low) / Close × 100 |
| `volatility.bollingerBandWidthPct` | derived | BB width / Price × 100 |
| `volatility.bollingerPercentB` | pandas_ta | %B — position within BB (0-1) |
| `volatility.natr14` | derived | Normalized ATR (= atrPct) |
| `volatility.volatilityPct` | derived | Max of ATR%, range%, BB width% |
| `volatility.donchianPositionPct` | derived | Position within Donchian channel (0-100%) |
| `volatility.donchianWidthPct` | derived | Donchian channel width % |
| `volatility.keltnerPositionPct` | derived | Position within Keltner channel (0-100%) |
| `volatility.squeezeOn` | derived | BB inside KC = volatility compression |
| `volatility.zscore20` | pandas_ta | Z-score(20) — standard deviations from mean |

### Volume Features (10)

| Feature Key | Source | Description |
|---|---|---|
| `volume.volume` | raw | Current bar volume |
| `volume.volumeSma20` | derived | SMA(20) of volume |
| `volume.relativeVolume` | derived | Current / SMA20 volume ratio |
| `volume.mfi14` | pandas_ta | MFI(14) — volume-weighted RSI (0-100) |
| `volume.obv` | pandas_ta | On-Balance Volume (cumulative) |
| `volume.obvSlope5` | derived | OBV change over 5 bars |
| `volume.cmf20` | pandas_ta | Chaikin Money Flow(20) — -1 to 1 |
| `volume.adLine` | pandas_ta | Accumulation/Distribution line |
| `volume.adSlope5` | derived | A/D line change over 5 bars |
| `volume.efi13` | pandas_ta | Elder Force Index(13) |

### Structure Features (18)

| Feature Key | Source | Description |
|---|---|---|
| `structure.activeZoneBias` | derived | Nearest zone type: DEMAND / SUPPLY / NONE |
| `structure.nearestSupplyTop` | derived | Supply zone upper bound (price) |
| `structure.nearestSupplyBottom` | derived | Supply zone lower bound (price) |
| `structure.nearestSupplyPoi` | derived | Supply zone point of interest (midpoint) |
| `structure.nearestSupplyDistancePct` | derived | Distance to supply zone (%) |
| `structure.nearestDemandTop` | derived | Demand zone upper bound (price) |
| `structure.nearestDemandBottom` | derived | Demand zone lower bound (price) |
| `structure.nearestDemandPoi` | derived | Demand zone point of interest (midpoint) |
| `structure.nearestDemandDistancePct` | derived | Distance to demand zone (%) |
| `structure.nearestFvgBias` | derived | Nearest FVG direction: BULLISH / BEARISH / NONE |
| `structure.bullishFvgTop` | derived | Bullish FVG upper bound |
| `structure.bullishFvgBottom` | derived | Bullish FVG lower bound |
| `structure.bullishFvgDistancePct` | derived | Distance to bullish FVG (%) |
| `structure.bullishFvgSizePct` | derived | Bullish FVG size as % of price |
| `structure.bearishFvgTop` | derived | Bearish FVG upper bound |
| `structure.bearishFvgBottom` | derived | Bearish FVG lower bound |
| `structure.bearishFvgDistancePct` | derived | Distance to bearish FVG (%) |
| `structure.bearishFvgSizePct` | derived | Bearish FVG size as % of price |

### Candle Features (6)

| Feature Key | Source | Description |
|---|---|---|
| `candle.bodyPct` | derived | Candle body size as % of close |
| `candle.upperWickPct` | derived | Upper wick as % of close |
| `candle.lowerWickPct` | derived | Lower wick as % of close |
| `candle.bullishStrength` | derived | Body % if bullish, else 0 |
| `candle.bearishStrength` | derived | Body % if bearish, else 0 |
| `candle.isBullish` | derived | True if close ≥ open |

### Context Features (8)

| Feature Key | Source | Description |
|---|---|---|
| `context.signalType` | input | BUY / SELL / HOLD / UNKNOWN |
| `context.timeframe` | input | 1m / 5m / 15m / 1h / 4h / 1d |
| `context.leverage` | input | Futures leverage (1-125) |
| `context.marketRegime` | derived | RANGING / RANGING_VOLATILE / TRENDING / TRENDING_VOLATILE |
| `context.closePrice` | raw | Current close price |
| `context.openPrice` | raw | Current open price |
| `context.highPrice` | raw | Current high price |
| `context.lowPrice` | raw | Current low price |

### Lorentzian Features (4) ★

| Feature Key | Source | Description |
|---|---|---|
| `lorentzian.distanceAvgK8` | custom | Avg Lorentzian distance to 8 nearest neighbors |
| `lorentzian.neighborLabelSum` | custom | Sum of neighbor labels: positive = bullish consensus |
| `lorentzian.bullishNeighborPct` | custom | % of nearest neighbors that were bullish (0-100) |
| `lorentzian.distanceTrend` | custom | 1 if nearest distance decreasing (similar pattern nearby), -1 otherwise |

> ★ Features marked with ★ were added as part of the Lorentzian Classification integration (v4_lorentzian).

---

*Last updated: 2026-05-21 · Feature Version: v4_lorentzian · Analis-AI*
