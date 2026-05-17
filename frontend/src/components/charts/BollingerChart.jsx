import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries } from "lightweight-charts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const BollingerChart = ({
  symbol = "BTCUSDT",
  interval = "1h",
  height = 300,
}) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let resizeHandler = null;
    let chartInstance = null;

    const fetchDataAndCreateChart = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_URL}/api/indicators/${symbol}/bollinger?interval=${interval}&limit=100`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch Bollinger Bands data");
        }

        const result = await response.json();
        const { upper, middle, lower } = result.data;

        if (!isMounted) return;

        if (chartContainerRef.current) {
          chartContainerRef.current.innerHTML = "";
        }

        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: height,
          layout: { backgroundColor: "#1f2937", textColor: "#d1d5db" },
          grid: { vertLines: { color: "#374151" }, horzLines: { color: "#374151" } },
          rightPriceScale: { borderColor: "#374151" },
          timeScale: { borderColor: "#374151", timeVisible: true, secondsVisible: false },
        });

        chartInstance = chart;

        const upperSeries = chart.addSeries(LineSeries, {
          color: "#ef4444", lineWidth: 1, lineStyle: 2,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          title: "Upper",
        });
        upperSeries.setData(upper);

        const middleSeries = chart.addSeries(LineSeries, {
          color: "#3b82f6", lineWidth: 2,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          title: "Middle (SMA)",
        });
        middleSeries.setData(middle);

        const lowerSeries = chart.addSeries(LineSeries, {
          color: "#22c55e", lineWidth: 1, lineStyle: 2,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          title: "Lower",
        });
        lowerSeries.setData(lower);

        chart.timeScale().fitContent();

        resizeHandler = () => {
          if (chartContainerRef.current) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        };
        window.addEventListener("resize", resizeHandler);

        chartRef.current = chart;
        setLoading(false);
      } catch (err) {
        console.error("Error creating Bollinger Bands chart:", err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchDataAndCreateChart();

    return () => {
      isMounted = false;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (chartInstance) chartInstance.remove();
    };
  }, [symbol, interval, height]);

  return (
    <div className="bg-gray-800 rounded-xl p-4 relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800 bg-opacity-80 rounded-xl">
          <div className="text-white">Loading Bollinger Bands chart...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800 bg-opacity-80 rounded-xl">
          <div className="text-red-400">Error: {error}</div>
        </div>
      )}
      <h4 className="text-md font-semibold mb-2">
        Bollinger Bands (20, 2) - {symbol.replace("USDT", "")}/USDT
      </h4>
      <div ref={chartContainerRef} style={{ minHeight: height }} />
    </div>
  );
};

export default BollingerChart;
