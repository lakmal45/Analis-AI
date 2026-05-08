import React from "react";

const TopNavbar = () => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <input
          placeholder="Search markets..."
          className="bg-zinc-800 rounded px-3 py-2"
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="bg-zinc-800 px-3 py-2 rounded">Notifications</button>
        <button className="bg-zinc-800 px-3 py-2 rounded">Profile</button>
      </div>
    </div>
  );
};

export default TopNavbar;
