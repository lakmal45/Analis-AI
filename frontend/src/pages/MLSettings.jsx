import { useState, useEffect } from "react";
import api from "../api/api";
import GlassCard from "../components/GlassCard";

const MLSettings = () => {
  // ML State
  const [mlLoading, setMlLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [mlMsg, setMlMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [models, setModels] = useState({ models: [], activeModelVersion: null });
  const [extractParams, setExtractParams] = useState({ min_signals: 60, source: "combined" });
  const [trainParams, setTrainParams] = useState({ dataset_path: "app/ml/data/training-data.csv", notes: "" });

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await api.get("/ml/models");
      if (res.data.success) {
        setModels(res.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  };

  // ML Handlers
  const showMlMsg = (msg, isError = false) => {
    setMlMsg({ text: msg, isError });
    setTimeout(() => setMlMsg(""), 5000);
  };

  const handleExtract = async () => {
    try {
      setMlLoading(true);
      const res = await api.post("/ml/extract", extractParams);
      showMlMsg(`Extraction successful! Extracted ${res.data.count} samples.`);
    } catch (error) {
      showMlMsg(`Extraction failed: ${error.response?.data?.detail || error.message}`, true);
    } finally {
      setMlLoading(false);
    }
  };

  const handleTrain = async () => {
    try {
      setMlLoading(true);
      const res = await api.post("/ml/train", trainParams);
      showMlMsg(`Training successful! Model: ${res.data.data.modelVersion}. Promoted: ${res.data.data.promotion?.eligible}`);
      fetchModels();
    } catch (error) {
      showMlMsg(`Training failed: ${error.response?.data?.detail || error.message}`, true);
    } finally {
      setMlLoading(false);
    }
  };

  const handleRetrain = async () => {
    try {
      setMlLoading(true);
      await api.post("/ml/retrain");
      showMlMsg("Automated retraining pipeline started in the background.");
    } catch (error) {
      showMlMsg(`Retrain failed: ${error.response?.data?.detail || error.message}`, true);
    } finally {
      setMlLoading(false);
    }
  };

  const handleActivate = async (version) => {
    try {
      setMlLoading(true);
      await api.post("/ml/models/activate", { version });
      showMlMsg(`Activated model: ${version}`);
      fetchModels();
    } catch (error) {
      showMlMsg(`Failed to activate: ${error.response?.data?.detail || error.message}`, true);
    } finally {
      setMlLoading(false);
    }
  };

  const handleDelete = async (version) => {
    if (!window.confirm(`Are you sure you want to delete model ${version}?`)) return;
    try {
      setMlLoading(true);
      await api.delete(`/ml/models/${version}`);
      showMlMsg(`Deleted model: ${version}`);
      fetchModels();
    } catch (error) {
      showMlMsg(`Failed to delete: ${error.response?.data?.detail || error.message}`, true);
    } finally {
      setMlLoading(false);
    }
  };

  const handleDeleteAllBacktests = async () => {
    if (!window.confirm("WARNING: Are you sure you want to delete ALL backtest runs? This action cannot be undone.")) return;
    try {
      setDataLoading(true);
      await api.delete("/backtest/history/all");
      setSaveMsg("All backtest data deleted successfully!");
    } catch (error) {
      setSaveMsg(`Failed to delete backtest data: ${error.response?.data?.detail || error.message}`);
    } finally {
      setDataLoading(false);
      setTimeout(() => setSaveMsg(""), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">ML & Data Management</h1>
          <p className="mt-1 text-gray-400">
            Control your machine learning lifecycle, manage datasets, train predictive models, and perform database maintenance directly from your dashboard.
          </p>
        </div>
      </div>

      {saveMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            saveMsg.includes("Failed")
              ? "border-red-400/30 bg-red-400/10 text-red-300"
              : "border-green-400/30 bg-green-500/10 text-green-300"
          }`}
        >
          {saveMsg}
        </div>
      )}

      {mlMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            mlMsg.isError
              ? "border-red-400/30 bg-red-400/10 text-red-300"
              : "border-green-400/30 bg-green-500/10 text-green-300"
          }`}
        >
          {mlMsg.text}
        </div>
      )}

      {/* --- Machine Learning Dashboard --- */}
      <GlassCard className="p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">Model Lifecycle</h2>
          <p className="mt-1 text-sm text-gray-400">
            Extract, train, and orchestrate ML pipelines.
          </p>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          
          {/* Extract Data Form */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold border border-violet-500/30">1</span>
              Extract Backtest Data
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Minimum Signals</label>
                <input 
                  type="number" 
                  value={extractParams.min_signals}
                  onChange={e => setExtractParams({...extractParams, min_signals: parseInt(e.target.value)})}
                  className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Data Source</label>
                <select 
                  value={extractParams.source}
                  onChange={e => setExtractParams({...extractParams, source: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                >
                  <option value="combined" className="bg-gray-800 text-white">Combined Data</option>
                  <option value="signals" className="bg-gray-800 text-white">Live Signals Only</option>
                  <option value="backtests" className="bg-gray-800 text-white">Backtests Only</option>
                </select>
              </div>
              <button 
                onClick={handleExtract}
                disabled={mlLoading}
                className="w-full rounded-lg bg-violet-600 px-4 py-2 font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-900/60"
              >
                {mlLoading ? "Processing..." : "Start Extraction"}
              </button>
            </div>
          </div>

          {/* Train Model Form */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold border border-violet-500/30">2</span>
              Train New Model
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Dataset Path</label>
                <input 
                  type="text" 
                  value={trainParams.dataset_path}
                  onChange={e => setTrainParams({...trainParams, dataset_path: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Model Notes</label>
                <input 
                  type="text" 
                  value={trainParams.notes}
                  onChange={e => setTrainParams({...trainParams, notes: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                  placeholder="e.g., Experimental features v4"
                />
              </div>
              <button 
                onClick={handleTrain}
                disabled={mlLoading}
                className="w-full rounded-lg bg-violet-600 px-4 py-2 font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-900/60"
              >
                {mlLoading ? "Training..." : "Initialize Training"}
              </button>
            </div>
          </div>
        </div>

        {/* Retrain Pipeline */}
        <div className="mb-6 p-6 rounded-xl border border-violet-500/30 bg-violet-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Automated Retraining Pipeline
            </h4>
            <p className="text-sm text-gray-400 mt-1 max-w-lg">
              One-click orchestration that runs extraction and training sequentially in the background. Does not block your workflow.
            </p>
          </div>
          <button 
            onClick={handleRetrain}
            disabled={mlLoading}
            className="shrink-0 rounded-lg bg-violet-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-900/60 text-center w-full md:w-auto z-10"
          >
            Run Background Pipeline
          </button>
        </div>

        {/* Model Registry Table */}
        <div className="mt-8">
          <div className="flex justify-between items-end mb-4 px-1">
            <h2 className="text-xl font-semibold text-white">Model Registry</h2>
            <button 
              onClick={fetchModels}
              disabled={mlLoading}
              className="text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.05]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
          
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-400">
                  <th className="py-3 px-4 font-medium">Version / ID</th>
                  <th className="py-3 px-4 font-medium">Trained At</th>
                  <th className="py-3 px-4 font-medium">ROC AUC</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.models?.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        No models found in registry.
                      </div>
                    </td>
                  </tr>
                ) : (
                  models.models?.map((model) => (
                    <tr key={model.modelVersion} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-gray-300 font-medium">
                            {model.modelVersion}
                          </span>
                          {models.activeModelVersion === model.modelVersion && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(model.trainedAt).toLocaleString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-white/[0.05] text-gray-300 border border-white/[0.1]">
                          {model.metrics?.rocAuc?.toFixed(4) || "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {models.activeModelVersion !== model.modelVersion && (
                            <button
                              onClick={() => handleActivate(model.modelVersion)}
                              disabled={mlLoading}
                              className="text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50 hover:underline underline-offset-4"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(model.modelVersion)}
                            disabled={mlLoading || models.activeModelVersion === model.modelVersion}
                            className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 hover:underline underline-offset-4"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </GlassCard>

      {/* --- Data Management (Danger Zone) --- */}
      <GlassCard className="p-6 border border-red-500/20 hover:border-red-500/30 transition-colors duration-200">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
          <p className="mt-1 text-sm text-red-300/70">Irreversible data destruction operations.</p>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-red-500/5 p-5 rounded-xl border border-red-500/10">
            <div>
              <p className="font-semibold text-gray-200">Delete All Backtest Data</p>
              <p className="text-sm text-gray-400 mt-1 max-w-md">
                Permanently remove all backtest runs and associated metrics from the database. This action will immediately destroy historical data.
              </p>
            </div>
            <button
              onClick={handleDeleteAllBacktests}
              disabled={dataLoading}
              className="shrink-0 rounded-lg border border-red-400/30 bg-red-500/90 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 whitespace-nowrap flex items-center gap-2"
            >
              {dataLoading ? "Processing..." : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete All Data
                </>
              )}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default MLSettings;
