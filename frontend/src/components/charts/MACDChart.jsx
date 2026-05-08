import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

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
          `http://localhost:5000/api/indicators/${symbol}/macd?interval=${interval}&limit=100`,
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
        const macdSeries = chart.addLineSeries({
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
        const signalSeries = chart.addLineSeries({
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
        const histogramSeries = chart.addHistogramSeries({
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-72 bg-gray-800 rounded-xl">
        <div className="text-white">Loading MACD chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-72 bg-gray-800 rounded-xl">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h4 className="text-md font-semibold mb-2">
        MACD - {symbol.replace("USDT", "")}/USDT
      </h4>
      <div ref={chartContainerRef} />
    </div>
  );
};

export default MACDChart;
