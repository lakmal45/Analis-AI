import React, { useEffect, useState } from "react";

const Watchlist = () => {
  const [lists, setLists] = useState([]);
  const [asset, setAsset] = useState("");

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then(setLists)
      .catch(() => setLists([]));
  }, []);

  const add = async () => {
    if (!asset) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: null, assets: [asset] }),
    });
    const data = await res.json();
    setLists((l) => [data, ...l]);
    setAsset("");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Watchlist</h1>
      <div className="mt-4">
        <div className="flex gap-2">
          <input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="bg-zinc-800 rounded px-3 py-2"
            placeholder="Add symbol (e.g., BTC)"
          />
          <button
            onClick={add}
            className="bg-emerald-500 text-black px-3 py-2 rounded"
          >
            Add
          </button>
        </div>
        <ul className="mt-4">
          {lists.map((wl) => (
            <li key={wl._id} className="py-2">
              {wl.assets.join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Watchlist;
