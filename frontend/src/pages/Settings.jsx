import { useState } from "react";
import { useAuth } from "../context/useAuth";
import api from "../api/api";

const Settings = () => {
  const { user } = useAuth();
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
        `Failed to update profile: ${error.response?.data?.message || error.message}`,
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
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold">Settings</h2>

      {saveMsg && (
        <div
          className={`px-4 py-3 rounded ${
            saveMsg.includes("Failed")
              ? "bg-red-500/20 border border-red-500 text-red-200"
              : "bg-green-500/20 border border-green-500 text-green-200"
          }`}
        >
          {saveMsg}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">Profile Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) =>
                setDraftProfile({ ...profile, username: e.target.value })
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) =>
                setDraftProfile({ ...profile, email: e.target.value })
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleProfileSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">Notifications</h3>
        <div className="space-y-4">
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
              className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0"
            >
              <div>
                <p className="font-medium">{setting.label}</p>
                <p className="text-sm text-gray-400">{setting.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={notifications[setting.key]}
                  onChange={() => toggleNotification(setting.key)}
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">API Configuration</h3>
        <p className="text-sm text-gray-400 mb-4">
          API keys are configured on the server via environment variables for security.
          Contact your administrator to update them.
        </p>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-300">OpenRouter API</span>
            <span className="text-sm px-3 py-1 bg-green-500/20 text-green-400 rounded-full">
              Configured on Server
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-300">Binance API</span>
            <span className="text-sm px-3 py-1 bg-green-500/20 text-green-400 rounded-full">
              Public (No Key Needed)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
