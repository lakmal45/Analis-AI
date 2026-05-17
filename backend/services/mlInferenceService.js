import axios from "axios";
import { flattenFeatureSnapshot } from "./mlDatasetService.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";
const ML_REQUEST_TIMEOUT_MS = Number(process.env.ML_REQUEST_TIMEOUT_MS || 5000);

export const getMlServiceHealth = async () => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: ML_REQUEST_TIMEOUT_MS,
    });

    return response.data;
  } catch (error) {
    return {
      ok: false,
      message: error.message,
      serviceUrl: ML_SERVICE_URL,
    };
  }
};

export const getMlModelRegistry = async () => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/models`, {
      timeout: ML_REQUEST_TIMEOUT_MS,
    });

    return {
      ok: true,
      ...response.data,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.response?.data?.detail || error.message,
      serviceUrl: ML_SERVICE_URL,
    };
  }
};

export const getLatestTrainingRun = async () => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/training/latest`, {
      timeout: ML_REQUEST_TIMEOUT_MS,
    });

    return {
      ok: true,
      ...response.data,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.response?.data?.detail || error.message,
      serviceUrl: ML_SERVICE_URL,
    };
  }
};

export const requestMlTraining = async (payload = {}) => {
  const response = await axios.post(`${ML_SERVICE_URL}/train`, payload, {
    timeout: Math.max(ML_REQUEST_TIMEOUT_MS, 60000),
  });

  return response.data;
};

export const requestFeatureSnapshot = async (candles, options = {}) => {
  const response = await axios.post(
    `${ML_SERVICE_URL}/features`,
    {
      candles,
      options,
    },
    {
      timeout: ML_REQUEST_TIMEOUT_MS,
    },
  );

  return response.data;
};

export const activateMlModelVersion = async (modelVersion) => {
  const response = await axios.post(
    `${ML_SERVICE_URL}/models/${encodeURIComponent(modelVersion)}/activate`,
    {},
    {
      timeout: ML_REQUEST_TIMEOUT_MS,
    },
  );

  return response.data;
};

export const predictSignalWinProbability = async (featureSnapshot, metadata = {}) => {
  if (!featureSnapshot) {
    return {
      available: false,
      reason: "missing_feature_snapshot",
    };
  }

  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      {
        features: flattenFeatureSnapshot(featureSnapshot),
        metadata,
      },
      {
        timeout: ML_REQUEST_TIMEOUT_MS,
      },
    );

    const probability = Number(response.data?.probability);
    if (!Number.isFinite(probability)) {
      return {
        available: false,
        reason: "invalid_probability",
      };
    }

    return {
      available: true,
      probability,
      rawProbability: Number(response.data?.rawProbability),
      modelVersion: response.data?.modelVersion || null,
      featureVersion: response.data?.featureVersion || null,
      metrics: response.data?.metrics || {},
      promotion: response.data?.promotion || {},
    };
  } catch (error) {
    return {
      available: false,
      reason: error.response?.data?.detail || error.message,
    };
  }
};

export default {
  activateMlModelVersion,
  getMlServiceHealth,
  getLatestTrainingRun,
  getMlModelRegistry,
  predictSignalWinProbability,
  requestFeatureSnapshot,
  requestMlTraining,
};
