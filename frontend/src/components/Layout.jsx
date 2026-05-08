import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useNavigate } from "react-router-dom";

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "📊" },
    { path: "/analysis", label: "Analysis", icon: "📈" },
    { path: "/watchlist", label: "Watchlist", icon: "👁️" },
    { path: "/signals", label: "Signals", icon: "🔔" },
    { path: "/chat", label: "AI Chat", icon: "🤖" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-64" : "w-20"} bg-gray-800 transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700">
          {sidebarOpen ? (
            <h1 className="text-xl font-bold text-blue-400">AnalisAI</h1>
          ) : (
            <span className="text-2xl">🤖</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700"
                }`
              }
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-gray-700">
          {sidebarOpen ? (
            <div>
              <p className="text-sm font-medium">{user?.username}</p>
              <button
                onClick={handleLogout}
                className="mt-2 text-sm text-red-400 hover:text-red-300"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="text-xl hover:text-red-400"
              title="Logout"
            >
              🚪
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-400 hover:text-white"
            >
              ☰
            </button>
            <h2 className="text-lg font-semibold">AI Trading Intelligence</h2>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
              title={
                isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"
              }
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
            <button
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2"
            >
              <span>🤖</span>
              <span>AI Assistant</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant Panel */}
      {aiPanelOpen && (
        <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700">
            <h3 className="font-semibold">AI Assistant</h3>
            <button
              onClick={() => setAiPanelOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 p-4">
            <div className="text-center text-gray-400 mt-8">
              <p>AI Chat Interface</p>
              <p className="text-sm mt-2">Coming soon...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
