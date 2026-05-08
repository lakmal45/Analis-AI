import React from "react";

const Sidebar = () => {
  const items = [
    "Dashboard",
    "Markets",
    "AI Analysis",
    "Watchlist",
    "Signals",
    "Portfolio",
    "Strategies",
    "News",
    "Alerts",
    "Settings",
  ];
  return (
    <nav>
      <div className="mb-6 text-xl font-bold">AnalisAI</div>
      <ul>
        {items.map((it) => (
          <li key={it} className="py-2 hover:bg-zinc-800 rounded px-2">
            {it}
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Sidebar;
