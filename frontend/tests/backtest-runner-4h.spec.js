// @ts-check
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/*  Load .env.test                                                     */
/* ------------------------------------------------------------------ */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, ".env.test");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

const API_BASE = env.API_BASE_URL || "http://localhost:5000/api";
const EMAIL = env.TEST_USER_EMAIL;
const PASSWORD = env.TEST_USER_PASSWORD;

/* ------------------------------------------------------------------ */
/*  Parameter grid — derived from user requirements                    */
/* ------------------------------------------------------------------ */

/** Timeframes to sweep */
const TIMEFRAMES = ["4h"];

/** Resolution candles per timeframe */
const RESOLUTION_CANDLES_MAP = {
  "4h": 20,
};


/**
 * Date window configuration per timeframe.
 *
 * Candle counts per window:
 *   1h   120 days × 24 candles/day = 2,880 candles
 *
 * Each timeframe gets exactly 60 windows. The last window always ends on
 * FINAL_END_DATE (2026-06-04). The first start date is computed backwards.
 */
const TIMEFRAME_WINDOW_CONFIG = {
  "4h": { windowDays: 120, stepDays: 120 },   // 120-day contiguous windows
};

/** Every timeframe gets exactly 72 windows (6 years) */
const WINDOWS_PER_TIMEFRAME = 18;

/** No window may end after this date */
const FINAL_END_DATE = new Date("2026-06-08");

/**
 * Generate exactly WINDOWS_PER_TIMEFRAME date windows for a timeframe.
 *
 * The last window always ends on FINAL_END_DATE. The first start date is
 * calculated backwards so that exactly 12 windows fit at 10-day intervals.
 */
function generateDateWindows(timeframe) {
  const config = TIMEFRAME_WINDOW_CONFIG[timeframe];
  if (!config) throw new Error(`Unknown timeframe: ${timeframe}`);

  const { windowDays, stepDays } = config;

  // Last window:  start = FINAL_END - windowDays,  end = FINAL_END
  const lastStart = new Date(FINAL_END_DATE);
  lastStart.setDate(lastStart.getDate() - windowDays);

  // First window: start = lastStart - (count - 1) × step
  const firstStart = new Date(lastStart);
  firstStart.setDate(firstStart.getDate() - (WINDOWS_PER_TIMEFRAME - 1) * stepDays);

  const windows = [];
  let start = new Date(firstStart);

  for (let i = 0; i < WINDOWS_PER_TIMEFRAME; i++) {
    const end = new Date(start);
    end.setDate(end.getDate() + windowDays);

    windows.push({
      startDate: formatDate(start),
      endDate: formatDate(end),
    });

    start = new Date(start);
    start.setDate(start.getDate() + stepDays);
  }

  return windows;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Fixed parameters */
const FIXED_CONFIG = {
  limit: 300, // default — ignored when startDate/endDate are set
  analysisWindow: 210,
  sampleSize: 20,
  leverage: 20,
  tradeAmountUsd: 10,
  intrabarPolicy: "conservative",
  backtestMlModel: "off",
  applyAccuracyGuardrails: false,
  preset: "balanced",
};

/** Rule Presets to sweep */
const RULE_PRESETS = [
  "balanced",
  "trend_following",
  "mean_reversion",
  "breakout",
  "scalping",
];

/** Delay between API calls in ms (rate-limit safety) */
const DELAY_BETWEEN_CALLS_MS = 4000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCombinations(symbols) {
  const combos = [];

  for (const symbol of symbols) {
    for (const timeframe of TIMEFRAMES) {
      const dateWindows = generateDateWindows(timeframe);
      for (const window of dateWindows) {
        for (const preset of RULE_PRESETS) {
          combos.push({
            ...FIXED_CONFIG,
            symbol,
            timeframe,
            preset,
            resolutionCandles: RESOLUTION_CANDLES_MAP[timeframe],
            startDate: window.startDate,
            endDate: window.endDate,
          });
        }
      }
    }
  }

  return combos;
}

/* ------------------------------------------------------------------ */
/*  Main test                                                          */
/* ------------------------------------------------------------------ */

test.describe("Backtest Runner — Bulk Data Collection", () => {
  let authToken = "";

  test("Run all backtest combinations across watchlist coins", async ({
    request,
  }) => {
    /* ---- Step 1: Authenticate ---- */
    console.log("\n🔐 Logging in...");
    const loginRes = await request.post(`${API_BASE}/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(loginRes.ok(), `Login failed: ${loginRes.status()}`).toBeTruthy();

    const loginBody = await loginRes.json();
    authToken = loginBody.token;
    expect(authToken, "No token returned from login").toBeTruthy();
    console.log("✅ Authenticated successfully\n");

    const authHeaders = { Authorization: `Bearer ${authToken}` };

    /* ---- Step 2: Fetch watchlist coins ---- */
    console.log("📋 Fetching watchlist...");
    const watchlistRes = await request.get(`${API_BASE}/watchlist`, {
      headers: authHeaders,
    });
    expect(
      watchlistRes.ok(),
      `Watchlist fetch failed: ${watchlistRes.status()}`,
    ).toBeTruthy();

    const watchlistBody = await watchlistRes.json();
    const assets = watchlistBody.assets || [];
    const symbols = assets.map((a) => a.symbol).filter(Boolean);
    expect(symbols.length, "Watchlist is empty — add coins first").toBeGreaterThan(0);
    console.log(`✅ Found ${symbols.length} coins: ${symbols.join(", ")}\n`);

    /* ---- Step 3: Build parameter grid ---- */
    const combinations = buildCombinations(symbols);

    console.log("📊 Parameter grid (60 windows, 5 presets):");
    for (const tf of TIMEFRAMES) {
      const windows = generateDateWindows(tf);
      const cfg = TIMEFRAME_WINDOW_CONFIG[tf];
      console.log(
        `   ${tf}: ${windows.length} windows × ${RULE_PRESETS.length} presets = ${windows.length * RULE_PRESETS.length} runs/coin  (${cfg.windowDays + 1}-day window, ${cfg.stepDays}-day step, ~2880 candles)`,
      );
      console.log(
        `         ${windows[0].startDate} → ${windows[windows.length - 1].endDate}`,
      );
    }
    console.log(`   Leverage:      ${FIXED_CONFIG.leverage}x`);
    console.log(`   Presets:       ${RULE_PRESETS.join(", ")}`);
    console.log(`   Coins:         ${symbols.length}`);
    console.log(`   Total runs:    ${combinations.length}`);
    console.log("");

    /* ---- Step 4: Run backtests ---- */
    const results = {
      success: 0,
      failed: 0,
      totalTrades: 0,
      totalSignals: 0,
      errors: [],
    };

    const startTime = Date.now();

    for (let i = 0; i < combinations.length; i++) {
      const combo = combinations[i];
      const label = `[${i + 1}/${combinations.length}] ${combo.symbol} ${combo.timeframe} [${combo.preset}] ${combo.startDate}→${combo.endDate}`;

      try {
        const backtestRes = await request.post(`${API_BASE}/backtest`, {
          headers: authHeaders,
          data: combo,
        });

        if (!backtestRes.ok()) {
          const errorBody = await backtestRes.json().catch(() => ({}));
          const errorMsg = errorBody.message || `HTTP ${backtestRes.status()}`;
          console.log(`❌ ${label} — FAILED: ${errorMsg}`);
          results.failed++;
          results.errors.push({ label, error: errorMsg });
        } else {
          const body = await backtestRes.json();
          const data = body.data || {};
          const totalSignals = data.summary?.totalSignals || data.tradeCount || 0;
          const winRate = data.summary?.winRate ?? "n/a";
          const totalPnl = data.summary?.totalPnlUsd ?? 0;
          const pnlSign = totalPnl >= 0 ? "+" : "";

          results.success++;
          results.totalTrades += totalSignals;
          results.totalSignals += totalSignals;

          console.log(
            `✅ ${label} — ${totalSignals} trades, WR: ${winRate}%, PnL: ${pnlSign}$${totalPnl.toFixed(2)} [Run ID: ${data.id || "n/a"}]`,
          );
        }
      } catch (err) {
        const errorMsg = err.message || String(err);
        console.log(`💥 ${label} — ERROR: ${errorMsg}`);
        results.failed++;
        results.errors.push({ label, error: errorMsg });
      }

      // Rate-limit delay
      if (i < combinations.length - 1) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }
    }

    /* ---- Step 5: Summary report ---- */
    const elapsedMs = Date.now() - startTime;
    const elapsedMin = (elapsedMs / 60000).toFixed(1);

    console.log("\n" + "═".repeat(70));
    console.log("  BACKTEST RUNNER — SUMMARY REPORT");
    console.log("═".repeat(70));
    console.log(`  Total combinations:  ${combinations.length}`);
    console.log(`  Successful runs:     ${results.success}`);
    console.log(`  Failed runs:         ${results.failed}`);
    console.log(`  Total trades saved:  ${results.totalTrades}`);
    console.log(`  Elapsed time:        ${elapsedMin} minutes`);
    console.log(`  Avg time per run:    ${(elapsedMs / combinations.length / 1000).toFixed(1)}s`);
    console.log("═".repeat(70));

    if (results.errors.length > 0) {
      console.log("\n⚠️  Failed runs:");
      for (const { label, error } of results.errors) {
        console.log(`   ${label}`);
        console.log(`     → ${error}`);
      }
    }

    console.log("\n📦 Next steps:");
    console.log("   1. cd backend_py");
    console.log('   2. python scripts/ml_cli.py extract --source backtests');
    console.log("   3. python scripts/ml_cli.py train\n");

    // Assert at least some backtests succeeded
    expect(
      results.success,
      `All backtests failed. Check the error log above.`,
    ).toBeGreaterThan(0);
  });
});
