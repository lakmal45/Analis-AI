import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import SignalCard from "../components/SignalCard";
import GlassCard from "../components/GlassCard";
import api from "../api/api";

const Signals = () => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ACTIVE");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filter !== "ALL") params.append("status", filter);
      else params.append("status", "ALL");
      if (selectedSymbol) params.append("symbol", selectedSymbol);

      const response = await api.get(`/signals?${params.toString()}`);
      setSignals(response.data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, selectedSymbol]);

  const generateSignal = async (symbol) => {
    if (!symbol) return;
    try {
      setGenerating(true);
      const response = await api.post("/signals/generate", { symbol: symbol.toUpperCase() });
      alert(`Signal generated: ${response.data.data.type} with ${response.data.data.confidence}% confidence`);
      fetchSignals();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const updateSignalStatus = async (signalId, status) => {
    try {
      await api.put(`/signals/${signalId}/status`, { status });
      fetchSignals();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const deleteSignal = async (signalId) => {
    if (!window.confirm("Are you sure you want to delete this signal?")) return;
    try {
      await api.delete(`/signals/${signalId}`);
      fetchSignals();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const symbols = [...new Set(signals.map((s) => s.symbol))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Trading Signals</h1>
          <p className="text-gray-400 mt-1">AI-generated buy/sell signals based on technical analysis</p>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Symbol (e.g., BTCUSDT)" value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())} className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => generateSignal(selectedSymbol || "BTCUSDT")} disabled={generating} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg font-medium transition-colors">
            {generating ? "Generating..." : "Generate Signal"}
          </button>
        </div>
      </div>
      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-2">
          {["ACTIVE", "ALL", "COMPLETED", "CANCELLED"].map((status) => (
            <button key={status} onClick={() => setFilter(status)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status ? "bg-blue-600 text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}>
              {status}
            </button>
          ))}
          {symbols.length > 0 && (
            <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)} className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Symbols</option>
              {symbols.map((sym) => (<option key={sym} value={sym}>{sym}</option>))}
            </select>
          )}
        </div>
      </GlassCard>
      {error && (<GlassCard className="p-4 border-red-400/30 bg-red-400/10"><p className="text-red-400">{error}</p></GlassCard>)}
      {loading && (<div className="text-center py-12"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div><p className="text-gray-400 mt-4">Loading signals...</p></div>)}
      {!loading && signals.length === 0 && (
        <GlassCard className="p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-white mb-2">No signals found</h3>
          <p className="text-gray-400 mb-6">{filter === "ACTIVE" ? "No active signals. Generate a new signal to get started." : "No signals match your current filters."}</p>
          <button onClick={() => generateSignal("BTCUSDT")} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Generate First Signal</button>
        </GlassCard>
      )}
      {!loading && signals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {signals.map((signal) => (<SignalCard key={signal._id} signal={signal} onUpdateStatus={updateSignalStatus} showActions={true} />))}
        </div>
      )}
      {!loading && signals.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center"><p className="text-3xl font-bold text-green-400">{signals.filter((s) => s.type === "BUY").length}</p><p className="text-sm text-gray-400">BUY Signals</p></div>
            <div className="text-center"><p className="text-3xl font-bold text-red-400">{signals.filter((s) => s.type === "SELL").length}</p><p className="text-sm text-gray-400">SELL Signals</p></div>
            <div className="text-center"><p className="text-3xl font-bold text-yellow-400">{signals.filter((s) => s.type === "HOLD").length}</p><p className="text-sm text-gray-400">HOLD Signals</p></div>
            <div className="text-center"><p className="text-3xl font-bold text-blue-400">{signals.length}</p><p className="text-sm text-gray-400">Total Signals</p></div>
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default Signals;
