import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, HistogramSeries } from "lightweight-charts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const MACDChart = ({ symbol = "BTCUSDT", interval = "1h", height = 300 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDataAndCreateChart = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch MACD data from backend
        const response = await fetch(
          `${API_URL}/api/indicators/${symbol}/macd?interval=${interval}&limit=100`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch MACD data");
        }

        const result = await response.json();
        const { macdLine, signalLine, histogram } = result.data;

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
          rightPriceScale: {
            borderColor: "#374151",
          },
          timeScale: {
            borderColor: "#374151",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        // Add MACD line
        const macdSeries = chart.addSeries(LineSeries, {
          color: "#3b82f6",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: 4,
            minMove: 0.0001,
          },
          title: "MACD",
        });

        macdSeries.setData(macdLine);

        // Add Signal line
        const signalSeries = chart.addSeries(LineSeries, {
          color: "#ef4444",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: 4,
            minMove: 0.0001,
          },
          title: "Signal",
        });

        signalSeries.setData(signalLine);

        // Add Histogram
        const histogramSeries = chart.addSeries(HistogramSeries, {
          priceFormat: {
            type: "price",
            precision: 4,
            minMove: 0.0001,
          },
          title: "Histogram",
        });

        const histogramData = histogram.map((item) => ({
          time: item.time,
          value: item.value,
          color: item.value >= 0 ? "#22c55e" : "#ef4444",
        }));

        histogramSeries.setData(histogramData);

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
        console.error("Error creating MACD chart:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchDataAndCreateChart();
  }, [symbol, interval, height]);

  return (
    <div className="bg-gray-800 rounded-xl p-4 relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800 bg-opacity-80 rounded-xl">
          <div className="text-white">Loading MACD chart...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800 bg-opacity-80 rounded-xl">
          <div className="text-red-400">Error: {error}</div>
        </div>
      )}
      <h4 className="text-md font-semibold mb-2">
        MACD - {symbol.replace("USDT", "")}/USDT
      </h4>
      <div ref={chartContainerRef} style={{ minHeight: height }} />
    </div>
  );
};

export default MACDChart;
