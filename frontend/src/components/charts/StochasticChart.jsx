import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

const StochasticChart = ({
  symbol = "BTCUSDT",
  interval = "1h",
  height = 200,
}) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDataAndCreateChart = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch Stochastic data from backend
        const response = await fetch(
          `http://localhost:5000/api/indicators/${symbol}/stochastic?interval=${interval}&limit=100`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch Stochastic data");
        }

        const result = await response.json();
        const { percentK, percentD } = result.data;

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
            minValue: 0,
            maxValue: 100,
          },
          timeScale: {
            borderColor: "#374151",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        // Add %K line
        const kSeries = chart.addLineSeries({
          color: "#3b82f6",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: 2,
            minMove: 0.01,
          },
          title: "%K",
        });
        kSeries.setData(percentK);

        // Add %D line
        const dSeries = chart.addLineSeries({
          color: "#ef4444",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: 2,
            minMove: 0.01,
          },
          title: "%D",
        });
        dSeries.setData(percentD);

        // Add overbought line (80)
        const overboughtLine = chart.addLineSeries({
          color: "#ef4444",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          priceFormat: {
            type: "price",
            precision: 0,
          },
        });
        const overboughtData = percentK.map((d) => ({
          time: d.time,
          value: 80,
        }));
        overboughtLine.setData(overboughtData);

        // Add oversold line (20)
        const oversoldLine = chart.addLineSeries({
          color: "#22c55e",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          priceFormat: {
            type: "price",
            precision: 0,
          },
        });
        const oversoldData = percentK.map((d) => ({ time: d.time, value: 20 }));
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
        console.error("Error creating Stochastic chart:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchDataAndCreateChart();
  }, [symbol, interval, height]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-xl">
        <div className="text-white">Loading Stochastic chart...</div>
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
        Stochastic (14,3,3) - {symbol.replace("USDT", "")}/USDT
      </h4>
      <div ref={chartContainerRef} />
    </div>
  );
};

export default StochasticChart;
