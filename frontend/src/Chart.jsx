import React, { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";
import { io } from "socket.io-client";

const Chart = () => {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 400,
      layout: { backgroundColor: "#0f172a", textColor: "#e5e7eb" },
    });
    const lineSeries = chart.addLineSeries({ color: "#10b981" });

    const socket = io("http://localhost:4000");
    socket.on("prices", (payload) => {
      const btc = payload?.data?.bitcoin?.usd;
      const ts = Math.floor(Date.now() / 1000);
      if (btc) lineSeries.update({ time: ts, value: btc });
    });

    const handleResize = () =>
      chart.applyOptions({ width: ref.current.clientWidth });
    window.addEventListener("resize", handleResize);

    return () => {
      socket.disconnect();
      chart.remove();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <div ref={ref} />;
};

export default Chart;
