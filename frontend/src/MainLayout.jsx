import React from "react";
import Sidebar from "./Sidebar";
import TopNavbar from "./TopNavbar";
import AIPanel from "./AIPanel";

const MainLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex bg-zinc-900 text-white">
      <aside className="w-64 p-4 border-r border-zinc-800">
        <Sidebar />
      </aside>
      <main className="flex-1 p-6">
        <TopNavbar />
        <div className="mt-4">{children}</div>
      </main>
      <aside className="w-96 p-4 border-l border-zinc-800">
        <AIPanel />
      </aside>
    </div>
  );
};

export default MainLayout;
