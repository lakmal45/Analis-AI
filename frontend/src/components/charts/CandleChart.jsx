import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const CandleChart = ({ symbol = "BTCUSDT", interval: initialInterval = "1h", height = 400 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [interval, setInterval] = useState(initialInterval);

  useEffect(() => {
    let cleanup;
    const fetchDataAndCreateChart = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_URL}/api/market/klines/${symbol}?interval=${interval}&limit=100`);
        if (!response.ok) throw new Error("Failed to fetch market data");
        const klineData = await response.json();
        const chartData = klineData.map((kline) => ({ time: kline.openTime / 1000, open: kline.open, high: kline.high, low: kline.low, close: kline.close }));
        if (chartContainerRef.current) chartContainerRef.current.innerHTML = "";
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth, height,
          layout: { backgroundColor: "#1f2937", textColor: "#d1d5db" },
          grid: { vertLines: { color: "#374151" }, horzLines: { color: "#374151" } },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: "#374151" },
          timeScale: { borderColor: "#374151", timeVisible: true, secondsVisible: false },
        });
        const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
        series.setData(chartData);
        chart.timeScale().fitContent();
        const handleResize = () => { if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth }); };
        window.addEventListener("resize", handleResize);
        chartRef.current = chart;
        setLoading(false);
        cleanup = () => { window.removeEventListener("resize", handleResize); chart.remove(); };
      } catch (err) {
        console.error("Error creating chart:", err);
        setError(err.message);
        setLoading(false);
      }
    };
    fetchDataAndCreateChart();
    return () => { if (cleanup) cleanup(); };
  }, [symbol, interval, height]);

  return (
    <div className="bg-gray-800 rounded-xl p-4 relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800 bg-opacity-80 rounded-xl">
          <div className="text-white">Loading chart...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800 bg-opacity-80 rounded-xl">
          <div className="text-red-400">Error: {error}</div>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{symbol} Chart</h3>
        <div className="flex space-x-2">
          {["15m", "1h", "4h", "1d"].map((tf) => (
            <button key={tf} onClick={() => setInterval(tf)} className={`px-3 py-1 rounded ${interval === tf ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"} text-sm`}>
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div ref={chartContainerRef} style={{ minHeight: height }} />
    </div>
  );
};

export default CandleChart;
