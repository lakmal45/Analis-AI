import { useAuth } from "../context/useAuth";

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Profile</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 text-center shadow-lg shadow-black/20">
            <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-4xl font-bold text-white shadow-xl shadow-blue-500/20 mb-4">
              {user?.username?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <h2 className="text-xl font-semibold text-white">{user?.username || "User"}</h2>
            <p className="text-gray-400 text-sm mt-1">{user?.email || "user@email.com"}</p>
            <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Active Member</span>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 shadow-lg shadow-black/20">
            <h3 className="text-lg font-medium text-white mb-4">Account Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                <div className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white">
                  {user?.username || "User"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                <div className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white">
                  {user?.email || "user@email.com"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Member Since</label>
                <div className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Just now"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
