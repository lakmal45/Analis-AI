import { useEffect, useState } from "react";
import api from "../api/api";
import { AuthContext } from "./authContext";

export const AuthProvider = ({ children }) => {
  const storedToken =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(storedToken));
  const [error, setError] = useState(null);

  const register = async (username, email, password) => {
    try {
      setError(null);
      const { data } = await api.post("/auth/register", {
        username,
        email,
        password,
      });

      localStorage.setItem("token", data.token);
      setUser(data);
      return { success: true };
    } catch (error) {
      setError(error.response?.data?.message || "Registration failed");
      return { success: false, error: error.response?.data?.message };
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      const { data } = await api.post("/auth/login", {
        email,
        password,
      });

      localStorage.setItem("token", data.token);
      setUser(data);
      return { success: true };
    } catch (error) {
      setError(error.response?.data?.message || "Login failed");
      return { success: false, error: error.response?.data?.message };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const getToken = () => localStorage.getItem("token");

  useEffect(() => {
    if (!storedToken) return undefined;

    let isMounted = true;

    const fetchUserProfile = async () => {
      try {
        const { data } = await api.get("/auth/profile");
        if (isMounted) {
          setUser(data);
        }
      } catch {
        localStorage.removeItem("token");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUserProfile();

    return () => {
      isMounted = false;
    };
  }, [storedToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        register,
        login,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
