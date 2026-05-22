import "dotenv/config.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { exportTrainingDataset } from "../services/mlTrainingExportService.js";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = args[index + 1];

    if (arg === "--json" && nextValue) {
      options.jsonPath = nextValue;
      index += 1;
    } else if (arg === "--csv" && nextValue) {
      options.csvPath = nextValue;
      index += 1;
    } else if (arg === "--symbol" && nextValue) {
      options.symbol = nextValue.toUpperCase();
      index += 1;
    } else if (arg === "--timeframe" && nextValue) {
      options.timeframe = nextValue;
      index += 1;
    } else if (arg === "--min-resolved" && nextValue) {
      options.minResolvedAt = nextValue;
      index += 1;
    } else if (arg === "--limit" && nextValue) {
      options.limit = Number.parseInt(nextValue, 10);
      index += 1;
    } else if (arg === "--source" && nextValue) {
      options.source = nextValue;
      index += 1;
    } else if (arg === "--include-old-data") {
      options.minResolvedAt = null;
    } else if (arg === "--allow-untrusted-resolution") {
      options.trustedResolutionOnly = false;
    } else if (arg === "--allow-unguarded-backtests") {
      options.requireBacktestGuardrails = false;
    }
  }

  return options;
};

const run = async () => {
  await connectDB();
  const result = await exportTrainingDataset(parseArgs());
  console.log(`Exported ${result.count} training samples`);
  console.log(`JSON: ${result.jsonPath}`);
  console.log(`CSV:  ${result.csvPath}`);
  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error("Failed to export training data:", error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
