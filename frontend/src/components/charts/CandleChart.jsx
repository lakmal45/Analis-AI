import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

const CandleChart = ({ symbol = "BTCUSDT", interval = "1h", height = 400 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDataAndCreateChart = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch candlestick data from backend
        const response = await fetch(
          `http://localhost:5000/api/market/klines/${symbol}?interval=${interval}&limit=100`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch market data");
        }

        const klineData = await response.json();

        // Transform data for lightweight-charts
        const chartData = klineData.map((kline) => ({
          time: kline.openTime / 1000, // Convert ms to seconds
          open: kline.open,
          high: kline.high,
          low: kline.low,
          close: kline.close,
        }));

        // Clear previous chart if exists
        if (chartContainerRef.current) {
          chartContainerRef.current.innerHTML = "";
        }

        // Create chart
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: height,
          layout: {
            backgroundColor: "#1f2937",
            textColor: "#d1d5db",
          },
          grid: {
            vertLines: {
              color: "#374151",
            },
            horzLines: {
              color: "#374151",
            },
          },
          crosshair: {
            mode: 1, // Normal mode
          },
          rightPriceScale: {
            borderColor: "#374151",
          },
          timeScale: {
            borderColor: "#374151",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        // Add candlestick series
        const candlestickSeries = chart.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });

        candlestickSeries.setData(chartData);

        // Fit content
        chart.timeScale().fitContent();

        // Handle resize
        const handleResize = () => {
          if (chartContainerRef.current) {
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };

        window.addEventListener("resize", handleResize);

        chartRef.current = chart;

        setLoading(false);

        return () => {
          window.removeEventListener("resize", handleResize);
          chart.remove();
        };
      } catch (err) {
        console.error("Error creating chart:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchDataAndCreateChart();
  }, [symbol, interval, height]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-800 rounded-xl">
        <div className="text-white">Loading chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-800 rounded-xl">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{symbol} Chart</h3>
        <div className="flex space-x-2">
          {["15m", "1h", "4h", "1d"].map((tf) => (
            <button
              key={tf}
              className={`px-3 py-1 rounded ${
                interval === tf
                  ? "bg-blue-600"
                  : "bg-gray-700 hover:bg-gray-600"
              } text-sm`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div ref={chartContainerRef} />
    </div>
  );
};

export default CandleChart;
