import React, { useEffect, useState } from "react";

const Signals = () => {
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then(setSignals)
      .catch(() => setSignals([]));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Signals</h1>
      <ul className="mt-4">
        {signals.map((s) => (
          <li key={s._id} className="py-2 border-b border-zinc-800">
            <div className="flex justify-between">
              <div>
                <strong>{s.asset}</strong> — {s.timeframe} — {s.direction} —{" "}
                {s.confidence}%
              </div>
              <div>{new Date(s.createdAt).toLocaleString()}</div>
            </div>
            <div className="text-sm text-zinc-400">
              Entry: {JSON.stringify(s.entryZone)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Signals;
