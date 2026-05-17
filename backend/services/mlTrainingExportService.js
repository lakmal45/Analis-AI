import fs from "node:fs/promises";
import path from "node:path";
import BacktestRun from "../models/BacktestRun.js";
import Signal from "../models/Signal.js";
import {
  buildTrainingSampleFromSignal,
  toTrainingRow,
} from "./mlDatasetService.js";

export const DEFAULT_ML_DATA_DIR = path.resolve(
  process.cwd(),
  "ml_service",
  "data",
);
export const DEFAULT_ML_JSON_PATH = path.join(
  DEFAULT_ML_DATA_DIR,
  "training-data.json",
);
export const DEFAULT_ML_CSV_PATH = path.join(
  DEFAULT_ML_DATA_DIR,
  "training-data.csv",
);

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
};

const buildCsv = (rows) => {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(","),
    ),
  ];

  return `${csvLines.join("\n")}\n`;
};

const normalizeSource = (value = "combined") => {
  const normalized = value.toString().trim().toLowerCase();
  if (["signal", "signals"].includes(normalized)) {
    return "signals";
  }
  if (["backtest", "backtests"].includes(normalized)) {
    return "backtests";
  }
  if (["combined", "all"].includes(normalized)) {
    return "combined";
  }

  throw new Error(
    `Invalid source "${value}". Use one of: signals, backtests, combined.`,
  );
};

const buildSourceQuery = (options = {}) => {
  const query = {
    outcome: { $in: ["WIN", "LOSS"] },
    features: { $exists: true, $ne: null },
  };

  if (options.symbol) {
    query.symbol = options.symbol.toUpperCase();
  }

  if (options.timeframe) {
    query.timeframe = options.timeframe;
  }

  if (options.minResolvedAt) {
    query.resolvedAt = { $gte: new Date(options.minResolvedAt) };
  }

  return query;
};

const buildExportDiagnostics = async (filters) => {
  const signalQuery = {
    status: "COMPLETED",
    ...buildSourceQuery(filters),
  };
  const backtestQuery = {
    ...(filters.symbol ? { symbol: filters.symbol.toUpperCase() } : {}),
    ...(filters.timeframe ? { "config.timeframe": filters.timeframe } : {}),
  };

  const [
    totalSignals,
    completedSignals,
    completedOutcomes,
    completedWithFeatures,
    totalBacktestRuns,
    matchingBacktestRuns,
  ] = await Promise.all([
    Signal.countDocuments({}),
    Signal.countDocuments({ status: "COMPLETED" }),
    Signal.countDocuments({
      status: "COMPLETED",
      outcome: { $in: ["WIN", "LOSS"] },
    }),
    Signal.countDocuments(signalQuery),
    BacktestRun.countDocuments({}),
    BacktestRun.countDocuments(backtestQuery),
  ]);

  return {
    totalSignals,
    completedSignals,
    completedWinLossSignals: completedOutcomes,
    completedWinLossSignalsWithFeatures: completedWithFeatures,
    totalBacktestRuns,
    matchingBacktestRuns,
  };
};

const sortAndLimitSamples = (samples, limit) => {
  const sorted = samples.sort((left, right) => {
    const leftResolved = left.resolvedAt ? new Date(left.resolvedAt).getTime() : 0;
    const rightResolved = right.resolvedAt ? new Date(right.resolvedAt).getTime() : 0;

    if (leftResolved !== rightResolved) {
      return leftResolved - rightResolved;
    }

    const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftCreated - rightCreated;
  });

  if (Number.isFinite(limit) && limit > 0) {
    return sorted.slice(0, limit);
  }

  return sorted;
};

const exportSignalSamples = async (options = {}) => {
  await Signal.updateMany(
    {
      status: { $in: ["COMPLETED", "CANCELLED"] },
      expiresAt: { $ne: null },
    },
    {
      $set: { expiresAt: null },
    },
  );

  const query = {
    status: "COMPLETED",
    ...buildSourceQuery(options),
  };

  const signals = await Signal.find(query)
    .sort({ resolvedAt: 1, createdAt: 1 })
    .lean();

  return signals
    .map((signal) =>
      buildTrainingSampleFromSignal({
        ...signal,
        sampleSource: "signal",
      }),
    )
    .filter(Boolean);
};

const exportBacktestSamples = async (options = {}) => {
  const runQuery = {
    ...(options.symbol ? { symbol: options.symbol.toUpperCase() } : {}),
    ...(options.timeframe ? { "config.timeframe": options.timeframe } : {}),
  };

  const backtestRuns = await BacktestRun.find(runQuery)
    .sort({ createdAt: 1 })
    .lean();

  const samples = [];
  for (const run of backtestRuns) {
    const trades = Array.isArray(run.trades) && run.trades.length > 0
      ? run.trades
      : Array.isArray(run.recentTrades)
        ? run.recentTrades
        : [];

    for (let index = 0; index < trades.length; index += 1) {
      const trade = trades[index];
      if (!trade?.features || !["WIN", "LOSS"].includes(trade.outcome)) {
        continue;
      }

      if (
        options.minResolvedAt &&
        (!trade.resolvedAt || new Date(trade.resolvedAt) < new Date(options.minResolvedAt))
      ) {
        continue;
      }

      const sample = buildTrainingSampleFromSignal({
        ...trade,
        sampleId: `${run._id.toString()}:${index}`,
        sampleSource: "backtest",
      });

      if (sample) {
        samples.push(sample);
      }
    }
  }

  return samples;
};

export const exportTrainingDataset = async (options = {}) => {
  const jsonPath = options.jsonPath || DEFAULT_ML_JSON_PATH;
  const csvPath = options.csvPath || DEFAULT_ML_CSV_PATH;
  const source = normalizeSource(options.source || "combined");

  let samples = [];
  if (source === "signals") {
    samples = await exportSignalSamples(options);
  } else if (source === "backtests") {
    samples = await exportBacktestSamples(options);
  } else {
    const [signalSamples, backtestSamples] = await Promise.all([
      exportSignalSamples(options),
      exportBacktestSamples(options),
    ]);
    samples = [...signalSamples, ...backtestSamples];
  }

  samples = sortAndLimitSamples(samples, options.limit);

  if (samples.length === 0) {
    const diagnostics = await buildExportDiagnostics(options);
    const filters = [
      `source=${source}`,
      options.symbol ? `symbol=${options.symbol.toUpperCase()}` : null,
      options.timeframe ? `timeframe=${options.timeframe}` : null,
      options.minResolvedAt ? `minResolvedAt=${new Date(options.minResolvedAt).toISOString()}` : null,
    ].filter(Boolean);

    const filterSummary = filters.length > 0 ? ` with filters (${filters.join(", ")})` : "";
    throw new Error(
      `No training signals found${filterSummary}. ` +
        `Counts: total=${diagnostics.totalSignals}, completed=${diagnostics.completedSignals}, ` +
        `completedWinLoss=${diagnostics.completedWinLossSignals}, ` +
        `completedWinLossWithFeatures=${diagnostics.completedWinLossSignalsWithFeatures}, ` +
        `backtestRuns=${diagnostics.totalBacktestRuns}, matchingBacktestRuns=${diagnostics.matchingBacktestRuns}. ` +
        "Generate resolved signals or save at least one backtest run with trades before exporting.",
    );
  }
  const rows = samples.map((sample) => toTrainingRow(sample)).filter(Boolean);

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(csvPath), { recursive: true });

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: samples.length,
        filters: {
          source,
          symbol: options.symbol || null,
          timeframe: options.timeframe || null,
          minResolvedAt: options.minResolvedAt
            ? new Date(options.minResolvedAt).toISOString()
            : null,
          limit: options.limit || null,
        },
        samples,
      },
      null,
      2,
    ),
    "utf8",
  );

  await fs.writeFile(csvPath, buildCsv(rows), "utf8");

  return {
    count: samples.length,
    jsonPath,
    csvPath,
  };
};

export default {
  exportTrainingDataset,
  DEFAULT_ML_JSON_PATH,
  DEFAULT_ML_CSV_PATH,
};
