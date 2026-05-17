import {
  activateMlModelVersion,
  getLatestTrainingRun,
  getMlModelRegistry,
  requestMlTraining,
} from "./mlInferenceService.js";
import {
  DEFAULT_ML_CSV_PATH,
  exportTrainingDataset,
} from "./mlTrainingExportService.js";

let retrainingInterval = null;
let retrainingInProgress = false;
let lastRetrainingRun = null;

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const runMlRetraining = async (options = {}) => {
  if (retrainingInProgress) {
    return {
      success: false,
      reason: "already_running",
      lastRun: lastRetrainingRun,
    };
  }

  retrainingInProgress = true;

  try {
    const exportResult = await exportTrainingDataset({
      symbol: options.symbol,
      timeframe: options.timeframe,
      minResolvedAt: options.minResolvedAt,
      limit: options.limit,
      csvPath: options.csvPath || DEFAULT_ML_CSV_PATH,
      jsonPath: options.jsonPath,
    });

    const trainPayload = {
      datasetPath: options.datasetPath || "data/training-data.csv",
      activateOnTrain: options.activateOnTrain !== false,
      notes: options.notes || "backend_retraining_job",
    };
    const trainingResult = await requestMlTraining(trainPayload);

    lastRetrainingRun = {
      executedAt: new Date().toISOString(),
      exportedSamples: exportResult.count,
      datasetPath: trainingResult.datasetPath || trainPayload.datasetPath,
      trainingResult,
    };

    return {
      success: true,
      exportResult,
      trainingResult,
      lastRun: lastRetrainingRun,
    };
  } finally {
    retrainingInProgress = false;
  }
};

export const getMlLifecycleStatus = async () => {
  const [registry, latestTraining] = await Promise.all([
    getMlModelRegistry(),
    getLatestTrainingRun(),
  ]);

  return {
    retrainingInProgress,
    lastRetrainingRun,
    registry,
    latestTraining,
  };
};

export const promoteMlModelVersion = async (modelVersion) => {
  return activateMlModelVersion(modelVersion);
};

export const startMlRetrainingJob = () => {
  const intervalHours = toPositiveNumber(
    process.env.ML_RETRAIN_INTERVAL_HOURS,
    0,
  );

  if (!intervalHours || retrainingInterval) {
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`Starting ML retraining job every ${intervalHours} hour(s)`);

  retrainingInterval = setInterval(() => {
    runMlRetraining({
      activateOnTrain: true,
      notes: "scheduled_retraining_job",
    }).catch((error) => {
      console.error("Scheduled ML retraining failed:", error.message);
    });
  }, intervalMs);
};

export const stopMlRetrainingJob = () => {
  if (retrainingInterval) {
    clearInterval(retrainingInterval);
    retrainingInterval = null;
    console.log("ML retraining job stopped");
  }
};

export default {
  getMlLifecycleStatus,
  promoteMlModelVersion,
  runMlRetraining,
  startMlRetrainingJob,
  stopMlRetrainingJob,
};
