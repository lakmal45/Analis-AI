import { useState } from "react";
import { useAuth } from "../context/useAuth";
import api from "../api/api";
import GlassCard from "../components/GlassCard";

const Settings = () => {
  const { user } = useAuth();
  
  // Profile State
  const [draftProfile, setDraftProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    signals: true,
  });

  const profile = draftProfile || {
    username: user?.username || "",
    email: user?.email || "",
  };

  const handleProfileSave = async () => {
    try {
      setSaving(true);
      setSaveMsg("");
      await api.put("/auth/profile", profile);
      setSaveMsg("Profile updated successfully!");
    } catch (error) {
      setSaveMsg(
        `Failed to update profile: ${error.response?.data?.message || error.message}`
      );
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const toggleNotification = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-gray-400">
            Manage your profile settings, notification preferences, and API integrations.
          </p>
        </div>
      </div>

      {saveMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            saveMsg.includes("Failed")
              ? "border-red-400/30 bg-red-400/10 text-red-300"
              : "border-green-400/30 bg-green-500/10 text-green-300"
          }`}
        >
          {saveMsg}
        </div>
      )}

      {/* --- Profile Settings --- */}
      <GlassCard className="p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">Profile Settings</h2>
          <p className="mt-1 text-sm text-gray-400">
            Update your personal details and email address.
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Username
            </label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) =>
                setDraftProfile({ ...profile, username: e.target.value })
              }
              className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Email
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) =>
                setDraftProfile({ ...profile, email: e.target.value })
              }
              className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleProfileSave}
            disabled={saving}
            className="rounded-lg bg-violet-600 px-6 py-2 font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-900/60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </GlassCard>

      {/* --- Notifications --- */}
      <GlassCard className="p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">Notifications</h2>
          <p className="mt-1 text-sm text-gray-400">
            Choose how and when you want to receive trading signals and system updates.
          </p>
        </div>
        
        <div className="space-y-1">
          {[
            {
              key: "email",
              label: "Email Notifications",
              description: "Receive trading signals via email",
            },
            {
              key: "push",
              label: "Push Notifications",
              description: "Get real-time alerts in browser",
            },
            {
              key: "signals",
              label: "Signal Alerts",
              description: "Notify when new signals are generated",
            },
          ].map((setting) => (
            <div
              key={setting.key}
              className="flex items-center justify-between py-3.5 border-b border-white/5 last:border-0"
            >
              <div>
                <p className="font-medium text-white">{setting.label}</p>
                <p className="text-sm text-gray-400 mt-0.5">{setting.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={notifications[setting.key]}
                  onChange={() => toggleNotification(setting.key)}
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 border border-white/10"></div>
              </label>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* --- API Configuration --- */}
      <GlassCard className="p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">API Configuration</h2>
          <p className="mt-1 text-sm text-gray-400">
            View current server configuration and live API connections.
          </p>
        </div>
        
        <p className="text-sm text-gray-400 mb-4">
          API keys are configured on the server via environment variables for security.
          Contact your administrator to update them.
        </p>
        <div className="space-y-1">
          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
            <span className="text-gray-300 font-medium">OpenRouter API</span>
            <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">
              Configured on Server
            </span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
            <span className="text-gray-300 font-medium">Binance API</span>
            <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">
              Public (No Key Needed)
            </span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default Settings;
