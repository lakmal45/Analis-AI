import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

const RSChart = ({ symbol = "BTCUSDT", interval = "1h", height = 200 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDataAndCreateChart = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch RSI data from backend
        const response = await fetch(
          `http://localhost:5000/api/indicators/${symbol}/rsi?interval=${interval}&limit=100`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch RSI data");
        }

        const result = await response.json();
        const rsiData = result.data;

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

        // Add RSI line series
        const rsiSeries = chart.addLineSeries({
          color: "#eab308",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: 2,
            minMove: 0.01,
          },
        });

        rsiSeries.setData(rsiData);

        // Add overbought/oversold lines
        const overboughtLine = chart.addLineSeries({
          color: "#ef4444",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          priceFormat: {
            type: "price",
            precision: 0,
          },
        });

        const oversoldLine = chart.addLineSeries({
          color: "#22c55e",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          priceFormat: {
            type: "price",
            precision: 0,
          },
        });

        // Add horizontal lines at 70 and 30
        const overboughtData = rsiData.map((d) => ({
          time: d.time,
          value: 70,
        }));
        const oversoldData = rsiData.map((d) => ({ time: d.time, value: 30 }));

        overboughtLine.setData(overboughtData);
        oversoldLine.setData(oversoldData);

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
        console.error("Error creating RSI chart:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchDataAndCreateChart();
  }, [symbol, interval, height]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-xl">
        <div className="text-white">Loading RSI chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-xl">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h4 className="text-md font-semibold mb-2">
        RSI (14) - {symbol.replace("USDT", "")}/USDT
      </h4>
      <div ref={chartContainerRef} />
    </div>
  );
};

export default RSChart;
